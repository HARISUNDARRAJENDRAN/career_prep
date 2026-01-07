/**
 * Rejection Insights Service
 *
 * Parses rejection emails using AI to extract:
 * - Rejection reason/category
 * - Skill gaps mentioned
 * - Feedback provided
 * - Confidence score
 *
 * Used by email monitoring to provide actionable insights.
 */

import OpenAI from 'openai';
import { z } from 'zod';

// Input schema
export const RejectionEmailInputSchema = z.object({
  subject: z.string(),
  body: z.string(),
  company: z.string().optional(),
  role: z.string().optional(),
});

export type RejectionEmailInput = z.infer<typeof RejectionEmailInputSchema>;

// Output schema
export const RejectionAnalysisSchema = z.object({
  category: z.enum([
    'skill_gap',
    'experience_mismatch',
    'cultural_fit',
    'competition',
    'position_filled',
    'generic',
    'unknown',
    'standard_rejection',
    'after_interview',
    'ghosting',
    'auto_rejection',
    'other',
  ]),
  reason: z.string(),
  feedback: z.string().optional(),
  skill_gaps: z.array(
    z.object({
      skill: z.string(),
      importance: z.enum(['high', 'medium', 'low']),
      context: z.string().optional(),
      suggestion: z.string().optional(),
    })
  ),
  confidence: z.number().min(0).max(1),
  is_actionable: z.boolean(),
  recommended_actions: z.array(z.string()),
});

export type RejectionAnalysis = z.infer<typeof RejectionAnalysisSchema>;

/**
 * Parse rejection email using AI
 */
