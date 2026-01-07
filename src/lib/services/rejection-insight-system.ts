/**
 * Rejection Insight System
 *
 * Parses rejection emails and application feedback to extract actionable insights.
 * Uses AI to identify patterns and generate strategic recommendations.
 */

import OpenAI from 'openai';
import { db } from '@/drizzle/db';
import { jobApplications } from '@/drizzle/schema';
import { eq, and, inArray, gte, desc } from 'drizzle-orm';
import { createRejectionInsightDirective } from './strategic-directives-service';

// ============================================================================
// Types
// ============================================================================

export interface RejectionEmail {
  applicationId: string;
  subject: string;
  body: string;
  receivedAt: Date;
  from: string;
}

export interface RejectionInsight {
  pattern: string;
  category: 'experience' | 'skills' | 'cultural_fit' | 'competition' | 'timing' | 'other';
  severity: 'high' | 'medium' | 'low';
  confidence: number; // 0-1
  affectedApplications: number;
  recommendation: string;
  examples: string[];
}

export interface ParsedRejection {
  isRejection: boolean;
  confidence: number;
  reason?: string;
  category?: RejectionInsight['category'];
  feedback?: string;
  actionableInsights?: string[];
}

// ============================================================================
// Email Parsing
// ============================================================================

/**
 * Parse rejection email using AI
 */
export async function parseRejectionEmail(
  email: RejectionEmail
): Promise<ParsedRejection> {
  const openai = new OpenAI();

  const prompt = `Analyze this job application email and determine if it's a rejection. If it is, extract any feedback or insights.

Email Subject: ${email.subject}
Email Body:
${email.body}

Return a JSON object with:
{
  "isRejection": boolean,
  "confidence": number (0-1),
  "reason": string (brief reason for rejection, if mentioned),
  "category": "experience" | "skills" | "cultural_fit" | "competition" | "timing" | "other",
  "feedback": string (any specific feedback given),
  "actionableInsights": string[] (list of actionable takeaways)
}

Only set isRejection=true if you're confident it's a rejection (not just a "no longer moving forward" for a specific role while keeping candidate in pool).`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at analyzing job application emails. Extract rejection reasons and actionable insights. Return ONLY valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    const parsed = JSON.parse(content) as ParsedRejection;

    // Update application status if confirmed rejection
    if (parsed.isRejection && parsed.confidence >= 0.7) {
      await db
        .update(jobApplications)
        .set({
          status: 'rejected',
          last_activity_at: new Date(),
          raw_data: {
            rejection_reason: parsed.reason,
            rejection_category: parsed.category,
            rejection_feedback: parsed.feedback,
            rejection_confidence: parsed.confidence,
          },
        })
        .where(eq(jobApplications.id, email.applicationId));
    }

    return parsed;
  } catch (error) {
    console.error('[parseRejectionEmail] Failed:', error);
    return {
      isRejection: false,
      confidence: 0,
    };
  }
}

// ============================================================================
// Pattern Detection
// ============================================================================

/**
 * Analyze rejection patterns across multiple applications
 */
