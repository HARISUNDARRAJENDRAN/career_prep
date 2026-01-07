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
  strategicDirectives,
} from '@/drizzle/schema';
import { eq, and, gte, sql, desc, or, isNull, inArray } from 'drizzle-orm';
import {
  buildCoverLetterPrompt,
  buildApplicationEvaluationPrompt,
  buildFollowUpPrompt,
  buildPrioritizationPrompt,
  ACTION_PROMPTS,
} from './action-prompts';
import { safeJsonParse } from '../../utils/safe-json';
import {
  getCareerAutomationClient,
  type UserProfile as CareerUserProfile,
  type ResumeProfile,
  type FormAnalysisResponse,
} from '@/lib/services/career-automation-client';
import { getCredentialsForPythonService } from '@/lib/security/credentials-service';

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
// Career Automation Service Tools (Browser Automation)
// ============================================================================

const SubmitApplicationInput = z.object({
  user_id: z.string(),
  job_listing_id: z.string(),
  application_id: z.string(),
  resume_file_id: z.string().optional(),
  cover_letter: z.string().optional(),
  dry_run: z.boolean().default(false),
});

const SubmitApplicationOutput = z.object({
  status: z.enum(['success', 'draft', 'login_required', 'captcha_blocked', 'form_error', 'timeout', 'failed', 'service_unavailable']),
  message: z.string(),
  screenshot_url: z.string().optional(),
  fields_filled: z.number(),
  fields_missing: z.array(z.string()),
});

const GenerateLatexResumeInput = z.object({
  user_id: z.string(),
  job_listing_id: z.string().optional(),
  template: z.enum(['modern', 'classic', 'minimalist', 'deedy']).default('modern'),
});

const GenerateLatexResumeOutput = z.object({
  success: z.boolean(),
  pdf_url: z.string().optional(),
  file_id: z.string().optional(),
  template_used: z.string(),
  message: z.string(),
});

/**
 * Submit Application - Uses browser automation to actually submit applications
 */
const submitApplicationTool: ToolDefinition<
  z.infer<typeof SubmitApplicationInput>,
  z.infer<typeof SubmitApplicationOutput>
