/**
 * Action Agent Tools
 *
 * Tool definitions for job application automation.
 *
 * @see docs/agentic-improvements/07-TOOL_SELECTION.md
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { toolRegistry, type ToolDefinition } from '../../tools/tool-registry';
import { db } from '@/drizzle/db';
import {
  jobListings,
  jobApplications,
  applicationDocuments,
  userProfiles,
  userSkills,
  users,
} from '@/drizzle/schema';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import {
  buildCoverLetterPrompt,
  buildApplicationEvaluationPrompt,
  buildFollowUpPrompt,
  buildPrioritizationPrompt,
  ACTION_PROMPTS,
} from './action-prompts';
import { safeJsonParse } from '../../utils/safe-json';

// ============================================================================
// Input/Output Schemas
// ============================================================================

const ApplicationEvaluatorInput = z.object({
  user_id: z.string(),
  job_listing_id: z.string(),
  match_score: z.number(),
  matching_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
});

const ApplicationEvaluatorOutput = z.object({
  should_apply: z.enum(['yes', 'no', 'maybe']),
  confidence: z.number(),
  reasons: z.array(z.string()),
  concerns: z.array(z.string()),
  suggested_approach: z.enum(['standard', 'referral', 'networking', 'wait']),
  priority: z.enum(['high', 'medium', 'low']),
});

const CoverLetterGeneratorInput = z.object({
  user_id: z.string(),
  job_listing_id: z.string(),
  matching_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
  match_score: z.number(),
});

const CoverLetterGeneratorOutput = z.object({
  cover_letter: z.string(),
  word_count: z.number(),
  key_points: z.array(z.string()),
  tone: z.string(),
});

const ApplicationCreatorInput = z.object({
  user_id: z.string(),
  job_listing_id: z.string(),
  cover_letter: z.string(),
  status: z.enum(['draft', 'applied']),
  match_score: z.number(),
});

const ApplicationCreatorOutput = z.object({
  application_id: z.string(),
  document_id: z.string(),
  status: z.string(),
  success: z.boolean(),
});

const DailyLimitCheckerInput = z.object({
  user_id: z.string(),
});

const DailyLimitCheckerOutput = z.object({
  applications_today: z.number(),
  daily_limit: z.number(),
  can_apply: z.boolean(),
  remaining: z.number(),
});

const DuplicateCheckerInput = z.object({
  user_id: z.string(),
  job_listing_id: z.string(),
});

const DuplicateCheckerOutput = z.object({
  already_applied: z.boolean(),
  existing_application_id: z.string().optional(),
  applied_at: z.string().optional(),
});

const CompanyExclusionCheckerInput = z.object({
  user_id: z.string(),
  company: z.string(),
});

const CompanyExclusionCheckerOutput = z.object({
  is_excluded: z.boolean(),
  exclusion_reason: z.string().optional(),
});

const FollowUpAnalyzerInput = z.object({
  application_id: z.string(),
});

const FollowUpAnalyzerOutput = z.object({
  should_followup: z.boolean(),
  timing: z.enum(['now', 'wait', 'after_event']),
  wait_days: z.number().optional(),
  method: z.enum(['email', 'linkedin', 'phone', 'none']),
  message_template: z.string().optional(),
  if_no_response: z.string(),
});

const PrioritizerInput = z.object({
  user_id: z.string(),
  job_ids: z.array(z.string()),
});

const PrioritizerOutput = z.object({
  prioritized: z.array(z.object({
    id: z.string(),
    rank: z.number(),
    reasoning: z.string(),
    apply_urgency: z.enum(['immediate', 'this_week', 'when_ready']),
  })),
  skip_recommendations: z.array(z.object({
    id: z.string(),
    reason: z.string(),
  })),
});

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Application Evaluator - Decides if user should apply
 */
const applicationEvaluatorTool: ToolDefinition<
  z.infer<typeof ApplicationEvaluatorInput>,
  z.infer<typeof ApplicationEvaluatorOutput>
