/**
 * Resume Architect Agent Tools
 *
 * Tool definitions for resume tailoring, optimization, and generation.
 *
 * @see PHASE_6_AUTORESUME_PLAN.md - Milestone 2
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { toolRegistry, type ToolDefinition } from '../../tools/tool-registry';
import { db } from '@/drizzle/db';
import { users, userProfiles, userSkills } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import {
  RESUME_PROMPTS,
  buildJobAnalysisPrompt,
  buildResumeTailoringPrompt,
  buildBulletOptimizationPrompt,
  buildSummaryGenerationPrompt,
  buildSkillsSectionPrompt,
} from './resume-prompts';
import { safeJsonParse } from '../../utils/safe-json';
import {
  getCareerAutomationClient,
  type ResumeProfile,
} from '@/lib/services/career-automation-client';

// ============================================================================
// Input/Output Schemas
// ============================================================================

const JobAnalyzerInput = z.object({
  job_description: z.string(),
  job_url: z.string().optional(),
});

const JobAnalyzerOutput = z.object({
  title: z.string(),
  company_type: z.string(),
  seniority_level: z.string(),
  required_skills: z.object({
    must_have: z.array(z.string()),
    nice_to_have: z.array(z.string()),
  }),
  key_responsibilities: z.array(z.string()),
  keywords: z.array(z.string()),
  culture_indicators: z.array(z.string()),
  experience_level: z.string(),
});

const ResumeTailorInput = z.object({
  user_id: z.string(),
  job_description: z.string(),
  job_title: z.string().optional(),
});

const ResumeTailorOutput = z.object({
  match_score: z.number(),
  summary_recommendation: z.string(),
  experience_optimizations: z.array(z.object({
    original: z.string(),
    optimized: z.string(),
    reasoning: z.string(),
  })),
  skills_to_highlight: z.array(z.string()),
  missing_keywords: z.array(z.string()),
  recommendations: z.array(z.string()),
});

const BulletOptimizerInput = z.object({
  bullet: z.string(),
  job_title: z.string(),
  target_role: z.string(),
  keywords: z.array(z.string()).optional(),
});

const BulletOptimizerOutput = z.object({
  optimized: z.string(),
  action_verb: z.string(),
  metrics_added: z.boolean(),
  keywords_included: z.array(z.string()),
  reasoning: z.string(),
});

const SummaryGeneratorInput = z.object({
  user_id: z.string(),
  target_role: z.string(),
  keywords: z.array(z.string()).optional(),
});

const SummaryGeneratorOutput = z.object({
  summary: z.string(),
  keywords_used: z.array(z.string()),
  positioning: z.string(),
  hook: z.string(),
});

const ResumeGeneratorInput = z.object({
  user_id: z.string(),
  job_listing_id: z.string().optional(),
  template: z.enum(['modern', 'classic', 'minimalist', 'deedy']).optional(),
  custom_summary: z.string().optional(),
  optimized_bullets: z.array(z.object({
    experience_index: z.number(),
    bullet_index: z.number(),
    optimized_text: z.string(),
  })).optional(),
});

const ResumeGeneratorOutput = z.object({
  success: z.boolean(),
  pdf_url: z.string().optional(),
  file_id: z.string().optional(),
  template_used: z.string(),
  message: z.string(),
});

const SkillsOptimizerInput = z.object({
  user_id: z.string(),
  required_skills: z.array(z.string()),
  nice_to_have_skills: z.array(z.string()).optional(),
});

const SkillsOptimizerOutput = z.object({
  technical_skills: z.array(z.string()),
  tools_frameworks: z.array(z.string()),
  soft_skills: z.array(z.string()),
  matched_required: z.array(z.string()),
  matched_nice_to_have: z.array(z.string()),
  missing_required: z.array(z.string()),
  recommendation: z.string(),
});

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Job Analyzer - Extracts key information from job descriptions
 */
const jobAnalyzerTool: ToolDefinition<
  z.infer<typeof JobAnalyzerInput>,
  z.infer<typeof JobAnalyzerOutput>
