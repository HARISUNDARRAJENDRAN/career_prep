/**
 * Rejection Insight Service
 *
 * Parses rejection emails and feedback to extract actionable insights.
 * Integrates with the Strategist Agent to issue improvement directives.
 *
 * Key Features:
 * - Email text parsing with OpenAI
 * - Pattern detection across rejections
 * - Skill gap identification
 * - Improvement recommendations
 *
 * Email Sources:
 * - Manual copy/paste by user
 * - Email forwarding integration (future)
 * - API webhooks from email services (future)
 */

import OpenAI from 'openai';
import { db } from '@/drizzle/db';
import { jobApplications } from '@/drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';
import { issueRejectionInsightDirective } from '@/services/strategic-directives';
import { publishAgentEvent } from '@/lib/agents/message-bus';
import { createNotification } from '@/services/notifications';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Types
export interface RejectionEmailInput {
  user_id: string;
  application_id?: string;
  email_subject?: string;
  email_body: string;
  email_from?: string;
  received_at?: Date;
}

export interface ParsedRejection {
  // Classification
  rejection_type: 'skill_gap' | 'experience_mismatch' | 'cultural_fit' | 'competition' | 'position_filled' | 'generic' | 'unknown';
  
  // Is this actually a rejection?
  is_rejection: boolean;
  confidence: number;
  
  // Extracted information
  company?: string;
  role?: string;
  
  // Feedback analysis
  feedback_sentiment: 'positive' | 'neutral' | 'negative';
  has_specific_feedback: boolean;
  
  // Skill gaps mentioned
  skill_gaps: Array<{
    skill: string;
    context: string;
    importance: 'critical' | 'nice_to_have' | 'unknown';
  }>;
  
  // Action items
  actionable_items: string[];
  
  // Future opportunity signals
  future_opportunity_hint: boolean;
  keep_in_touch_suggested: boolean;
  
  // Raw analysis
  summary: string;
  raw_analysis: string;
}

export interface RejectionPattern {
  pattern_type: 'skill_gap' | 'experience' | 'company_size' | 'industry' | 'interview_stage';
  pattern_description: string;
  frequency: number;
  affected_applications: string[];
  recommended_action: string;
}

export interface RejectionAnalysisReport {
  user_id: string;
  period_days: number;
  total_rejections: number;
  analyzed_rejections: number;
  
  // Patterns
  patterns: RejectionPattern[];
  
  // Aggregated skill gaps
  top_skill_gaps: Array<{
    skill: string;
    mentions: number;
    importance_score: number;
  }>;
  
  // Recommendations
  strategic_recommendations: string[];
  
  // Metrics
  response_rate: number;
  rejection_rate: number;
  ghosting_rate: number;
  