> = {
  id: 'submit_application',
  name: 'Submit Application',
  description: 'Submit a job application using browser automation (headless browser)',
  version: '1.0.0',
  category: 'external_api',
  tags: ['browser', 'automation', 'submit', 'apply'],
  input_schema: SubmitApplicationInput,
  output_schema: SubmitApplicationOutput,
  handler: async (input) => {
    const client = getCareerAutomationClient();

    // Check if service is available
    const isAvailable = await client.isAvailable();
    if (!isAvailable) {
      return {
        status: 'service_unavailable' as const,
        message: 'Career automation service is not available. Please ensure the Python service is running.',
        fields_filled: 0,
        fields_missing: [],
      };
    }

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
    if (!user) throw new Error(`User ${input.user_id} not found`);

    const profile = user.profile;

    // Build user profile for the automation service
    const [firstName, ...lastNameParts] = (user.first_name || '').split(' ');
    const lastName = user.last_name || lastNameParts.join(' ') || '';

    const careerProfile: CareerUserProfile = {
      first_name: firstName || 'Unknown',
      last_name: lastName || 'Unknown',
      email: user.email,
      phone: profile?.phone || '',
      city: profile?.city || undefined,
      state: profile?.state || undefined,
      country: profile?.country || undefined,
      zip_code: profile?.zip_code || undefined,
      current_title: (profile?.work_history as Array<{ title: string }>)?.[0]?.title || undefined,
      years_experience: profile?.years_of_experience || undefined,
      linkedin_url: profile?.linkedin_url || undefined,
      github_url: profile?.github_url || undefined,
      portfolio_url: profile?.portfolio_url || undefined,
      authorized_to_work: true,
      requires_sponsorship: false,
      willing_to_relocate: true,
    };

    // Get job URL from raw_data (application_url is the correct field in schema)
    const jobUrl = job.raw_data?.application_url;

    if (!jobUrl) {
      return {
        status: 'failed' as const,
        message: 'No job URL available for this listing',
        fields_filled: 0,
        fields_missing: ['job_url'],
      };
    }

    // Determine platform from job URL
    let platform: 'linkedin' | 'indeed' | 'glassdoor' | null = null;
    const jobUrlLower = jobUrl.toLowerCase();
    if (jobUrlLower.includes('linkedin.com')) {
      platform = 'linkedin';
    } else if (jobUrlLower.includes('indeed.com')) {
      platform = 'indeed';
    } else if (jobUrlLower.includes('glassdoor.com')) {
      platform = 'glassdoor';
    }

    // Fetch encrypted credentials for the platform (if available)
    let sessionCookies: Record<string, string> | undefined;
    if (platform) {
      try {
        const credentials = await getCredentialsForPythonService(input.user_id, platform);
        if (credentials) {
          sessionCookies = credentials.cookies;
          console.log(`[submit_application] Using encrypted credentials for ${platform}`);
        } else {
          console.log(`[submit_application] No credentials found for ${platform}, attempting without authentication`);
        }
      } catch (error) {
        console.error(`[submit_application] Failed to fetch credentials for ${platform}:`, error);
        // Continue without credentials - browser may still work for public applications
      }
    }

    try {
      const result = await client.applyToJob({
        job_url: jobUrl,
        profile: careerProfile,
        resume_file_id: input.resume_file_id,
        cover_letter: input.cover_letter,
        session_cookies: sessionCookies,
        platform: platform ?? undefined,
        dry_run: input.dry_run,
        take_screenshot: true,
      });

      // Update application status in database
      // Map automation status to database status (schema supports: draft, applied, interviewing, offered, rejected, ghosted)
      const dbStatus = result.status === 'success' ? 'applied' as const : 'draft' as const;

      await db.update(jobApplications)
        .set({
          status: dbStatus,
          applied_at: result.status === 'success' ? new Date() : null,
          last_activity_at: new Date(),
          raw_data: sql`raw_data || ${JSON.stringify({
            automation_result: {
              status: result.status,
              fields_filled: result.fields_filled,
              fields_missing: result.fields_missing,
              screenshot_url: result.screenshot_url,
              timestamp: result.timestamp,
            },
          })}::jsonb`,
        })
        .where(eq(jobApplications.id, input.application_id));

      return {
        status: result.status,
        message: result.message,
        screenshot_url: result.screenshot_url ?? undefined, // Convert null to undefined
        fields_filled: result.fields_filled,
        fields_missing: result.fields_missing,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        status: 'failed' as const,
        message: `Application submission failed: ${errorMessage}`,
        fields_filled: 0,
        fields_missing: [],
      };
    }
  },
  cost: { latency_ms: 30000, tokens: 0 },
  requires: [],
  best_for: ['Submitting applications via browser automation'],
  not_suitable_for: ['Evaluating applications', 'Creating draft applications'],
  examples: [],
  enabled: true,
};

/**
 * Generate LaTeX Resume - Creates a tailored PDF resume
 */
const generateLatexResumeTool: ToolDefinition<
  z.infer<typeof GenerateLatexResumeInput>,
  z.infer<typeof GenerateLatexResumeOutput>