> = {
  id: 'job_analyzer',
  name: 'Job Analyzer',
  description: 'Analyze a job description to extract requirements, keywords, and key information',
  version: '1.0.0',
  category: 'analysis',
  tags: ['job', 'analysis', 'keywords', 'requirements'],
  input_schema: JobAnalyzerInput,
  output_schema: JobAnalyzerOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    const prompt = buildJobAnalysisPrompt(input.job_description);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: RESUME_PROMPTS.RESUME_ARCHITECT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from job analyzer');

    return safeJsonParse(content, 'job analysis');
  },
  cost: { latency_ms: 2000, tokens: 500 },
  requires: [],
  best_for: ['Extracting job requirements and keywords'],
  not_suitable_for: ['Generating resumes'],
  examples: [],
  enabled: true,
};

/**
 * Resume Tailor - Creates tailoring strategy for a specific job
 */
const resumeTailorTool: ToolDefinition<
  z.infer<typeof ResumeTailorInput>,
  z.infer<typeof ResumeTailorOutput>
> = {
  id: 'resume_tailor',
  name: 'Resume Tailor',
  description: 'Create a tailored resume strategy for a specific job opportunity',
  version: '1.0.0',
  category: 'analysis',
  tags: ['resume', 'tailoring', 'strategy', 'optimization'],
  input_schema: ResumeTailorInput,
  output_schema: ResumeTailorOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    // Fetch user profile
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

    // First, analyze the job
    const jobAnalysisPrompt = buildJobAnalysisPrompt(input.job_description);
    const jobResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: RESUME_PROMPTS.RESUME_ARCHITECT },
        { role: 'user', content: jobAnalysisPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const jobContent = jobResponse.choices[0]?.message?.content;
    if (!jobContent) throw new Error('Empty response from job analyzer');

    const jobAnalysis = safeJsonParse(jobContent, 'job analysis') as {
      title: string;
      required_skills: { must_have: string[]; nice_to_have: string[] };
      keywords: string[];
    };

    // Build profile for tailoring
    const workHistory = (profile?.work_history as Array<{
      title: string;
      company: string;
      description?: string;
    }>) || [];

    const education = (profile?.education as Array<{
      degree: string;
      institution: string;
    }>) || [];

    const candidateProfile = {
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Candidate',
      experience: workHistory.map((w) => ({
        title: w.title,
        company: w.company,
        bullets: w.description ? w.description.split('\n').filter(Boolean) : [],
      })),
      skills: userSkillRecords.map((us) => us.skill?.name || '').filter(Boolean),
      education: education.map((e) => ({
        degree: e.degree,
        institution: e.institution,
      })),
    };

    // Create tailoring strategy
    const tailorPrompt = buildResumeTailoringPrompt(candidateProfile, jobAnalysis);

    const tailorResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: RESUME_PROMPTS.EXPERIENCE_TAILORER },
        { role: 'user', content: tailorPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const tailorContent = tailorResponse.choices[0]?.message?.content;
    if (!tailorContent) throw new Error('Empty response from resume tailor');

    const result = safeJsonParse(tailorContent, 'tailoring strategy') as {
      match_score: number;
      summary_recommendation: string;
      bullets_to_optimize: Array<{
        original: string;
        optimized: string;
        reasoning: string;
      }>;
      skills_to_highlight: string[];
      missing_keywords: string[];
      additional_recommendations: string[];
    };

    return {
      match_score: result.match_score,
      summary_recommendation: result.summary_recommendation,
      experience_optimizations: result.bullets_to_optimize || [],
      skills_to_highlight: result.skills_to_highlight || [],
      missing_keywords: result.missing_keywords || [],
      recommendations: result.additional_recommendations || [],
    };
  },
  cost: { latency_ms: 5000, tokens: 1500 },
  requires: [],
  best_for: ['Creating tailored resume strategies'],
  not_suitable_for: ['Generating PDFs'],
  examples: [],
  enabled: true,
};

/**
 * Bullet Optimizer - Optimizes individual bullet points
 */
const bulletOptimizerTool: ToolDefinition<
  z.infer<typeof BulletOptimizerInput>,
  z.infer<typeof BulletOptimizerOutput>