  generated_at: Date;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Parse a rejection email using AI
 */
export async function parseRejectionEmail(
  input: RejectionEmailInput
): Promise<ParsedRejection> {
  const { email_body, email_subject, email_from } = input;

  const prompt = `Analyze this email to determine if it's a job rejection and extract insights.

Email Subject: ${email_subject || 'N/A'}
Email From: ${email_from || 'N/A'}
Email Body:
${email_body}

Respond in JSON format with these fields:
{
  "is_rejection": boolean,
  "confidence": number (0-100),
  "rejection_type": "skill_gap" | "experience_mismatch" | "cultural_fit" | "competition" | "position_filled" | "generic" | "unknown",
  "company": string or null,
  "role": string or null,
  "feedback_sentiment": "positive" | "neutral" | "negative",
  "has_specific_feedback": boolean,
  "skill_gaps": [{"skill": string, "context": string, "importance": "critical" | "nice_to_have" | "unknown"}],
  "actionable_items": [string],
  "future_opportunity_hint": boolean,
  "keep_in_touch_suggested": boolean,
  "summary": string (2-3 sentences)
}

Be thorough in identifying any skill gaps or improvement areas mentioned, even indirectly.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing job rejection emails and extracting actionable career insights. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    const parsed = JSON.parse(content);

    return {
      is_rejection: parsed.is_rejection ?? false,
      confidence: parsed.confidence ?? 50,
      rejection_type: parsed.rejection_type ?? 'unknown',
      company: parsed.company,
      role: parsed.role,
      feedback_sentiment: parsed.feedback_sentiment ?? 'neutral',
      has_specific_feedback: parsed.has_specific_feedback ?? false,
      skill_gaps: parsed.skill_gaps ?? [],
      actionable_items: parsed.actionable_items ?? [],
      future_opportunity_hint: parsed.future_opportunity_hint ?? false,
      keep_in_touch_suggested: parsed.keep_in_touch_suggested ?? false,
      summary: parsed.summary ?? 'Unable to generate summary.',
      raw_analysis: content,
    };
  } catch (error) {
    console.error('[RejectionParser] Error parsing email:', error);
    
    // Return a basic analysis on error
    return {
      is_rejection: email_body.toLowerCase().includes('unfortunately') ||
                    email_body.toLowerCase().includes('regret') ||
                    email_body.toLowerCase().includes('not moving forward'),
      confidence: 30,
      rejection_type: 'unknown',
      feedback_sentiment: 'neutral',
      has_specific_feedback: false,
      skill_gaps: [],
      actionable_items: ['Review the full email content manually'],
      future_opportunity_hint: email_body.toLowerCase().includes('future'),
      keep_in_touch_suggested: email_body.toLowerCase().includes('touch') ||
                              email_body.toLowerCase().includes('connect'),
      summary: 'Unable to fully analyze this email. Please review manually.',
      raw_analysis: 'Analysis failed',
    };
  }
}

/**
 * Process a rejection email and update the application
 */
export async function processRejectionEmail(
  input: RejectionEmailInput
): Promise<{ parsed: ParsedRejection; application_updated: boolean }> {
  const parsed = await parseRejectionEmail(input);

  if (!parsed.is_rejection) {
    return { parsed, application_updated: false };
  }

  let application_updated = false;

  // Update application if ID provided
  if (input.application_id) {
    await db
      .update(jobApplications)
      .set({
        status: 'rejected',
        raw_data: {
          rejection_parsed: true,
          rejection_type: parsed.rejection_type,
          rejection_feedback: parsed.summary,
          skill_gaps: parsed.skill_gaps,
          parsed_at: new Date().toISOString(),
        },
        updated_at: new Date(),
      })
      .where(eq(jobApplications.id, input.application_id));

    application_updated = true;
  }

  // Publish event
  await publishAgentEvent({
    type: 'REJECTION_PARSED',
    payload: {
      user_id: input.user_id,
      application_id: input.application_id,
      rejection_type: parsed.rejection_type,
      skill_gaps: parsed.skill_gaps.map((g) => g.skill),
      has_feedback: parsed.has_specific_feedback,
    },
  });

  // Notify user if there's actionable feedback
  if (parsed.has_specific_feedback && parsed.skill_gaps.length > 0) {
    await createNotification({
      user_id: input.user_id,
      type: 'system',
      priority: 'normal',
      title: 'Rejection Insights Available',
      message: `We analyzed your rejection from ${parsed.company || 'a company'} and found ${parsed.skill_gaps.length} areas for improvement.`,
      action_url: `/jobs/applications${input.application_id ? `?highlight=${input.application_id}` : ''}`,
      action_label: 'View Insights',
      metadata: {
        rejection_type: parsed.rejection_type,
        skill_gaps: parsed.skill_gaps,
        actionable_items: parsed.actionable_items,
      },
    });
  }

  return { parsed, application_updated };
}

/**
 * Analyze rejection patterns across multiple rejections
 */
export async function analyzeRejectionPatterns(
  user_id: string,
  period_days: number = 30
): Promise<RejectionAnalysisReport> {
  const cutoffDate = new Date(Date.now() - period_days * 24 * 60 * 60 * 1000);

  // Get all applications in period
  const applications = await db
    .select()
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.user_id, user_id),
        // gt(jobApplications.created_at, cutoffDate)
      )
    )
    .orderBy(desc(jobApplications.created_at));

  const rejections = applications.filter((a) => a.status === 'rejected');
  const ghosted = applications.filter((a) => a.status === 'ghosted');
  
  // Extract skill gaps from rejection data
  const allSkillGaps: Array<{ skill: string; importance: string }> = [];
  const patterns: RejectionPattern[] = [];

  for (const rejection of rejections) {
    const rawData = rejection.raw_data as Record<string, unknown> | null;
    if (rawData?.skill_gaps) {
      const gaps = rawData.skill_gaps as Array<{ skill: string; importance?: string }>;
      gaps.forEach((g) => {
        allSkillGaps.push({
          skill: g.skill,
          importance: g.importance || 'unknown',
        });
      });
    }
  }

  // Aggregate skill gaps
  const skillGapCounts: Record<string, { count: number; importance_total: number }> = {};
  for (const gap of allSkillGaps) {
    if (!skillGapCounts[gap.skill]) {
      skillGapCounts[gap.skill] = { count: 0, importance_total: 0 };
    }
    skillGapCounts[gap.skill].count++;
    skillGapCounts[gap.skill].importance_total += gap.importance === 'critical' ? 3 : gap.importance === 'nice_to_have' ? 1 : 2;
  }

  const topSkillGaps = Object.entries(skillGapCounts)
    .map(([skill, data]) => ({
      skill,
      mentions: data.count,
      importance_score: data.importance_total / data.count,
    }))
    .sort((a, b) => b.mentions * b.importance_score - a.mentions * a.importance_score)
    .slice(0, 10);

  // Detect patterns
  if (topSkillGaps.length > 0 && topSkillGaps[0].mentions >= 2) {
    patterns.push({
      pattern_type: 'skill_gap',
      pattern_description: `"${topSkillGaps[0].skill}" mentioned in ${topSkillGaps[0].mentions} rejections`,
      frequency: topSkillGaps[0].mentions,
      affected_applications: rejections
        .filter((r) => {
          const data = r.raw_data as Record<string, unknown> | null;
          const gaps = data?.skill_gaps as Array<{ skill: string }> | undefined;
          return gaps?.some((g) => g.skill === topSkillGaps[0].skill);
        })
        .map((r) => r.id),
      recommended_action: `Prioritize learning ${topSkillGaps[0].skill} - it's a recurring gap in your applications.`,
    });
  }

  // Generate strategic recommendations
  const recommendations: string[] = [];

  if (topSkillGaps.length > 0) {
    recommendations.push(
      `Focus on developing: ${topSkillGaps.slice(0, 3).map((g) => g.skill).join(', ')}`
    );
  }

  if (rejections.length > 5 && rejections.length > applications.length * 0.5) {
    recommendations.push(
      'High rejection rate detected. Consider reviewing your resume targeting and tailoring applications more carefully.'
    );
  }

  if (ghosted.length > rejections.length) {
    recommendations.push(
      'More ghosting than explicit rejections. This may indicate your applications aren\'t reaching decision-makers. Try networking and referrals.'
    );
  }

  // Calculate metrics
  const totalApplied = applications.filter((a) => a.status !== 'draft').length;
  const response_rate = totalApplied > 0 ? ((rejections.length + applications.filter((a) => a.status === 'interviewing' || a.status === 'offered').length) / totalApplied) * 100 : 0;
  const rejection_rate = totalApplied > 0 ? (rejections.length / totalApplied) * 100 : 0;
  const ghosting_rate = totalApplied > 0 ? (ghosted.length / totalApplied) * 100 : 0;

  return {
    user_id,
    period_days,
    total_rejections: rejections.length,
    analyzed_rejections: rejections.filter((r) => (r.raw_data as Record<string, unknown> | null)?.rejection_parsed).length,
    patterns,
    top_skill_gaps: topSkillGaps,
    strategic_recommendations: recommendations,
    response_rate,
    rejection_rate,
    ghosting_rate,
    generated_at: new Date(),
  };
}