> = {
  id: 'generate_latex_resume',
  name: 'Generate LaTeX Resume',
  description: 'Generate a tailored PDF resume using LaTeX templates',
  version: '1.0.0',
  category: 'generation',
  tags: ['resume', 'pdf', 'latex', 'generation'],
  input_schema: GenerateLatexResumeInput,
  output_schema: GenerateLatexResumeOutput,
  handler: async (input) => {
    const client = getCareerAutomationClient();

    // Check if service is available
    const isAvailable = await client.isAvailable();
    if (!isAvailable) {
      return {
        success: false,
        template_used: input.template,
        message: 'Career automation service is not available. Please ensure the Python service is running.',
      };
    }

    // Fetch user details
    const user = await db.query.users.findFirst({
      where: eq(users.clerk_id, input.user_id),
      with: { profile: true },
    });
    if (!user) throw new Error(`User ${input.user_id} not found`);

    const profile = user.profile;

    // Fetch user skills
    const userSkillRecords = await db.query.userSkills.findMany({
      where: eq(userSkills.user_id, input.user_id),
      with: { skill: true },
    });

    // Build resume profile
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown';

    const workHistory = (profile?.work_history as Array<{
      title: string;
      company: string;
      location?: string;
      start_date: string;
      end_date?: string;
      description?: string;
    }>) || [];

    const education = (profile?.education as Array<{
      degree: string;
      institution: string;
      field_of_study?: string;
      end_date?: string;
      gpa?: number;
    }>) || [];

    // Build location string from profile fields
    const locationParts = [profile?.city, profile?.state, profile?.country].filter(Boolean);
    const location = locationParts.length > 0 ? locationParts.join(', ') : undefined;

    const resumeProfile: ResumeProfile = {
      name: fullName,
      email: user.email,
      phone: profile?.phone || '',
      location: location,
      linkedin: profile?.linkedin_url || undefined,
      github: profile?.github_url || undefined,
      portfolio: profile?.portfolio_url || undefined,
      summary: profile?.bio || undefined,
      experience: workHistory.map((w) => ({
        title: w.title,
        company: w.company,
        location: w.location,
        start_date: w.start_date,
        end_date: w.end_date || 'Present',
        bullets: w.description ? w.description.split('\n').filter(Boolean) : [],
      })),
      education: education.map((e) => ({
        institution: e.institution,
        degree: e.degree,
        field: e.field_of_study,
        graduation_date: e.end_date || '',
        gpa: e.gpa?.toString(),
      })),
      skills: {
        technical: userSkillRecords
          .filter((us) => us.skill?.category === 'technical')
          .map((us) => us.skill?.name || '')
          .filter(Boolean),
        soft: userSkillRecords
          .filter((us) => us.skill?.category === 'soft')
          .map((us) => us.skill?.name || '')
          .filter(Boolean),
        languages: userSkillRecords
          .filter((us) => us.skill?.category === 'language')
          .map((us) => us.skill?.name || '')
          .filter(Boolean),
      },
      projects: [],
      certifications: [],
    };

    // Fetch job details if provided (for tailoring)
    let jobTitle: string | undefined;
    let jobDescription: string | undefined;
    let jobCompany: string | undefined;

    if (input.job_listing_id) {
      const job = await db.query.jobListings.findFirst({
        where: eq(jobListings.id, input.job_listing_id),
      });
      if (job) {
        jobTitle = job.title;
        jobCompany = job.company;
        jobDescription = (job.raw_data as { description?: string })?.description;
      }
    }

    try {
      const result = await client.generateResume({
        profile: resumeProfile,
        template: input.template,
        job_title: jobTitle,
        job_description: jobDescription,
        job_company: jobCompany,
      });

      return {
        success: result.success,
        pdf_url: result.pdf_url || client.getResumePdfUrl(result.file_id),
        file_id: result.file_id,
        template_used: result.template_used,
        message: result.message,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        template_used: input.template,
        message: `Resume generation failed: ${errorMessage}`,
      };
    }
  },
  cost: { latency_ms: 10000, tokens: 0 },
  requires: [],
  best_for: ['Generating tailored PDF resumes'],
  not_suitable_for: ['Submitting applications'],
  examples: [],
  enabled: true,
};

// ============================================================================
// Hybrid Job Sourcing (JobSpy + Database)
// ============================================================================

const HybridJobSourceInput = z.object({
  user_id: z.string(),
  search_term: z.string(),
  location: z.string().optional(),
  remote: z.boolean().default(false),
  results_wanted: z.number().default(20),
  include_saved_jobs: z.boolean().default(true),
  hours_old: z.number().default(72),
});

const HybridJobSourceOutput = z.object({
  jobs: z.array(z.object({
    id: z.string(),
    title: z.string(),
    company: z.string(),
    location: z.string().optional(),
    job_url: z.string(),
    description: z.string().optional(),
    salary_range: z.string().optional(),
    source: z.enum(['jobspy', 'database']),
    platform: z.string(),
    date_posted: z.string().optional(),
    is_remote: z.boolean(),
  })),
  total_results: z.number(),
  jobspy_results: z.number(),
  database_results: z.number(),
  message: z.string(),
});