> = {
  id: 'bullet_optimizer',
  name: 'Bullet Optimizer',
  description: 'Optimize a resume bullet point for impact and keywords',
  version: '1.0.0',
  category: 'generation',
  tags: ['bullet', 'optimization', 'writing'],
  input_schema: BulletOptimizerInput,
  output_schema: BulletOptimizerOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    const prompt = buildBulletOptimizationPrompt(input.bullet, {
      job_title: input.job_title,
      target_role: input.target_role,
      keywords: input.keywords || [],
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: RESUME_PROMPTS.BULLET_OPTIMIZER },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from bullet optimizer');

    return safeJsonParse(content, 'bullet optimization');
  },
  cost: { latency_ms: 1500, tokens: 300 },
  requires: [],
  best_for: ['Improving individual bullet points'],
  not_suitable_for: ['Full resume analysis'],
  examples: [],
  enabled: true,
};

/**
 * Summary Generator - Generates professional summaries
 */
const summaryGeneratorTool: ToolDefinition<
  z.infer<typeof SummaryGeneratorInput>,
  z.infer<typeof SummaryGeneratorOutput>
> = {
  id: 'summary_generator',
  name: 'Summary Generator',
  description: 'Generate a tailored professional summary for a resume',
  version: '1.0.0',
  category: 'generation',
  tags: ['summary', 'generation', 'professional'],
  input_schema: SummaryGeneratorInput,
  output_schema: SummaryGeneratorOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    // Fetch user profile
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

    const workHistory = (profile?.work_history as Array<{
      title: string;
      company: string;
      description?: string;
    }>) || [];

    // Extract top achievements from work history
    const achievements = workHistory
      .flatMap((w) => w.description ? w.description.split('\n').filter(Boolean).slice(0, 1) : [])
      .slice(0, 3);

    const candidateProfile = {
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Candidate',
      years_experience: profile?.years_of_experience || 0,
      current_title: workHistory[0]?.title || 'Professional',
      key_skills: userSkillRecords.map((us) => us.skill?.name || '').filter(Boolean).slice(0, 5),
      top_achievements: achievements.length > 0 ? achievements : ['Delivered impactful results'],
    };

    const prompt = buildSummaryGenerationPrompt(
      candidateProfile,
      input.target_role,
      input.keywords || []
    );

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: RESUME_PROMPTS.SUMMARY_WRITER },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from summary generator');

    return safeJsonParse(content, 'summary generation');
  },
  cost: { latency_ms: 2000, tokens: 400 },
  requires: [],
  best_for: ['Creating professional summaries'],
  not_suitable_for: ['Full resume generation'],
  examples: [],
  enabled: true,
};

/**
 * Skills Optimizer - Optimizes skills section for a job
 */
const skillsOptimizerTool: ToolDefinition<
  z.infer<typeof SkillsOptimizerInput>,
  z.infer<typeof SkillsOptimizerOutput>
> = {
  id: 'skills_optimizer',
  name: 'Skills Optimizer',
  description: 'Optimize skills section to match job requirements',
  version: '1.0.0',
  category: 'analysis',
  tags: ['skills', 'optimization', 'matching'],
  input_schema: SkillsOptimizerInput,
  output_schema: SkillsOptimizerOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    // Fetch user skills
    const userSkillRecords = await db.query.userSkills.findMany({
      where: eq(userSkills.user_id, input.user_id),
      with: { skill: true },
    });

    const candidateSkills = userSkillRecords
      .map((us) => us.skill?.name || '')
      .filter(Boolean);

    const prompt = buildSkillsSectionPrompt(
      candidateSkills,
      input.required_skills,
      input.nice_to_have_skills || []
    );

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: RESUME_PROMPTS.SKILLS_MATCHER },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from skills optimizer');

    return safeJsonParse(content, 'skills optimization');
  },
  cost: { latency_ms: 1500, tokens: 350 },
  requires: [],
  best_for: ['Optimizing skills sections'],
  not_suitable_for: ['Experience optimization'],
  examples: [],
  enabled: true,
};

