/**
 * Resume Architect Agent Implementation
 *
 * Autonomous resume tailoring agent that:
 * 1. Analyzes job descriptions for requirements
 * 2. Tailors resume content to match opportunities
 * 3. Optimizes bullet points for impact
 * 4. Generates tailored PDF resumes
 *
 * @see PHASE_6_AUTORESUME_PLAN.md - Milestone 2
 */

import { db } from '@/drizzle/db';
import { jobListings } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

import { createStateMachine, AgentStateMachine } from '../../core/agent-state';
import { createMemoryManager, AgentMemoryManager } from '../../core/agent-memory';
import {
  createToolExecutor,
  ToolExecutor,
  createToolSelector,
  ToolSelector,
} from '../../tools';
import { registerResumeArchitectTools, getResumeArchitectToolIds } from './resume-tools';

// ============================================================================
// Types
// ============================================================================

/**
 * Context for resume tailoring
 */
export interface ResumeTailoringContext {
  task_id: string;
  user_id: string;
  job_description?: string;
  job_listing_id?: string;
  template?: 'modern' | 'classic' | 'minimalist' | 'deedy';
}

/**
 * Context for batch tailoring (multiple jobs)
 */
export interface BatchTailoringContext {
  task_id: string;
  user_id: string;
  job_listing_ids: string[];
  template?: 'modern' | 'classic' | 'minimalist' | 'deedy';
}

/**
 * Context for resume review/feedback
 */
export interface ResumeReviewContext {
  task_id: string;
  user_id: string;
  resume_file_id: string;
  target_role: string;
}

/**
 * Output of resume tailoring
 */
export interface ResumeTailoringOutput {
  pdf_url: string;
  file_id: string;
  match_score: number;
  template_used: string;
  optimizations_applied: number;
  summary_used: string;
  recommendations: string[];
}

/**
 * Output of job analysis
 */
export interface JobAnalysisOutput {
  title: string;
  seniority_level: string;
  required_skills: string[];
  keywords: string[];
  match_score: number;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
}

/**
 * Agent configuration
 */
export interface ResumeArchitectConfig {
  max_iterations: number;
  confidence_threshold: number;
  timeout_ms: number;
  enable_learning: boolean;
  auto_optimize_bullets: boolean;
  default_template: 'modern' | 'classic' | 'minimalist' | 'deedy';
}

/**
 * Result type
 */
export interface ResumeArchitectResult<T> {
  success: boolean;
  output: T | null;
  iterations: number;
  confidence: number;
  duration_ms: number;
  reasoning_trace: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ResumeArchitectConfig = {
  max_iterations: 3,
  confidence_threshold: 0.85,
  timeout_ms: 120000, // 2 minutes
  enable_learning: true,
  auto_optimize_bullets: true,
  default_template: 'modern',
};

// ============================================================================
// Resume Architect Agent Class
// ============================================================================

export class ResumeArchitectAgent {
  private config: ResumeArchitectConfig;
  private stateMachine: AgentStateMachine | null = null;
  private memory: AgentMemoryManager;
  private toolSelector: ToolSelector;
  private toolExecutor: ToolExecutor;
  private reasoningTrace: string[] = [];