export async function analyzeRejectionPatterns(
  userId: string,
  lookbackDays: number = 30
): Promise<RejectionInsight[]> {
  const openai = new OpenAI();

  // Get recent rejected applications
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  const rejections = await db.query.jobApplications.findMany({
    where: and(
      eq(jobApplications.user_id, userId),
      eq(jobApplications.status, 'rejected'),
      gte(jobApplications.updated_at, cutoffDate)
    ),
    with: {
      jobListing: true,
    },
    orderBy: [desc(jobApplications.updated_at)],
  });

  if (rejections.length < 3) {
    return []; // Not enough data for pattern analysis
  }

  // Prepare rejection data for AI analysis
  const rejectionData = rejections.map((app) => ({
    jobTitle: app.jobListing?.title || 'Unknown',
    company: app.jobListing?.company || 'Unknown',
    reason: app.raw_data?.rejection_reason || 'No reason provided',
    category: app.raw_data?.rejection_category || 'other',
    feedback: app.raw_data?.rejection_feedback,
  }));

  const prompt = `Analyze these job application rejections and identify patterns or common themes.

Rejections (${rejections.length} total):
${JSON.stringify(rejectionData, null, 2)}

Identify up to 3 most significant patterns. For each pattern, provide:
{
  "patterns": [
    {
      "pattern": "Clear description of the pattern",
      "category": "experience" | "skills" | "cultural_fit" | "competition" | "timing" | "other",
      "severity": "high" | "medium" | "low",
      "confidence": number (0-1),
      "affectedApplications": number (how many rejections match this pattern),
      "recommendation": "Specific actionable recommendation to address this",
      "examples": ["Example 1", "Example 2"]
    }
  ]
}

Focus on actionable patterns (things the candidate can improve), not external factors.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a career strategist analyzing job rejection patterns. Provide actionable insights. Return ONLY valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    const result = JSON.parse(content) as { patterns: RejectionInsight[] };
    return result.patterns || [];
  } catch (error) {
    console.error('[analyzeRejectionPatterns] Failed:', error);
    return [];
  }
}

/**
 * Generate rejection insights and create strategic directives
 */
export async function generateRejectionInsights(
  userId: string,
  lookbackDays: number = 30
): Promise<{
  insights: RejectionInsight[];
  directivesCreated: number;
  directiveIds: string[];
}> {
  const insights = await analyzeRejectionPatterns(userId, lookbackDays);

  const directiveIds: string[] = [];

  // Create directives for high-severity insights
  for (const insight of insights) {
    if (insight.severity === 'high' || insight.severity === 'medium') {
      const directive = await createRejectionInsightDirective(userId, {
        pattern: insight.pattern,
        affectedApplications: insight.affectedApplications,
        recommendation: insight.recommendation,
      });
      directiveIds.push(directive.id);
    }
  }

  return {
    insights,
    directivesCreated: directiveIds.length,
    directiveIds,
  };
}

// ============================================================================
// Common Rejection Patterns (Rules-based)
// ============================================================================

/**
 * Quick rule-based rejection analysis (faster than AI)
 */
export function quickRejectionAnalysis(rejectionReasons: string[]): {
  commonKeywords: Record<string, number>;
  suggestedCategories: string[];
} {
  const keywords = {
    experience: [
      'experience',
      'years',
      'senior',
      'qualified',
      'background',
      'expertise',
    ],
    skills: [
      'skills',
      'technical',
      'proficiency',
      'knowledge',
      'competency',
      'requirements',
    ],
    cultural_fit: ['culture', 'fit', 'values', 'team', 'environment'],
    competition: [
      'other candidates',
      'more qualified',
      'competitive',
      'strong pool',
    ],
    timing: ['position filled', 'no longer', 'closed', 'hired'],
  };

  const keywordCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};

  for (const reason of rejectionReasons) {
    const lowerReason = reason.toLowerCase();

    for (const [category, words] of Object.entries(keywords)) {
      for (const word of words) {
        if (lowerReason.includes(word)) {
          keywordCounts[word] = (keywordCounts[word] || 0) + 1;
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        }
      }
    }
  }

  // Sort categories by frequency
  const suggestedCategories = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([category]) => category);

  return {
    commonKeywords: keywordCounts,
    suggestedCategories,
  };
}

// ============================================================================
// Rejection Statistics
// ============================================================================

/**
 * Get rejection statistics for dashboard
 */
export async function getRejectionStats(
  userId: string,
  lookbackDays: number = 30
): Promise<{
  total: number;
  byCategory: Record<string, number>;
  recentTrend: 'improving' | 'stable' | 'declining';
  averageDaysToRejection: number;
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  const rejections = await db.query.jobApplications.findMany({
    where: and(
      eq(jobApplications.user_id, userId),
      eq(jobApplications.status, 'rejected'),
      gte(jobApplications.updated_at, cutoffDate)
    ),
  });

  const byCategory: Record<string, number> = {};
  let totalDays = 0;
  let countWithDates = 0;

  for (const rejection of rejections) {
    const category = rejection.raw_data?.rejection_category || 'other';
    byCategory[category] = (byCategory[category] || 0) + 1;

    // Calculate days to rejection
    if (rejection.applied_at && rejection.updated_at) {
      const days = Math.floor(
        (rejection.updated_at.getTime() - rejection.applied_at.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      totalDays += days;
      countWithDates++;
    }
  }

  // Determine trend (comparing first half vs second half of lookback period)
  const midpoint = new Date(cutoffDate);
  midpoint.setDate(midpoint.getDate() + lookbackDays / 2);

  const firstHalf = rejections.filter(
    (r) => r.updated_at && r.updated_at < midpoint
  ).length;
  const secondHalf = rejections.length - firstHalf;

  let recentTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (secondHalf < firstHalf * 0.8) {
    recentTrend = 'improving'; // Fewer rejections recently
  } else if (secondHalf > firstHalf * 1.2) {
    recentTrend = 'declining'; // More rejections recently
  }

  const averageDaysToRejection =
    countWithDates > 0 ? Math.floor(totalDays / countWithDates) : 0;

  return {
    total: rejections.length,
    byCategory,
    recentTrend,
    averageDaysToRejection,
  };
}