> = {
  id: 'application_evaluator',
  name: 'Application Evaluator',
  description: 'Evaluate whether a user should apply to a specific job',
  version: '1.0.0',
  category: 'decision',
  tags: ['evaluation', 'decision', 'application'],
  input_schema: ApplicationEvaluatorInput,
  output_schema: ApplicationEvaluatorOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    // Fetch job details
    const job = await db.query.jobListings.findFirst({
      where: eq(jobListings.id, input.job_listing_id),
    });
    if (!job) throw new Error(`Job ${input.job_listing_id} not found`);

    // Fetch user profile
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, input.user_id),
    });

    const userSkillRecords = await db.query.userSkills.findMany({
      where: eq(userSkills.user_id, input.user_id),
      with: { skill: true },
    });

    const prompt = buildApplicationEvaluationPrompt(
      {
        title: job.title,
        company: job.company,
        location: job.location || 'Remote/Unknown',
        salary_range: job.salary_range || undefined,
        requirements: job.skills_required || [],
      },
      {
        target_roles: profile?.target_roles || [],
        current_skills: userSkillRecords.map((us) => us.skill?.name || '').filter(Boolean),
        preferences: {
          min_salary: profile?.salary_expectation_min || undefined,
          preferred_locations: profile?.preferred_locations || undefined,
          remote_preference: 'any' as const,
        },
      },
      input.match_score,
      input.matching_skills,
      input.missing_skills
    );

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ACTION_PROMPTS.APPLICATION_EVALUATOR },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from evaluator');

    return safeJsonParse(content, 'application evaluation');
  },
  cost: { latency_ms: 2000, tokens: 500 },
  requires: [],
  best_for: ['Making application decisions'],
  not_suitable_for: ['Generating application content'],
  examples: [],
  enabled: true,
};

/**
 * Cover Letter Generator - Creates personalized cover letters
 */
const coverLetterGeneratorTool: ToolDefinition<
  z.infer<typeof CoverLetterGeneratorInput>,
  z.infer<typeof CoverLetterGeneratorOutput>
> = {
  id: 'cover_letter_generator',
  name: 'Cover Letter Generator',
  description: 'Generate a personalized cover letter for a job application',
  version: '1.0.0',
  category: 'generation',
  tags: ['cover_letter', 'ai', 'generation'],
  input_schema: CoverLetterGeneratorInput,
  output_schema: CoverLetterGeneratorOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    // Fetch job details
    const job = await db.query.jobListings.findFirst({
      where: eq(jobListings.id, input.job_listing_id),
    });
    if (!job) throw new Error(`Job ${input.job_listing_id} not found`);

    // Fetch user details
    const user = await db.query.users.findFirst({
      where: eq(users.clerk_id, input.user_id),
      with: { profile: true },
    });

    const userSkillRecords = await db.query.userSkills.findMany({
      where: eq(userSkills.user_id, input.user_id),
      with: { skill: true },
    });

    const workHistory = (user?.profile?.work_history as Array<{ title: string; company: string; description?: string }>) || [];
    const achievements = workHistory
      .flatMap((w) => w.description ? [w.description] : [])
      .slice(0, 3);

    // Get user's full name
    const userName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Candidate';

    const prompt = buildCoverLetterPrompt(
      {
        name: userName,
        current_title: workHistory[0]?.title || 'Professional',
        years_experience: user?.profile?.years_of_experience || 0,
        key_skills: userSkillRecords.map((us) => us.skill?.name || '').filter(Boolean).slice(0, 10),
        key_achievements: achievements.length > 0 ? achievements : ['Delivered impactful results in previous roles'],
      },
      {
        title: job.title,
        company: job.company,
        description: (job.raw_data as { description?: string })?.description || job.title,
        requirements: job.skills_required || [],
      },
      {
        matching_skills: input.matching_skills,
        missing_skills: input.missing_skills,
        match_score: input.match_score,
      }
    );

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ACTION_PROMPTS.COVER_LETTER_GENERATOR },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const coverLetter = response.choices[0]?.message?.content || '';
    const wordCount = coverLetter.split(/\s+/).length;

    // Extract key points from the cover letter
    const keyPoints = [
      `Addressed ${input.matching_skills.slice(0, 3).join(', ')}`,
      `Tailored for ${job.company}`,
      input.missing_skills.length > 0 ? `Addressed skill gaps positively` : 'Strong skill alignment',
    ];

    return {
      cover_letter: coverLetter,
      word_count: wordCount,
      key_points: keyPoints,
      tone: 'professional_enthusiastic',
    };
  },
  cost: { latency_ms: 3000, tokens: 800 },
  requires: [],
  best_for: ['Creating personalized cover letters'],
  not_suitable_for: ['Application decisions'],
  examples: [],
  enabled: true,
};

/**
 * Application Creator - Persists application to database
 */
const applicationCreatorTool: ToolDefinition<
  z.infer<typeof ApplicationCreatorInput>,
  z.infer<typeof ApplicationCreatorOutput>