/**
 * Hybrid Job Source - Combines JobSpy live results with database-saved jobs
 */
const hybridJobSourceTool: ToolDefinition<
  z.infer<typeof HybridJobSourceInput>,
  z.infer<typeof HybridJobSourceOutput>
> = {
  id: 'hybrid_job_source',
  name: 'Hybrid Job Source',
  description: 'Fetch jobs from both JobSpy (live/fresh) and database-saved jobs (Jooble/Adzuna)',
  version: '1.0.0',
  category: 'data_retrieval',
  tags: ['jobs', 'sourcing', 'hybrid', 'jobspy', 'jooble', 'adzuna'],
  input_schema: HybridJobSourceInput,
  output_schema: HybridJobSourceOutput,
  handler: async (input) => {
    const client = getCareerAutomationClient();
    const allJobs: z.infer<typeof HybridJobSourceOutput>['jobs'] = [];
    let jobspyCount = 0;
    let databaseCount = 0;

    // 1. Fetch live results from JobSpy (via Python service)
    try {
      const jobspyResults = await client.searchJobs({
        search_term: input.search_term,
        location: input.location,
        remote: input.remote,
        results_wanted: Math.floor(input.results_wanted / 2), // Half from JobSpy
        hours_old: input.hours_old,
        site_names: ['indeed', 'linkedin', 'glassdoor'],
      });

      // Convert JobSpy results to our format
      for (const job of jobspyResults.jobs) {
        allJobs.push({
          id: `jobspy_${job.id}`,
          title: job.title,
          company: job.company,
          location: job.location || undefined,
          job_url: job.job_url,
          description: job.description || undefined,
          salary_range: job.salary_min && job.salary_max
            ? `$${job.salary_min.toLocaleString()}-$${job.salary_max.toLocaleString()}`
            : undefined,
          source: 'jobspy' as const,
          platform: job.source,
          date_posted: job.date_posted || undefined,
          is_remote: job.is_remote,
        });
      }
      jobspyCount = jobspyResults.jobs.length;
    } catch (error) {
      console.error('[hybrid_job_source] JobSpy fetch failed:', error);
      // Continue with database-only results
    }

    // 2. Fetch saved jobs from database (Jooble/Adzuna) if enabled
    if (input.include_saved_jobs) {
      try {
        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - input.hours_old);

        const savedJobs = await db.query.jobListings.findMany({
          where: and(
            sql`LOWER(${jobListings.title}) LIKE LOWER(${'%' + input.search_term + '%'})`,
            gte(jobListings.created_at, cutoffDate)
          ),
          limit: Math.floor(input.results_wanted / 2), // Half from database
          orderBy: [desc(jobListings.created_at)],
        });

        for (const job of savedJobs) {
          allJobs.push({
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location || undefined,
            job_url: job.raw_data?.application_url || '',
            description: job.raw_data?.description || undefined,
            salary_range: job.salary_range || undefined,
            source: 'database' as const,
            platform: job.raw_data?.source_metadata?.source as string || 'jooble',
            date_posted: job.created_at.toISOString(),
            is_remote: job.location?.toLowerCase().includes('remote') || false,
          });
        }
        databaseCount = savedJobs.length;
      } catch (error) {
        console.error('[hybrid_job_source] Database fetch failed:', error);
        // Continue with JobSpy-only results
      }
    }

    // Remove duplicates (same company + title)
    const uniqueJobs = allJobs.filter((job, index, self) =>
      index === self.findIndex((j) =>
        j.company.toLowerCase() === job.company.toLowerCase() &&
        j.title.toLowerCase() === job.title.toLowerCase()
      )
    );

    return {
      jobs: uniqueJobs.slice(0, input.results_wanted), // Limit to requested amount
      total_results: uniqueJobs.length,
      jobspy_results: jobspyCount,
      database_results: databaseCount,
      message: `Found ${uniqueJobs.length} unique jobs (${jobspyCount} from JobSpy, ${databaseCount} from database)`,
    };
  },
  cost: { latency_ms: 5000, tokens: 0 },
  requires: [],
  best_for: ['Finding fresh job opportunities', 'Combining live and saved job sources'],
  not_suitable_for: ['Applying to jobs', 'Generating resumes'],
  examples: [],
  enabled: true,
};