export async function parseRejectionEmail(
  input: RejectionEmailInput
): Promise<RejectionAnalysis> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `You are an expert career coach analyzing job rejection emails.
Extract insights to help the candidate improve their job search.

Analyze the rejection email and provide:
1. Category: Why were they rejected?
2. Reason: Specific explanation in their own words
3. Feedback: Any explicit feedback provided
4. Skill Gaps: Technical/soft skills mentioned as missing
5. Confidence: How confident are you in this analysis (0-1)
6. Recommended Actions: 3-5 actionable next steps

Be empathetic but honest. If the email is generic, say so.`;

  const userPrompt = `Analyze this rejection email:

**Subject:** ${input.subject}

**Body:**
${input.body}

${input.company ? `**Company:** ${input.company}` : ''}
${input.role ? `**Role:** ${input.role}` : ''}

Provide structured analysis in JSON format.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    return RejectionAnalysisSchema.parse(parsed);
  } catch (error) {
    console.error('[Rejection Insights] Parse error:', error);

    // Fallback: basic pattern matching
    return fallbackRejectionAnalysis(input);
  }
}

/**
 * Fallback rejection analysis using pattern matching
 */
function fallbackRejectionAnalysis(input: RejectionEmailInput): RejectionAnalysis {
  const body = input.body.toLowerCase();
  const subject = input.subject.toLowerCase();
  const combined = `${subject} ${body}`;

  // Determine category
  let category: RejectionAnalysis['category'] = 'generic';

  if (
    combined.includes('more experienced') ||
    combined.includes('senior candidates') ||
    combined.includes('years of experience')
  ) {
    category = 'experience_mismatch';
  } else if (
    combined.includes('skill') ||
    combined.includes('qualification') ||
    combined.includes('technical')
  ) {
    category = 'skill_gap';
  } else if (combined.includes('cultural fit') || combined.includes('team fit')) {
    category = 'cultural_fit';
  } else if (
    combined.includes('other candidates') ||
    combined.includes('competitive') ||
    combined.includes('strong applicant pool')
  ) {
    category = 'competition';
  } else if (combined.includes('position has been filled') || combined.includes('filled internally')) {
    category = 'position_filled';
  } else if (combined.includes('automated') || combined.includes('no longer accepting')) {
    category = 'auto_rejection';
  }

  // Extract reason
  let reason = 'The company decided to pursue other candidates.';
  if (body.includes('unfortunately')) {
    const match = body.match(/unfortunately[,\s]+(.*?)[.!]/i);
    if (match) reason = match[1].trim();
  }

  // Look for skill gaps
  const skillGaps: RejectionAnalysis['skill_gaps'] = [];
  const skillKeywords = [
    'javascript',
    'python',
    'java',
    'react',
    'node',
    'kubernetes',
    'aws',
    'docker',
    'sql',
    'nosql',
    'typescript',
    'go',
    'rust',
    'leadership',
    'communication',
    'management',
  ];

  for (const skill of skillKeywords) {
    if (combined.includes(skill)) {
      skillGaps.push({
        skill,
        importance: 'medium',
        context: `Mentioned in rejection email`,
      });
    }
  }

  // Recommended actions based on category
  const recommended_actions: string[] = [];
  switch (category) {
    case 'experience_mismatch':
      recommended_actions.push('Consider roles with lower experience requirements');
      recommended_actions.push('Highlight relevant project experience in resume');
      recommended_actions.push('Look for junior/mid-level positions');
      break;
    case 'skill_gap':
      recommended_actions.push('Identify and learn the missing technical skills');
      recommended_actions.push('Build projects showcasing required skills');
      recommended_actions.push('Get certifications in key technologies');
      break;
    case 'competition':
      recommended_actions.push('Apply earlier in the hiring cycle');
      recommended_actions.push('Network with employees for referrals');
      recommended_actions.push('Differentiate yourself in cover letter');
      break;
    default:
      recommended_actions.push('Continue applying to similar positions');
      recommended_actions.push('Review and optimize your resume');
      recommended_actions.push('Practice interview skills');
  }

  return {
    category,
    reason,
    skill_gaps: skillGaps,
    confidence: 0.6, // Lower confidence for fallback
    is_actionable: skillGaps.length > 0 || category !== 'generic',
    recommended_actions,
  };
}

/**
 * Simple helper to determine rejection type from email body
 */
export function determineRejectionType(body: string): RejectionAnalysis['category'] {
  const lower = body.toLowerCase();

  if (lower.includes('experience') || lower.includes('years')) return 'experience_mismatch';
  if (lower.includes('skill') || lower.includes('qualification')) return 'skill_gap';
  if (lower.includes('cultural') || lower.includes('fit')) return 'cultural_fit';
  if (lower.includes('other candidates') || lower.includes('competitive')) return 'competition';
  if (lower.includes('filled') || lower.includes('no longer available')) return 'position_filled';

  return 'generic';
}

/**
 * Extract rejection reason from email
 */
export function extractRejectionReason(body: string): string {
  const lower = body.toLowerCase();

  // Try to find sentence with "unfortunately" or "regret"
  const patterns = [
    /unfortunately[,\s]+(.*?)[.!]/i,
    /we regret to inform you that (.*?)[.!]/i,
    /after careful consideration[,\s]+(.*?)[.!]/i,
    /decided to (.*?)[.!]/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return 'The company decided to pursue other candidates';
}

/**
 * Run rejection analysis for a user's applications
 * (Batch analysis used by weekly sprint)
 */
export async function runRejectionAnalysis(
  userId: string,
  options: {
    period_days?: number;
    issue_directive?: boolean;
  } = {}
): Promise<{
  total_rejections: number;
  analyzed: number;
  common_reasons: string[];
  skill_gaps: Array<{ skill: string; count: number }>;
}> {
  const { period_days = 30 } = options;

  // Get rejections from the period
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - period_days);

  const { db } = await import('@/drizzle/db');
  const { jobApplications } = await import('@/drizzle/schema');
  const { eq, and, gte } = await import('drizzle-orm');

  const rejections = await db.query.jobApplications.findMany({
    where: and(
      eq(jobApplications.user_id, userId),
      eq(jobApplications.status, 'rejected'),
      gte(jobApplications.last_activity_at, cutoffDate)
    ),
  });

  // Aggregate insights
  const reasons: string[] = [];
  const skillGapMap = new Map<string, number>();

  for (const rejection of rejections) {
    const rawData = rejection.raw_data as any;
    if (rawData?.rejection_type) {
      reasons.push(rawData.rejection_type);
    }
    if (rawData?.skill_gaps) {
      for (const gap of rawData.skill_gaps) {
        const count = skillGapMap.get(gap.skill) || 0;
        skillGapMap.set(gap.skill, count + 1);
      }
    }
  }

  // Find most common reasons
  const reasonCounts = reasons.reduce((acc, r) => {
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const common_reasons = Object.entries(reasonCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([reason]) => reason);

  // Top skill gaps
  const skill_gaps = Array.from(skillGapMap.entries())
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    total_rejections: rejections.length,
    analyzed: rejections.filter((r) => (r.raw_data as any)?.rejection_parsed).length,
    common_reasons,
    skill_gaps,
  };
}
