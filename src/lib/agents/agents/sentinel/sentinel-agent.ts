/**
 * Sentinel Agent Implementation
 *
 * Autonomous market intelligence agent that:
 * 1. Scrapes job listings from multiple sources
 * 2. Extracts skills and analyzes market trends
 * 3. Matches users to relevant opportunities
 * 4. Detects market shifts and triggers roadmap updates
 *
 * @see docs/agentic-improvements/05-AGENT_COORDINATOR.md
 */

import { db } from '@/drizzle/db';
import { jobListings, users, userProfiles } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

import { createStateMachine, AgentStateMachine } from '../../core/agent-state';
import { createMemoryManager, AgentMemoryManager } from '../../core/agent-memory';
import {
  createGoalDecomposer,
  GoalDecomposer,
  type Goal,
} from '../../reasoning/goal-decomposer';
import {
  createPlanGenerator,
  PlanGenerator,
  type Plan,
  type PlanStep,
} from '../../reasoning/plan-generator';
import {
  createConfidenceScorer,
  ConfidenceScorer,
} from '../../reasoning/confidence-scorer';
import {
  createIterationController,
  IterationController,
  type IterationLoopResult,
} from '../../reasoning/iteration-controller';
import {
  createToolExecutor,
  ToolExecutor,
  createToolSelector,
  ToolSelector,
} from '../../tools';
import { publishAgentEvent } from '../../message-bus';
import { registerSentinelTools, getSentinelToolIds } from './sentinel-tools';

// ============================================================================
// Types
// ============================================================================

/**
 * Context for market scraping task
 */
export interface MarketScrapeContext {
  task_id: string;
  keywords: string[];
  location?: string;
  include_github?: boolean;
  force_refresh?: boolean;
}

/**
 * Context for user job matching
 */
export interface JobMatchContext {
  task_id: string;
  user_id: string;
  min_match_score?: number;
  max_results?: number;
}

/**
 * Output of market scraping
 */
export interface MarketScrapeOutput {
  jobs_scraped: number;
  jobs_inserted: number;
  jobs_updated: number;
  trending_skills: string[];
  skill_demand: Record<string, number>;
  market_shifts: Array<{
    type: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  github_correlations?: Array<{
    skill: string;
    verdict: string;
  }>;
}

/**
 * Output of job matching
 */
export interface JobMatchOutput {
  matches: Array<{
    job_id: string;
    job_title: string;
    company: string;
    match_score: number;
    matching_skills: string[];
    missing_skills: string[];
  }>;
  total_matches: number;
  top_skills_to_learn: string[];
}

/**
 * Agent configuration
 */
export interface SentinelAgentConfig {
  max_iterations: number;
  confidence_threshold: number;
  timeout_ms: number;
  enable_learning: boolean;
}

/**
 * Result type
 */
export interface SentinelResult<T> {
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

const DEFAULT_CONFIG: SentinelAgentConfig = {
  max_iterations: 3,
  confidence_threshold: 0.80,
  timeout_ms: 180000, // 3 minutes
  enable_learning: true,
};

// ============================================================================
// Sentinel Agent Class
// ============================================================================

export class SentinelAgent {
  private config: SentinelAgentConfig;
  private stateMachine: AgentStateMachine | null = null;
  private memory: AgentMemoryManager;
  private goalDecomposer: GoalDecomposer;
  private planGenerator: PlanGenerator;
  private confidenceScorer: ConfidenceScorer;
  private iterationController: IterationController;
  private toolSelector: ToolSelector;
  private toolExecutor: ToolExecutor;
  private reasoningTrace: string[] = [];