  constructor(
    private taskId: string,
    private userId: string,
    config: Partial<ResumeArchitectConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.memory = createMemoryManager({
      agent_name: 'resume-architect',
      task_id: taskId,
      user_id: userId,
    });

    this.toolSelector = createToolSelector({ model: 'gpt-4o-mini' });
    this.toolExecutor = createToolExecutor({
      default_timeout_ms: 60000,
      default_max_retries: 2,
      enable_logging: true,
    });

    // Register tools
    registerResumeArchitectTools();
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Analyze a job and provide tailoring recommendations
   */
  async analyzeJob(context: ResumeTailoringContext): Promise<ResumeArchitectResult<JobAnalysisOutput>> {
    const startTime = Date.now();
    this.reasoningTrace = [];

    try {
      this.trace('Starting job analysis');

      // Initialize state machine
      this.stateMachine = await createStateMachine({
        agent_name: 'resume-architect',
        user_id: context.user_id,
        task_id: context.task_id,
      });

      await this.stateMachine.transition({
        type: 'START',
        payload: { task_id: context.task_id },
      });

      // Get job description
      let jobDescription = context.job_description;
      let jobTitle = 'Unknown Role';

      if (context.job_listing_id && !jobDescription) {
        const job = await db.query.jobListings.findFirst({
          where: eq(jobListings.id, context.job_listing_id),
        });
        if (job) {
          jobDescription = job.raw_data?.description || '';
          jobTitle = job.title;
        }
      }

      if (!jobDescription) {
        throw new Error('No job description provided');
      }

      this.trace(`Analyzing job: ${jobTitle}`);

      // Step 1: Analyze job description
      const analysisResult = await this.toolExecutor.execute('job_analyzer', {
        job_description: jobDescription,
      });

      if (!analysisResult.success) {
        throw new Error(`Job analysis failed: ${analysisResult.error}`);
      }

      const analysis = analysisResult.output as {
        title: string;
        seniority_level: string;
        required_skills: { must_have: string[]; nice_to_have: string[] };
        keywords: string[];
      };

      this.trace(`Extracted ${analysis.keywords.length} keywords`);

      // Step 2: Get tailoring strategy
      const tailorResult = await this.toolExecutor.execute('resume_tailor', {
        user_id: context.user_id,
        job_description: jobDescription,
        job_title: analysis.title,
      });

      if (!tailorResult.success) {
        throw new Error(`Tailoring analysis failed: ${tailorResult.error}`);
      }

      const tailoring = tailorResult.output as {
        match_score: number;
        skills_to_highlight: string[];
        missing_keywords: string[];
        recommendations: string[];
      };

      this.trace(`Match score: ${tailoring.match_score}%`);

      await this.stateMachine.transition({
        type: 'EVALUATION_PASS',
        payload: { confidence: 0.9 },
      });

      // Build output
      const output: JobAnalysisOutput = {
        title: analysis.title,
        seniority_level: analysis.seniority_level,
        required_skills: [
          ...analysis.required_skills.must_have,
          ...analysis.required_skills.nice_to_have,
        ],
        keywords: analysis.keywords,
        match_score: tailoring.match_score,
        strengths: tailoring.skills_to_highlight,
        gaps: tailoring.missing_keywords,
        recommendations: tailoring.recommendations,
      };

      // Record learning
      if (this.config.enable_learning) {
        await this.memory.recordEpisode({
          episode_type: 'job_analysis',
          action_taken: 'analyze_job',
          context: {
            trigger_event: 'analyze_job',
            input_summary: `Analysis for ${analysis.title}`,
          },
          outcome: {
            success: true,
            result_summary: `Match score: ${tailoring.match_score}%`,
            metrics: {
              match_score: tailoring.match_score,
              keywords_found: analysis.keywords.length,
            },
          },
        });
      }

      return {
        success: true,
        output,
        iterations: 1,
        confidence: 0.9,
        duration_ms: Date.now() - startTime,
        reasoning_trace: this.reasoningTrace,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.trace(`Error: ${errorMessage}`);

      if (this.stateMachine) {
        await this.stateMachine.transition({
          type: 'STEP_FAILED',
          payload: { step_id: 'analysis', error: errorMessage },
        });
      }

      return {
        success: false,
        output: null,
        iterations: 0,
        confidence: 0,
        duration_ms: Date.now() - startTime,
        reasoning_trace: this.reasoningTrace,
      };
    } finally {
      await this.memory.clearWorking();
    }
  }

  /**
   * Generate a tailored resume for a specific job
   */
  async generateTailoredResume(context: ResumeTailoringContext): Promise<ResumeArchitectResult<ResumeTailoringOutput>> {
    const startTime = Date.now();
    this.reasoningTrace = [];

    try {
      this.trace('Starting tailored resume generation');

      // Initialize state machine
      this.stateMachine = await createStateMachine({
        agent_name: 'resume-architect',
        user_id: context.user_id,
        task_id: context.task_id,
      });

      await this.stateMachine.transition({
        type: 'START',
        payload: { task_id: context.task_id },
      });

      // Get job description
      let jobDescription = context.job_description;
      let jobTitle = 'Target Role';

      if (context.job_listing_id && !jobDescription) {
        const job = await db.query.jobListings.findFirst({
          where: eq(jobListings.id, context.job_listing_id),
        });
        if (job) {
          jobDescription = job.raw_data?.description || '';
          jobTitle = job.title;
        }
      }

      if (!jobDescription) {
        throw new Error('No job description provided');
      }

      this.trace(`Generating tailored resume for: ${jobTitle}`);

      // Step 1: Get tailoring strategy
      const tailorResult = await this.toolExecutor.execute('resume_tailor', {
        user_id: context.user_id,
        job_description: jobDescription,
        job_title: jobTitle,
      });

      if (!tailorResult.success) {
        throw new Error(`Tailoring analysis failed: ${tailorResult.error}`);
      }

      const tailoring = tailorResult.output as {
        match_score: number;
        summary_recommendation: string;
        experience_optimizations: Array<{
          original: string;
          optimized: string;
          reasoning: string;
        }>;
        skills_to_highlight: string[];
        recommendations: string[];
      };

      this.trace(`Match score: ${tailoring.match_score}%, ${tailoring.experience_optimizations.length} optimizations`);

      // Step 2: Generate custom summary
      let customSummary = tailoring.summary_recommendation;

      // If we need a more detailed summary, generate one
      if (!customSummary || customSummary.length < 50) {
        const summaryResult = await this.toolExecutor.execute('summary_generator', {
          user_id: context.user_id,
          target_role: jobTitle,
          keywords: tailoring.skills_to_highlight,
        });

        if (summaryResult.success) {
          const summaryOutput = summaryResult.output as { summary: string };
          customSummary = summaryOutput.summary;
          this.trace('Generated custom summary');
        }
      }

      // Step 3: Prepare optimized bullets
      const optimizedBullets: Array<{
        experience_index: number;
        bullet_index: number;
        optimized_text: string;
      }> = [];

      if (this.config.auto_optimize_bullets && tailoring.experience_optimizations.length > 0) {
        // The tailoring already provides optimized bullets
        // Map them to the expected format (assuming they're in order)
        tailoring.experience_optimizations.forEach((opt, index) => {
          optimizedBullets.push({
            experience_index: 0, // First experience (most recent)
            bullet_index: index,
            optimized_text: opt.optimized,
          });
        });
        this.trace(`Applying ${optimizedBullets.length} bullet optimizations`);
      }

      // Step 4: Generate PDF
      const template = context.template || this.config.default_template;
      const generateResult = await this.toolExecutor.execute('tailored_resume_generator', {
        user_id: context.user_id,
        job_listing_id: context.job_listing_id,
        template,
        custom_summary: customSummary,
        optimized_bullets: optimizedBullets,
      });

      if (!generateResult.success) {
        throw new Error(`Resume generation failed: ${generateResult.error}`);
      }

      const generated = generateResult.output as {
        success: boolean;
        pdf_url: string;
        file_id: string;
        template_used: string;
        message: string;
      };

      if (!generated.success) {
        throw new Error(generated.message);
      }

      this.trace(`Generated PDF: ${generated.file_id}`);

      await this.stateMachine.transition({
        type: 'EVALUATION_PASS',
        payload: { confidence: 0.9 },
      });

      // Record learning
      if (this.config.enable_learning) {
        await this.memory.recordEpisode({
          episode_type: 'resume_generation',
          action_taken: 'generate_tailored_resume',
          context: {
            trigger_event: 'generate_resume',
            input_summary: `Tailored resume for ${jobTitle}`,
          },
          outcome: {
            success: true,
            result_summary: `Generated ${generated.template_used} template`,
            metrics: {
              match_score: tailoring.match_score,
              optimizations: optimizedBullets.length,
            },
          },
        });
      }

      const output: ResumeTailoringOutput = {
        pdf_url: generated.pdf_url,
        file_id: generated.file_id,
        match_score: tailoring.match_score,
        template_used: generated.template_used,
        optimizations_applied: optimizedBullets.length,
        summary_used: customSummary,
        recommendations: tailoring.recommendations,
      };

      return {
        success: true,
        output,
        iterations: 1,
        confidence: 0.9,
        duration_ms: Date.now() - startTime,
        reasoning_trace: this.reasoningTrace,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.trace(`Error: ${errorMessage}`);

      if (this.stateMachine) {
        await this.stateMachine.transition({
          type: 'STEP_FAILED',
          payload: { step_id: 'generation', error: errorMessage },
        });
      }

      return {
        success: false,
        output: null,
        iterations: 0,
        confidence: 0,
        duration_ms: Date.now() - startTime,
        reasoning_trace: this.reasoningTrace,
      };
    } finally {
      await this.memory.clearWorking();
    }
  }

  /**
   * Generate a generic resume (not tailored to specific job)
   */
  async generateGenericResume(
    userId: string,
    template?: 'modern' | 'classic' | 'minimalist' | 'deedy'
  ): Promise<ResumeArchitectResult<{ pdf_url: string; file_id: string; template_used: string }>> {
    const startTime = Date.now();
    this.reasoningTrace = [];

    try {
      this.trace('Generating generic resume');

      const generateResult = await this.toolExecutor.execute('tailored_resume_generator', {
        user_id: userId,
        template: template || this.config.default_template,
      });

      if (!generateResult.success) {
        throw new Error(`Resume generation failed: ${generateResult.error}`);
      }

      const generated = generateResult.output as {
        success: boolean;
        pdf_url: string;
        file_id: string;
        template_used: string;
        message: string;
      };

      if (!generated.success) {
        throw new Error(generated.message);
      }

      this.trace(`Generated PDF: ${generated.file_id}`);

      return {
        success: true,
        output: {
          pdf_url: generated.pdf_url,
          file_id: generated.file_id,
          template_used: generated.template_used,
        },
        iterations: 1,
        confidence: 0.95,
        duration_ms: Date.now() - startTime,
        reasoning_trace: this.reasoningTrace,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.trace(`Error: ${errorMessage}`);

      return {
        success: false,
        output: null,
        iterations: 0,
        confidence: 0,
        duration_ms: Date.now() - startTime,
        reasoning_trace: this.reasoningTrace,
      };
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private trace(message: string): void {
    const timestamp = new Date().toISOString();
    this.reasoningTrace.push(`[${timestamp}] ${message}`);
    console.log(`[ResumeArchitectAgent] ${message}`);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createResumeArchitectAgent(
  taskId: string,
  userId: string,
  config?: Partial<ResumeArchitectConfig>
): ResumeArchitectAgent {
  return new ResumeArchitectAgent(taskId, userId, config);
}

/**
 * Quick resume tailoring function
 */
export async function tailorResume(
  userId: string,
  options: {
    job_description?: string;
    job_listing_id?: string;
    template?: 'modern' | 'classic' | 'minimalist' | 'deedy';
    config?: Partial<ResumeArchitectConfig>;
  }
): Promise<ResumeArchitectResult<ResumeTailoringOutput>> {
  const taskId = crypto.randomUUID();
  const agent = createResumeArchitectAgent(taskId, userId, options.config);

  return agent.generateTailoredResume({
    task_id: taskId,
    user_id: userId,
    job_description: options.job_description,
    job_listing_id: options.job_listing_id,
    template: options.template,
  });
}

/**
 * Quick job analysis function
 */
export async function analyzeJobForResume(
  userId: string,
  options: {
    job_description?: string;
    job_listing_id?: string;
    config?: Partial<ResumeArchitectConfig>;
  }
): Promise<ResumeArchitectResult<JobAnalysisOutput>> {
  const taskId = crypto.randomUUID();
  const agent = createResumeArchitectAgent(taskId, userId, options.config);

  return agent.analyzeJob({
    task_id: taskId,
    user_id: userId,
    job_description: options.job_description,
    job_listing_id: options.job_listing_id,
  });
}

/**
 * Quick generic resume generation
 */
export async function generateResume(
  userId: string,
  template?: 'modern' | 'classic' | 'minimalist' | 'deedy',
  config?: Partial<ResumeArchitectConfig>
): Promise<ResumeArchitectResult<{ pdf_url: string; file_id: string; template_used: string }>> {
  const taskId = crypto.randomUUID();
  const agent = createResumeArchitectAgent(taskId, userId, config);

  return agent.generateGenericResume(userId, template);
}