// ============================================================================
// Form Field Analyzer Tool (Pre-Application Check)
// ============================================================================

const FormFieldAnalyzerInput = z.object({
  user_id: z.string(),
  job_url: z.string(),
  job_listing_id: z.string().optional(),
});

const FormFieldAnalyzerOutput = z.object({
  success: z.boolean(),
  job_url: z.string(),
  company: z.string().nullable(),
  job_title: z.string().nullable(),
  platform: z.string(),
  total_fields: z.number(),
  required_fields: z.array(z.string()),
  missing_profile_fields: z.array(z.string()),
  blockers: z.array(z.string()),
  can_apply: z.boolean(),
  estimated_fill_rate: z.number(),
  screenshot_url: z.string().nullable(),
  recommendation: z.string(),
  message: z.string(),
});

/**
 * Form Field Analyzer - Pre-scans job application pages before applying
 */
const formFieldAnalyzerTool: ToolDefinition<
  z.infer<typeof FormFieldAnalyzerInput>,
  z.infer<typeof FormFieldAnalyzerOutput>
> = {
  id: 'form_field_analyzer',
  name: 'Form Field Analyzer',
  description: 'Pre-scan a job application page to identify required fields, blockers, and estimate fill rate before applying',
  version: '1.0.0',
  category: 'analysis',
  tags: ['form', 'analysis', 'pre-check', 'validation'],
  input_schema: FormFieldAnalyzerInput,
  output_schema: FormFieldAnalyzerOutput,
  handler: async (input) => {
    try {
      const client = getCareerAutomationClient();

      // Check if service is available
      const isAvailable = await client.isAvailable();
      if (!isAvailable) {
        return {
          success: false,
          job_url: input.job_url,
          company: null,
          job_title: null,
          platform: 'unknown',
          total_fields: 0,
          required_fields: [],
          missing_profile_fields: [],
          blockers: ['service_unavailable'],
          can_apply: false,
          estimated_fill_rate: 0,
          screenshot_url: null,
          recommendation: 'Career automation service is not available. Try again later.',
          message: 'Service unavailable',
        };
      }

      // Get user credentials for the platform
      let sessionCookies: Record<string, string> | undefined;
      try {
        const url = new URL(input.job_url);
        let platform: 'linkedin' | 'indeed' | 'glassdoor' | undefined;

        if (url.hostname.includes('linkedin')) platform = 'linkedin';
        else if (url.hostname.includes('indeed')) platform = 'indeed';
        else if (url.hostname.includes('glassdoor')) platform = 'glassdoor';

        if (platform) {
          const credentials = await getCredentialsForPythonService(input.user_id, platform);
          sessionCookies = credentials?.cookies || undefined;
        }
      } catch {
        // Continue without credentials
      }

      // Analyze the form
      const analysis = await client.analyzeForm({
        job_url: input.job_url,
        session_cookies: sessionCookies,
      });

      // Generate recommendation based on analysis
      let recommendation: string;
      if (analysis.blockers.length > 0) {
        if (analysis.blockers.includes('login_required')) {
          recommendation = 'Login required. Connect your account in Settings to enable auto-apply.';
        } else if (analysis.blockers.includes('captcha_detected')) {
          recommendation = 'CAPTCHA detected. Manual application required.';
        } else {
          recommendation = `Blocked: ${analysis.blockers.join(', ')}. Consider manual application.`;
        }
      } else if (analysis.estimated_fill_rate >= 80) {
        recommendation = 'High fill rate. Proceed with auto-apply.';
      } else if (analysis.estimated_fill_rate >= 60) {
        recommendation = 'Moderate fill rate. Review missing fields before applying.';
      } else if (analysis.estimated_fill_rate >= 40) {
        recommendation = 'Low fill rate. User should complete profile before applying.';
      } else {
        recommendation = 'Very low fill rate. Manual application recommended.';
      }

      return {
        success: analysis.success,
        job_url: analysis.job_url,
        company: analysis.company,
        job_title: analysis.job_title,
        platform: analysis.platform,
        total_fields: analysis.fields.length,
        required_fields: analysis.required_fields,
        missing_profile_fields: analysis.missing_profile_fields,
        blockers: analysis.blockers,
        can_apply: analysis.can_apply,
        estimated_fill_rate: analysis.estimated_fill_rate,
        screenshot_url: analysis.screenshot_url,
        recommendation,
        message: analysis.message,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        job_url: input.job_url,
        company: null,
        job_title: null,
        platform: 'unknown',
        total_fields: 0,
        required_fields: [],
        missing_profile_fields: [],
        blockers: ['error'],
        can_apply: false,
        estimated_fill_rate: 0,
        screenshot_url: null,
        recommendation: 'Analysis failed. Try manual application.',
        message: `Analysis failed: ${errorMessage}`,
      };
    }
  },
  cost: { latency_ms: 15000, tokens: 0, api_calls: 1 }, // Browser automation takes time
  requires: [],
  best_for: [
    'Pre-checking job applications before submission',
    'Identifying missing profile fields',
    'Detecting login walls and captchas',
    'Estimating auto-fill success rate',
  ],
  not_suitable_for: [
    'Actually submitting applications',
    'Real-time form filling',
  ],
  examples: [
    {
      goal: 'Check if we can auto-apply to a LinkedIn job',
      input: {
        user_id: 'user_123',
        job_url: 'https://www.linkedin.com/jobs/view/123456',
      },
      output: {
        success: true,
        job_url: 'https://www.linkedin.com/jobs/view/123456',
        company: 'Tech Corp',
        job_title: 'Senior Software Engineer',
        platform: 'linkedin',
        total_fields: 8,
        required_fields: ['first_name', 'last_name', 'email', 'phone', 'resume'],
        missing_profile_fields: [],
        blockers: [],
        can_apply: true,
        estimated_fill_rate: 85,
        screenshot_url: '/assets/form_analysis_abc123.png',
        recommendation: 'High fill rate. Proceed with auto-apply.',
        message: 'Found 8 form fields on linkedin platform.',
      },
    },
  ],
  enabled: true,
};