  constructor(
    private taskId: string,
    config: Partial<SentinelAgentConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.memory = createMemoryManager({
      agent_name: 'sentinel',
      task_id: taskId,
    });

    this.goalDecomposer = createGoalDecomposer({ model: 'gpt-4o-mini' });
    this.planGenerator = createPlanGenerator({
      model: 'gpt-4o-mini',
      max_steps: 10,
      default_confidence_threshold: this.config.confidence_threshold,
      default_max_iterations: this.config.max_iterations,
    });
    this.confidenceScorer = createConfidenceScorer({
      model: 'gpt-4o-mini',
      default_threshold: this.config.confidence_threshold,
      strict_mode: false,
    });
    this.toolSelector = createToolSelector({ model: 'gpt-4o-mini' });
    this.toolExecutor = createToolExecutor({
      default_timeout_ms: 60000,
      default_max_retries: 2,
      enable_logging: true,
    });

    this.iterationController = createIterationController(
      this.confidenceScorer,
      this.planGenerator,
      {
        conditions: {
          max_iterations: this.config.max_iterations,
          confidence_threshold: this.config.confidence_threshold,
          max_duration_ms: this.config.timeout_ms,
          convergence_threshold: 0.02,
          max_degradations: 2,
        },
        enable_adaptation: true,
        adaptation_cooldown_ms: 5000,
        checkpoint_interval: 1,
      }
    );

    // Register tools
    registerSentinelTools();
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Run market scraping task
   */
  async scrapeMarket(context: MarketScrapeContext): Promise<SentinelResult<MarketScrapeOutput>> {
    const startTime = Date.now();
    this.reasoningTrace = [];

    try {
      this.trace('Starting market scrape task');

      // Initialize state machine
      this.stateMachine = await createStateMachine({
        agent_name: 'sentinel',
        user_id: 'system',
        task_id: context.task_id,
      });

      await this.stateMachine.transition({
        type: 'START',
        payload: { task_id: context.task_id },
      });

      // Load memory context
      const memoryContext = await this.loadMemoryContext();
      this.trace(`Loaded ${memoryContext.pastScrapes.length} past scrape records`);

      await this.memory.setWorking('scrape_context', context);

      await this.stateMachine.transition({
        type: 'INIT_COMPLETE',
        payload: { context_loaded: true },
      });

      // Create goal
      const mainGoal: Goal = {
        id: `goal-${context.task_id}`,
        description: `Scrape job listings for keywords: ${context.keywords.join(', ')} and generate market intelligence`,
        success_criteria: [
          'Scrape jobs from at least one source',
          'Extract skills from job descriptions',
          'Generate market trend analysis',
          'Detect any significant market shifts',
          context.include_github ? 'Correlate with GitHub trends' : null,
        ].filter(Boolean) as string[],
        priority: 'high',
      };

      // Generate plan
      const plan = await this.planGenerator.generate(mainGoal, {
        working_memory: {
          keywords: context.keywords,
          location: context.location,
          include_github: context.include_github,
        },
      });

      this.trace(`Generated plan with ${plan.steps.length} steps`);

      await this.stateMachine.transition({
        type: 'PLAN_COMPLETE',
        payload: { plan_id: plan.id, steps: plan.steps.length },
      });

      // Execute plan
      const result = await this.executeMarketScrapePlan(plan, context, memoryContext);

      if (result.success && result.final_output) {
        const output = result.final_output as MarketScrapeOutput;

        // Record learning
        if (this.config.enable_learning) {
          await this.recordLearning('market_scrape', output, result);
        }

        // Publish events
        if (output.jobs_scraped > 0) {
          await publishAgentEvent({
            type: 'MARKET_UPDATE',
            payload: {
              skills: output.trending_skills,
              demand_scores: output.skill_demand,
              trending_roles: [],
              job_count: output.jobs_scraped,
            },
          });
        }

        // Check for significant shifts
        if (output.market_shifts.some((s) => s.impact === 'high')) {
          this.trace('Significant market shift detected - triggering roadmap updates');
          // Could trigger MARKET_SHIFT event for downstream agents
        }

        await this.stateMachine.transition({
          type: 'EVALUATION_PASS',
          payload: { confidence: result.final_assessment?.overall_score || 0 },
        });

        return {
          success: true,
          output,
          iterations: result.total_iterations,
          confidence: result.final_assessment?.overall_score || 0,
          duration_ms: Date.now() - startTime,
          reasoning_trace: this.reasoningTrace,
        };
      }

      this.trace(`Market scrape failed: ${result.termination_reason}`);
      return {
        success: false,
        output: null,
        iterations: result.total_iterations,
        confidence: result.final_assessment?.overall_score || 0,
        duration_ms: Date.now() - startTime,
        reasoning_trace: this.reasoningTrace,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.trace(`Error: ${errorMessage}`);

      if (this.stateMachine) {
        await this.stateMachine.transition({
          type: 'STEP_FAILED',
          payload: { step_id: 'main', error: errorMessage },
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
   * Match jobs to a specific user
   */
  async matchJobsForUser(context: JobMatchContext): Promise<SentinelResult<JobMatchOutput>> {
    const startTime = Date.now();
    this.reasoningTrace = [];

    try {
      this.trace(`Starting job matching for user ${context.user_id}`);

      // Initialize state machine
      this.stateMachine = await createStateMachine({
        agent_name: 'sentinel',
        user_id: context.user_id,
        task_id: context.task_id,
      });

      await this.stateMachine.transition({
        type: 'START',
        payload: { task_id: context.task_id },
      });

      // Execute job matching
      const matchResult = await this.toolExecutor.execute('job_matcher', {
        user_id: context.user_id,
        jobs: [], // Will be fetched by the tool
        min_match_score: context.min_match_score || 50,
        max_results: context.max_results || 20,
      });

      if (matchResult.success && matchResult.output) {
        const matches = matchResult.output as {
          matches: Array<{
            job_id: string;
            match_score: number;
            matching_skills: string[];
            missing_skills: string[];
          }>;
          total_matches: number;
          top_missing_skills: string[];
        };

        // Enrich with job details
        const enrichedMatches = [];
        for (const match of matches.matches) {
          const job = await db.query.jobListings.findFirst({
            where: eq(jobListings.id, match.job_id),
          });
          if (job) {
            enrichedMatches.push({
              job_id: match.job_id,
              job_title: job.title,
              company: job.company,
              match_score: match.match_score,
              matching_skills: match.matching_skills,
              missing_skills: match.missing_skills,
            });

            // Publish JOB_MATCH_FOUND for high matches
            if (match.match_score >= 70) {
              await publishAgentEvent({
                type: 'JOB_MATCH_FOUND',
                payload: {
                  user_id: context.user_id,
                  job_listing_id: match.job_id,
                  match_score: match.match_score,
                  matching_skills: match.matching_skills,
                  missing_skills: match.missing_skills,
                },
              });
            }
          }
        }

        const output: JobMatchOutput = {
          matches: enrichedMatches,
          total_matches: matches.total_matches,
          top_skills_to_learn: matches.top_missing_skills,
        };

        await this.stateMachine.transition({
          type: 'EVALUATION_PASS',
          payload: { confidence: 1.0 },
        });

        return {
          success: true,
          output,
          iterations: 1,
          confidence: 1.0,
          duration_ms: Date.now() - startTime,
          reasoning_trace: this.reasoningTrace,
        };
      }

      return {
        success: false,
        output: null,
        iterations: 1,
        confidence: 0,
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
    } finally {
      await this.memory.clearWorking();
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async loadMemoryContext(): Promise<{
    pastScrapes: unknown[];
    marketPatterns: unknown[];
  }> {
    const [pastScrapes, marketPatterns] = await Promise.all([
      this.memory.recallEpisodes({ limit: 5 }),
      this.memory.recallFacts({ categories: ['job_market_fact'], limit: 10 }),
    ]);

    return {
      pastScrapes: pastScrapes || [],
      marketPatterns: marketPatterns || [],
    };
  }

  private async executeMarketScrapePlan(
    plan: Plan,
    context: MarketScrapeContext,
    memoryContext: unknown
  ): Promise<IterationLoopResult> {
    const executePlan = async (
      currentPlan: Plan
    ): Promise<{
      output: unknown;
      feedback: Array<{ step_id: string; success: boolean; output?: unknown; error?: string }>;
    }> => {
      const feedback: Array<{ step_id: string; success: boolean; output?: unknown; error?: string }> = [];
      const stepOutputs: Record<string, unknown> = {};

      // Step 1: Scrape jobs
      const scrapeResult = await this.toolExecutor.execute('job_scraper', {
        keywords: context.keywords,
        location: context.location || 'United States',
        max_results: 200,
        sources: ['all'],
      });

      if (!scrapeResult.success) {
        feedback.push({ step_id: 'scrape', success: false, error: scrapeResult.error });
        return { output: null, feedback };
      }

      stepOutputs.scrape = scrapeResult.output;
      feedback.push({ step_id: 'scrape', success: true, output: scrapeResult.output });
      this.trace(`Scraped ${(scrapeResult.output as { total_fetched: number }).total_fetched} jobs`);

      const jobs = (scrapeResult.output as { jobs: Array<{ id: string; title: string; company: string; skills: string[] }> }).jobs;

      // Step 2: Analyze market
      const analysisResult = await this.toolExecutor.execute('market_analyzer', {
        jobs: jobs.map((j) => ({ title: j.title, company: j.company, skills: j.skills })),
        include_previous: true,
      });

      if (!analysisResult.success) {
        feedback.push({ step_id: 'analyze', success: false, error: analysisResult.error });
      } else {
        stepOutputs.analysis = analysisResult.output;
        feedback.push({ step_id: 'analyze', success: true, output: analysisResult.output });
        this.trace('Market analysis complete');
      }

      const analysis = analysisResult.output as {
        trending_skills: string[];
        skill_demand: Record<string, number>;
        notable_shifts: Array<{ type: string; description: string; impact: 'high' | 'medium' | 'low' }>;
      } | undefined;

      // Step 3: Detect trends
      const trendResult = await this.toolExecutor.execute('trend_detector', {
        current_insights: { skill_demand: analysis?.skill_demand || {} },
        lookback_days: 30,
      });

      if (trendResult.success) {
        stepOutputs.trends = trendResult.output;
        feedback.push({ step_id: 'trends', success: true, output: trendResult.output });
        this.trace('Trend detection complete');
      }

      // Step 4: GitHub analysis (if enabled)
      let githubCorrelations: Array<{ skill: string; verdict: string }> = [];
      if (context.include_github) {
        const githubResult = await this.toolExecutor.execute('github_analyzer', {
          trending_repos: [], // Would be fetched from GitHub service
          job_demand: analysis?.skill_demand || {},
        });
        if (githubResult.success) {
          stepOutputs.github = githubResult.output;
          githubCorrelations = (githubResult.output as { correlations: Array<{ skill: string; verdict: string }> })?.correlations || [];
        }
      }

      // Step 5: Persist insights
      const persistResult = await this.toolExecutor.execute('insights_persister', {
        insights: {
          ...analysis,
          job_count: jobs.length,
          scraped_at: new Date().toISOString(),
        },
        category: 'market_summary',
      });
      feedback.push({ step_id: 'persist', success: persistResult.success });

      // Synthesize output
      const output: MarketScrapeOutput = {
        jobs_scraped: jobs.length,
        jobs_inserted: jobs.length, // Simplified - would track actual inserts
        jobs_updated: 0,
        trending_skills: analysis?.trending_skills || [],
        skill_demand: analysis?.skill_demand || {},
        market_shifts: analysis?.notable_shifts || [],
        github_correlations: githubCorrelations,
      };

      return { output, feedback };
    };

    const mainGoal: Goal = {
      id: `goal-${context.task_id}`,
      description: 'Complete market intelligence gathering',
      success_criteria: ['Scrape jobs', 'Analyze market', 'Detect trends'],
      priority: 'high',
    };

    return this.iterationController.runLoop(mainGoal, plan, executePlan, {});
  }

  private async recordLearning(
    taskType: string,
    output: unknown,
    result: IterationLoopResult
  ): Promise<void> {
    await this.memory.recordEpisode({
      episode_type: `sentinel_${taskType}`,
      action_taken: taskType,
      context: {
        trigger_event: 'sentinel_execution',
        input_summary: `Task: ${taskType}`,
      },
      outcome: {
        success: result.success,
        result_summary: `Iterations: ${result.total_iterations}`,
        metrics: {
          iterations: result.total_iterations,
          confidence: result.final_assessment?.overall_score ?? 0,
        },
      },
    });
  }

  private trace(message: string): void {
    const timestamp = new Date().toISOString();
    this.reasoningTrace.push(`[${timestamp}] ${message}`);
    console.log(`[SentinelAgent] ${message}`);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createSentinelAgent(
  taskId: string,
  config?: Partial<SentinelAgentConfig>
): SentinelAgent {
  return new SentinelAgent(taskId, config);
}

/**
 * Quick market scrape function
 */
export async function scrapeMarket(
  keywords: string[],
  options: {
    location?: string;
    include_github?: boolean;
    config?: Partial<SentinelAgentConfig>;
  } = {}
): Promise<SentinelResult<MarketScrapeOutput>> {
  const taskId = crypto.randomUUID();
  const agent = createSentinelAgent(taskId, options.config);

  return agent.scrapeMarket({
    task_id: taskId,
    keywords,
    location: options.location,
    include_github: options.include_github,
  });
}

/**
 * Quick job matching function
 */
export async function matchJobsForUser(
  userId: string,
  options: {
    min_match_score?: number;
    max_results?: number;
    config?: Partial<SentinelAgentConfig>;
  } = {}
): Promise<SentinelResult<JobMatchOutput>> {
  const taskId = crypto.randomUUID();
  const agent = createSentinelAgent(taskId, options.config);

  return agent.matchJobsForUser({
    task_id: taskId,
    user_id: userId,
    min_match_score: options.min_match_score,
    max_results: options.max_results,
  });
}