/**
 * Run full rejection analysis and issue directives if needed
 */
export async function runRejectionAnalysis(
  user_id: string,
  options?: {
    period_days?: number;
    issue_directive?: boolean;
  }
): Promise<RejectionAnalysisReport> {
  const { period_days = 30, issue_directive = true } = options || {};

  const report = await analyzeRejectionPatterns(user_id, period_days);

  // Issue directive if significant patterns found
  if (issue_directive && report.patterns.length > 0 && report.top_skill_gaps.length >= 2) {
    await issueRejectionInsightDirective(user_id, {
      rejection_patterns: report.patterns.map((p) => p.pattern_description),
      skill_gaps: report.top_skill_gaps.map((g) => g.skill),
      recommendations: report.strategic_recommendations,
    });
  }

  return report;
}

/**
 * Bulk process rejection emails (for email forwarding integration)
 */
export async function bulkProcessRejections(
  inputs: RejectionEmailInput[]
): Promise<Array<{ input: RejectionEmailInput; result: ParsedRejection; success: boolean }>> {
  const results = [];

  for (const input of inputs) {
    try {
      const { parsed } = await processRejectionEmail(input);
      results.push({ input, result: parsed, success: true });
    } catch (error) {
      console.error('[RejectionParser] Bulk processing error:', error);
      results.push({
        input,
        result: {
          is_rejection: false,
          confidence: 0,
          rejection_type: 'unknown',
          feedback_sentiment: 'neutral',
          has_specific_feedback: false,
          skill_gaps: [],
          actionable_items: [],
          future_opportunity_hint: false,
          keep_in_touch_suggested: false,
          summary: 'Processing failed',
          raw_analysis: '',
        } as ParsedRejection,
        success: false,
      });
    }
  }

  return results;
}