// ============================================================================
// Directive Checker Tool (Strategist Integration)
// ============================================================================

const DirectiveCheckerInput = z.object({
  user_id: z.string(),
  check_types: z.array(z.enum([
    'pause_applications',
    'application_strategy',
    'resume_rewrite',
    'focus_shift',
    'skill_priority',
  ])).optional(),
});

const DirectiveCheckerOutput = z.object({
  can_apply: z.boolean(),
  active_directives: z.array(z.object({
    id: z.string(),
    type: z.string(),
    priority: z.string(),
    title: z.string(),
    description: z.string(),
    target_agent: z.string().nullable(),
    action_required: z.string().nullable(),
    expires_at: z.string().nullable(),
  })),
  blocking_directives: z.array(z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    reason: z.string(),
  })),
  recommendations: z.array(z.string()),
  message: z.string(),
});

/**
 * Directive Checker - Checks if Action Agent is allowed to apply based on strategic directives
 * This should be called BEFORE any application submission
 */
const directiveCheckerTool: ToolDefinition<
  z.infer<typeof DirectiveCheckerInput>,
  z.infer<typeof DirectiveCheckerOutput>
> = {
  id: 'directive_checker',
  name: 'Directive Checker',
  description: 'Check active strategic directives to determine if applications should proceed or be paused',
  version: '1.0.0',
  category: 'validation',
  tags: ['directive', 'check', 'permission', 'strategy'],
  input_schema: DirectiveCheckerInput,
  output_schema: DirectiveCheckerOutput,
  handler: async (input) => {
    // Fetch all active directives for this user
    const checkTypes = input.check_types || [
      'pause_applications',
      'application_strategy',
      'resume_rewrite',
      'focus_shift',
      'skill_priority',
    ];

    const directives = await db
      .select()
      .from(strategicDirectives)
      .where(
        and(
          eq(strategicDirectives.user_id, input.user_id),
          inArray(strategicDirectives.status, ['pending', 'active']),
          or(
            isNull(strategicDirectives.expires_at),
            gte(strategicDirectives.expires_at, new Date())
          )
        )
      )
      .orderBy(desc(strategicDirectives.priority), desc(strategicDirectives.issued_at));

    // Filter by check types
    const relevantDirectives = directives.filter(d => checkTypes.includes(d.type as typeof checkTypes[number]));

    // Identify blocking directives
    const blockingDirectives = relevantDirectives
      .filter(d => d.type === 'pause_applications')
      .map(d => ({
        id: d.id,
        type: d.type,
        title: d.title,
        reason: d.description,
      }));

    // Check if applications are paused
    const canApply = blockingDirectives.length === 0;

    // Generate recommendations based on active directives
    const recommendations: string[] = [];

    for (const directive of relevantDirectives) {
      if (directive.type === 'focus_shift') {
        const context = directive.context as { to_role?: string } | null;
        if (context?.to_role) {
          recommendations.push(`Focus on ${context.to_role} positions (directive: ${directive.title})`);
        }
      } else if (directive.type === 'skill_priority') {
        const context = directive.context as { priority_skills?: string[] } | null;
        if (context?.priority_skills?.length) {
          recommendations.push(`Prioritize jobs requiring: ${context.priority_skills.slice(0, 3).join(', ')}`);
        }
      } else if (directive.type === 'application_strategy') {
        recommendations.push(`Strategy: ${directive.action_required || directive.description}`);
      } else if (directive.type === 'resume_rewrite') {
        recommendations.push(`Resume update needed before applying (${directive.title})`);
      }
    }

    // Format active directives for output
    const activeDirectives = relevantDirectives.map(d => ({
      id: d.id,
      type: d.type,
      priority: d.priority,
      title: d.title,
      description: d.description,
      target_agent: d.target_agent,
      action_required: d.action_required,
      expires_at: d.expires_at?.toISOString() || null,
    }));

    // Generate message
    let message: string;
    if (!canApply) {
      message = `Applications are PAUSED. ${blockingDirectives.length} blocking directive(s) active: ${blockingDirectives.map(d => d.title).join(', ')}`;
    } else if (relevantDirectives.length > 0) {
      message = `Applications allowed with ${relevantDirectives.length} active directive(s) to consider.`;
    } else {
      message = 'No active directives. Applications can proceed normally.';
    }

    return {
      can_apply: canApply,
      active_directives: activeDirectives,
      blocking_directives: blockingDirectives,
      recommendations,
      message,
    };
  },
  cost: { latency_ms: 100, tokens: 0 },
  requires: [],
  best_for: [
    'Pre-flight check before submitting applications',
    'Ensuring compliance with strategic directives',
    'Getting current application strategy recommendations',
  ],
  not_suitable_for: [
    'Issuing new directives',
    'Modifying directives',
  ],
  examples: [
    {
      goal: 'Check if applications are allowed',
      input: { user_id: 'user_123' },
      output: {
        can_apply: false,
        active_directives: [
          {
            id: 'dir_1',
            type: 'pause_applications',
            priority: 'high',
            title: 'Pause for System Design Prep',
            description: 'User needs to complete system design practice',
            target_agent: 'action',
            action_required: 'Wait until user completes mock interviews',
            expires_at: '2026-01-14T00:00:00Z',
          },
        ],
        blocking_directives: [
          {
            id: 'dir_1',
            type: 'pause_applications',
            title: 'Pause for System Design Prep',
            reason: 'User needs to complete system design practice',
          },
        ],
        recommendations: [],
        message: 'Applications are PAUSED. 1 blocking directive(s) active.',
      },
    },
  ],
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
    // Career Automation Service tools
    submitApplicationTool,
    generateLatexResumeTool,
    hybridJobSourceTool,
    // Pre-application analysis
    formFieldAnalyzerTool,
    // Strategist Integration
    directiveCheckerTool,
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
    // Career Automation Service tools
    'submit_application',
    'generate_latex_resume',
    'hybrid_job_source',
    // Pre-application analysis
    'form_field_analyzer',
    // Strategist Integration
    'directive_checker',
  ];
}

export default {
  registerActionTools,
  getActionToolIds,
};