> = {
  id: 'application_creator',
  name: 'Application Creator',
  description: 'Create a job application record in the database',
  version: '1.0.0',
  category: 'persistence',
  tags: ['database', 'application', 'storage'],
  input_schema: ApplicationCreatorInput,
  output_schema: ApplicationCreatorOutput,
  handler: async (input) => {
    // Fetch job for details
    const job = await db.query.jobListings.findFirst({
      where: eq(jobListings.id, input.job_listing_id),
    });
    if (!job) throw new Error(`Job ${input.job_listing_id} not found`);

    // Create cover letter document
    const [coverLetterDoc] = await db.insert(applicationDocuments).values({
      user_id: input.user_id,
      type: 'cover_letter',
      version: 1,
      name: `Cover Letter - ${job.company} - ${job.title}`,
      metadata: {
        target_role: job.title,
        last_modified_by: 'agent' as const,
      },
    }).returning();

    // Create application
    const [application] = await db.insert(jobApplications).values({
      user_id: input.user_id,
      job_listing_id: input.job_listing_id,
      document_id: coverLetterDoc.id,
      company: job.company,
      role: job.title,
      location: job.location,
      status: input.status,
      applied_at: input.status === 'applied' ? new Date() : null,
      last_activity_at: new Date(),
      raw_data: {
        match_score: input.match_score,
        agent_reasoning: `Auto-generated application. Cover letter preview: ${input.cover_letter.slice(0, 200)}`,
        job_description: (job.raw_data as { description?: string })?.description,
      },
    }).returning();

    return {
      application_id: application.id,
      document_id: coverLetterDoc.id,
      status: application.status,
      success: true,
    };
  },
  cost: { latency_ms: 200, tokens: 0 },
  requires: [],
  best_for: ['Persisting applications'],
  not_suitable_for: ['Evaluating applications'],
  examples: [],
  enabled: true,
};

/**
 * Daily Limit Checker - Checks application limits
 */
const dailyLimitCheckerTool: ToolDefinition<
  z.infer<typeof DailyLimitCheckerInput>,
  z.infer<typeof DailyLimitCheckerOutput>
> = {
  id: 'daily_limit_checker',
  name: 'Daily Limit Checker',
  description: 'Check if user has reached their daily application limit',
  version: '1.0.0',
  category: 'validation',
  tags: ['limit', 'validation', 'daily'],
  input_schema: DailyLimitCheckerInput,
  output_schema: DailyLimitCheckerOutput,
  handler: async (input) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.user_id, input.user_id),
          gte(jobApplications.applied_at, todayStart)
        )
      );

    const applicationsToday = result[0]?.count || 0;

    // Fetch user's daily limit
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, input.user_id),
    });

    const dailyLimit = profile?.auto_apply_daily_limit || 5;

    return {
      applications_today: applicationsToday,
      daily_limit: dailyLimit,
      can_apply: applicationsToday < dailyLimit,
      remaining: Math.max(0, dailyLimit - applicationsToday),
    };
  },
  cost: { latency_ms: 100, tokens: 0 },
  requires: [],
  best_for: ['Checking application limits'],
  not_suitable_for: ['Making application decisions'],
  examples: [],
  enabled: true,
};

/**
 * Duplicate Checker - Checks for existing applications
 */
const duplicateCheckerTool: ToolDefinition<
  z.infer<typeof DuplicateCheckerInput>,
  z.infer<typeof DuplicateCheckerOutput>
> = {
  id: 'duplicate_checker',
  name: 'Duplicate Checker',
  description: 'Check if user has already applied to a job',
  version: '1.0.0',
  category: 'validation',
  tags: ['duplicate', 'validation', 'check'],
  input_schema: DuplicateCheckerInput,
  output_schema: DuplicateCheckerOutput,
  handler: async (input) => {
    const existing = await db.query.jobApplications.findFirst({
      where: and(
        eq(jobApplications.user_id, input.user_id),
        eq(jobApplications.job_listing_id, input.job_listing_id)
      ),
    });

    return {
      already_applied: !!existing,
      existing_application_id: existing?.id,
      applied_at: existing?.applied_at?.toISOString(),
    };
  },
  cost: { latency_ms: 50, tokens: 0 },
  requires: [],
  best_for: ['Preventing duplicate applications'],
  not_suitable_for: ['Application evaluation'],
  examples: [],
  enabled: true,
};

/**
 * Company Exclusion Checker - Checks if company is excluded
 */
const companyExclusionCheckerTool: ToolDefinition<
  z.infer<typeof CompanyExclusionCheckerInput>,
  z.infer<typeof CompanyExclusionCheckerOutput>
> = {
  id: 'company_exclusion_checker',
  name: 'Company Exclusion Checker',
  description: 'Check if a company is on the user exclusion list',
  version: '1.0.0',
  category: 'validation',
  tags: ['exclusion', 'company', 'validation'],
  input_schema: CompanyExclusionCheckerInput,
  output_schema: CompanyExclusionCheckerOutput,
  handler: async (input) => {
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, input.user_id),
    });

    const excludedCompanies = profile?.auto_apply_excluded_companies || [];
    const companyLower = input.company.toLowerCase().trim();

    const isExcluded = excludedCompanies.some(
      (excluded) => excluded.toLowerCase().trim() === companyLower
    );

    return {
      is_excluded: isExcluded,
      exclusion_reason: isExcluded ? 'Company is on exclusion list' : undefined,
    };
  },
  cost: { latency_ms: 50, tokens: 0 },
  requires: [],
  best_for: ['Checking company exclusions'],
  not_suitable_for: ['Application decisions'],
  examples: [],
  enabled: true,
};