/**
 * Tailored Resume Generator - Generates PDF with optimizations applied
 */
const tailoredResumeGeneratorTool: ToolDefinition<
  z.infer<typeof ResumeGeneratorInput>,
  z.infer<typeof ResumeGeneratorOutput>
> = {
  id: 'tailored_resume_generator',
  name: 'Tailored Resume Generator',
  description: 'Generate a tailored PDF resume with optimizations applied',
  version: '1.0.0',
  category: 'external_api',
  tags: ['resume', 'pdf', 'generation', 'tailored'],
  input_schema: ResumeGeneratorInput,
  output_schema: ResumeGeneratorOutput,
  handler: async (input) => {
    const client = getCareerAutomationClient();

    // Check if service is available
    const isAvailable = await client.isAvailable();
    if (!isAvailable) {
      return {
        success: false,
        template_used: input.template || 'modern',
        message: 'Career automation service is not available. Please ensure the Python service is running.',
      };
    }

    // Fetch user profile
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
    const preferredLocation = profile?.preferred_locations?.[0] || '';

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

    // Apply optimized bullets if provided
    const experienceWithOptimizations = workHistory.map((w, expIndex) => {
      const bullets = w.description ? w.description.split('\n').filter(Boolean) : [];

      // Replace bullets with optimized versions if provided
      const optimizedBullets = bullets.map((bullet, bulletIndex) => {
        const optimization = input.optimized_bullets?.find(
          (ob) => ob.experience_index === expIndex && ob.bullet_index === bulletIndex
        );
        return optimization ? optimization.optimized_text : bullet;
      });

      return {
        title: w.title,
        company: w.company,
        location: w.location,
        start_date: w.start_date,
        end_date: w.end_date || 'Present',
        bullets: optimizedBullets,
      };
    });

    const resumeProfile: ResumeProfile = {
      name: fullName,
      email: user.email,
      phone: '',
      location: preferredLocation || undefined,
      linkedin: undefined,
      github: undefined,
      portfolio: undefined,
      summary: input.custom_summary || profile?.bio || undefined,
      experience: experienceWithOptimizations,
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

    // Fetch job details for tailoring if provided
    let jobTitle: string | undefined;
    let jobDescription: string | undefined;
    let jobCompany: string | undefined;

    if (input.job_listing_id) {
      const { jobListings } = await import('@/drizzle/schema');
      const job = await db.query.jobListings.findFirst({
        where: eq(jobListings.id, input.job_listing_id),
      });
      if (job) {
        jobTitle = job.title;
        jobCompany = job.company;
        jobDescription = job.raw_data?.description;
      }
    }

    try {
      const result = await client.generateResume({
        profile: resumeProfile,
        template: input.template || 'modern',
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
        template_used: input.template || 'modern',
        message: `Resume generation failed: ${errorMessage}`,
      };
    }
  },
  cost: { latency_ms: 10000, tokens: 0 },
  requires: [],
  best_for: ['Generating tailored PDF resumes'],
  not_suitable_for: ['Resume analysis'],
  examples: [],
  enabled: true,
};

// ============================================================================
// Registration
// ============================================================================

/**
 * Register all Resume Architect agent tools
 */
export function registerResumeArchitectTools(): void {
  const tools = [
    jobAnalyzerTool,
    resumeTailorTool,
    bulletOptimizerTool,
    summaryGeneratorTool,
    skillsOptimizerTool,
    tailoredResumeGeneratorTool,
  ] as const;

  for (const tool of tools) {
    if (!toolRegistry.has(tool.id)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toolRegistry.register(tool as any);
    }
  }

  console.log(`[ResumeArchitect] Registered ${tools.length} tools`);
}

/**
 * Get IDs of all Resume Architect tools
 */
export function getResumeArchitectToolIds(): string[] {
  return [
    'job_analyzer',
    'resume_tailor',
    'bullet_optimizer',
    'summary_generator',
    'skills_optimizer',
    'tailored_resume_generator',
  ];
}

export default {
  registerResumeArchitectTools,
  getResumeArchitectToolIds,
};