/**
 * Follow-Up Analyzer - Determines follow-up strategy
 */
const followUpAnalyzerTool: ToolDefinition<
  z.infer<typeof FollowUpAnalyzerInput>,
  z.infer<typeof FollowUpAnalyzerOutput>
> = {
  id: 'followup_analyzer',
  name: 'Follow-Up Analyzer',
  description: 'Analyze an application and recommend follow-up strategy',
  version: '1.0.0',
  category: 'analysis',
  tags: ['followup', 'strategy', 'analysis'],
  input_schema: FollowUpAnalyzerInput,
  output_schema: FollowUpAnalyzerOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    const application = await db.query.jobApplications.findFirst({
      where: eq(jobApplications.id, input.application_id),
    });
    if (!application) throw new Error(`Application ${input.application_id} not found`);

    const daysSinceApplication = application.applied_at
      ? Math.floor((Date.now() - application.applied_at.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const prompt = buildFollowUpPrompt(
      {
        company: application.company,
        role: application.role,
        applied_at: application.applied_at?.toISOString() || 'Unknown',
        status: application.status,
        last_activity: application.last_activity_at?.toISOString() || 'Unknown',
      },
      {
        days_since_application: daysSinceApplication,
        previous_followups: 0, // Would track from activity log
        industry: 'tech', // Could be derived from job
      }
    );

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ACTION_PROMPTS.FOLLOWUP_STRATEGIST },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from follow-up analyzer');

    return safeJsonParse(content, 'follow-up analysis');
  },
  cost: { latency_ms: 2000, tokens: 400 },
  requires: [],
  best_for: ['Determining follow-up timing and method'],
  not_suitable_for: ['Creating applications'],
  examples: [],
  enabled: true,
};

/**
 * Application Prioritizer - Ranks job opportunities
 */
const prioritizerTool: ToolDefinition<
  z.infer<typeof PrioritizerInput>,
  z.infer<typeof PrioritizerOutput>
> = {
  id: 'application_prioritizer',
  name: 'Application Prioritizer',
  description: 'Prioritize job opportunities for application',
  version: '1.0.0',
  category: 'analysis',
  tags: ['prioritization', 'ranking', 'jobs'],
  input_schema: PrioritizerInput,
  output_schema: PrioritizerOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    // Fetch jobs
    const jobs = await Promise.all(
      input.job_ids.map((id) =>
        db.query.jobListings.findFirst({ where: eq(jobListings.id, id) })
      )
    );

    // Fetch user profile
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, input.user_id),
    });

    const opportunities = jobs
      .filter((j): j is NonNullable<typeof j> => j !== undefined)
      .map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        match_score: 70, // Would calculate actual score
        salary_range: job.salary_range || undefined,
        location: job.location || 'Unknown',
      }));

    const prompt = buildPrioritizationPrompt(opportunities, {
      target_roles: profile?.target_roles || [],
      priority_factors: ['skill_match', 'company_reputation', 'growth_potential'],
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ACTION_PROMPTS.APPLICATION_PRIORITIZER },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from prioritizer');

    return safeJsonParse(content, 'prioritization');
  },
  cost: { latency_ms: 2500, tokens: 600 },
  requires: [],
  best_for: ['Ranking application priorities'],
  not_suitable_for: ['Creating applications'],
  examples: [],
  enabled: true,
};

// ============================================================================
// Registration
// ============================================================================

/**
 * Register all Action agent tools
 */
export function registerActionTools(): void {
  const tools = [
    applicationEvaluatorTool,
    coverLetterGeneratorTool,
    applicationCreatorTool,
    dailyLimitCheckerTool,
    duplicateCheckerTool,
    companyExclusionCheckerTool,
    followUpAnalyzerTool,
    prioritizerTool,
  ] as const;

  for (const tool of tools) {
    if (!toolRegistry.has(tool.id)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toolRegistry.register(tool as any);
    }
  }

  console.log(`[Action] Registered ${tools.length} tools`);
}

/**
 * Get IDs of all Action tools
 */
export function getActionToolIds(): string[] {
  return [
    'application_evaluator',
    'cover_letter_generator',
    'application_creator',
    'daily_limit_checker',
    'duplicate_checker',
    'company_exclusion_checker',
    'followup_analyzer',
    'application_prioritizer',
  ];
}

export default {
  registerActionTools,
  getActionToolIds,
};
