/**
 * Architect Agent Implementation
 *
 * Autonomous learning path designer that:
 * 1. Analyzes user skills and career goals
 * 2. Generates personalized roadmaps
 * 3. Adapts paths based on progress and market changes
 * 4. Evaluates learning progress
 *
 * @see docs/agentic-improvements/05-AGENT_COORDINATOR.md
 */

import { db } from '@/drizzle/db';
import { roadmaps, roadmapModules } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';

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
import { registerArchitectTools, getArchitectToolIds } from './architect-tools';

// ============================================================================
// Types
// ============================================================================

/**
 * Context for roadmap generation
 */
export interface RoadmapGenerationContext {
  task_id: string;
  user_id: string;
  target_roles?: string[];
  force_regenerate?: boolean;
}

/**
 * Context for roadmap re-pathing
 */
export interface RepathContext {
  task_id: string;
  user_id: string;
  roadmap_id: string;
  trigger_reason:
    | 'skill_verification_gaps'
    | 'market_shift'
    | 'rejection_feedback'
    | 'user_request'
    | 'interview_performance';
  trigger_data?: {
    market_trends?: string[];
    new_goals?: string[];
    verified_skills?: string[];
    progress_ahead?: boolean;
  };
}

/**
 * Context for progress evaluation
 */
export interface ProgressEvaluationContext {
  task_id: string;
  user_id: string;
  roadmap_id: string;
}

/**
 * Output of roadmap generation
 */
export interface RoadmapGenerationOutput {
  roadmap_id: string;
  title: string;
  description: string;
  modules_count: number;
  estimated_weeks: number;
  target_role: string;
  skill_gap_summary: string;
}

/**
 * Output of re-pathing
 */
export interface RepathOutput {
  repathed: boolean;
  changes_made: Array<{
    type: string;
    module: string;
    reason: string;
  }>;
  new_priorities: string[];
  reasoning: string;
}

/**
 * Output of progress evaluation
 */
export interface ProgressOutput {
  overall_progress: number;
  pace: 'ahead' | 'on-track' | 'behind';
  modules_completed: number;
  estimated_completion: string;
  recommendations: string[];
  motivational_message: string;
}

/**
 * Agent configuration
 */
export interface ArchitectAgentConfig {
  max_iterations: number;
  confidence_threshold: number;
  timeout_ms: number;
  enable_learning: boolean;
}

/**
 * Result type
 */
export interface ArchitectResult<T> {
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

const DEFAULT_CONFIG: ArchitectAgentConfig = {
  max_iterations: 3,
  confidence_threshold: 0.85,
  timeout_ms: 120000, // 2 minutes
  enable_learning: true,
};

// ============================================================================
// Architect Agent Class
// ============================================================================

export class ArchitectAgent {
  private config: ArchitectAgentConfig;
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
    private userId: string,
    config: Partial<ArchitectAgentConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.memory = createMemoryManager({
      agent_name: 'architect',
      task_id: taskId,
      user_id: userId,
    });

    this.goalDecomposer = createGoalDecomposer({ model: 'gpt-4o-mini' });
    this.planGenerator = createPlanGenerator({
      model: 'gpt-4o-mini',
      max_steps: 8,
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
      default_timeout_ms: 120000, // 2 minutes - roadmap generation needs more time
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
    registerArchitectTools();
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Generate a new learning roadmap
   */
  async generateRoadmap(context: RoadmapGenerationContext): Promise<ArchitectResult<RoadmapGenerationOutput>> {
    const startTime = Date.now();
    this.reasoningTrace = [];

    try {
      this.trace('Starting roadmap generation');

      // Initialize state machine
      this.stateMachine = await createStateMachine({
        agent_name: 'architect',
        user_id: context.user_id,
        task_id: context.task_id,
      });

      await this.stateMachine.transition({
        type: 'START',
        payload: { task_id: context.task_id },
      });

      // Load memory context
      const memoryContext = await this.loadMemoryContext();
      this.trace(`Loaded ${memoryContext.pastRoadmaps.length} past roadmap records`);

      // Store context
      await this.memory.setWorking('generation_context', context);

      await this.stateMachine.transition({
        type: 'INIT_COMPLETE',
        payload: { context_loaded: true },
      });

      // Step 1: Fetch user profile
      this.trace('Fetching user profile...');
      const profileResult = await this.toolExecutor.execute('user_profile_fetcher', {
        user_id: context.user_id,
      });

      if (!profileResult.success) {
        throw new Error(`Failed to fetch user profile: ${profileResult.error}`);
      }

      const profile = profileResult.output as {
        target_roles?: string[];
        years_of_experience?: number;
        current_skills?: Array<{ name: string; proficiency: number; verified: boolean }>;
        work_history?: Array<{ title: string; company: string }>;
        education?: Array<{ degree: string; institution: string }>;
      } | undefined;

      // Ensure all values have defaults to prevent undefined errors
      const currentSkills = profile?.current_skills || [];
      const workHistory = profile?.work_history || [];
      const education = profile?.education || [];
      const yearsOfExperience = profile?.years_of_experience ?? 0;

      const targetRoles = context.target_roles || profile?.target_roles || [];
      if (!targetRoles.length) {
        throw new Error('No target roles specified');
      }

      this.trace(`Target roles: ${targetRoles.join(', ')}`);

      // Step 2: Analyze skill gaps
      this.trace('Analyzing skill gaps...');
      const gapResult = await this.toolExecutor.execute('skill_gap_analyzer', {
        target_role: targetRoles[0],
        current_skills: currentSkills.map((s) => ({
          name: s.name,
          proficiency: s.proficiency,
        })),
      });

      const gapAnalysis = (gapResult.success ? gapResult.output : null) as {
        readiness_score?: number;
        summary?: string;
        critical_gaps?: Array<{ skill: string }>;
      } | null;

      const readinessScore = gapAnalysis?.readiness_score ?? 50; // Default to 50% if unavailable
      this.trace(`Readiness score: ${readinessScore}%`);

      // Step 3: Check market alignment
      this.trace('Checking market alignment...');
      const existingSkills = currentSkills.map((s) => s.name);
      const alignmentResult = await this.toolExecutor.execute('market_alignment_checker', {
        roadmap_skills: existingSkills,
      });

      const alignment = (alignmentResult.success ? alignmentResult.output : null) as {
        alignment_score?: number;
        trending_skills_missing?: string[];
      } | null;

      const alignmentScore = alignment?.alignment_score ?? 50; // Default to 50% if unavailable
      this.trace(`Market alignment: ${alignmentScore}%`);

      // Step 4: Generate roadmap
      this.trace('Generating roadmap...');
      const roadmapResult = await this.toolExecutor.execute('roadmap_generator', {
        user_id: context.user_id,
        target_roles: targetRoles,
        current_skills: currentSkills.map((s) => ({
          name: s.name,
          proficiency: s.proficiency,
        })),
        years_of_experience: yearsOfExperience,
        work_history: workHistory,
        education: education,
      });

      if (!roadmapResult.success) {
        throw new Error(`Failed to generate roadmap: ${roadmapResult.error}`);
      }

      const roadmapOutput = roadmapResult.output as {
        title?: string;
        description?: string;
        estimated_weeks?: number;
        modules?: unknown[];
      } | undefined;

      // Validate roadmap structure
      if (!roadmapOutput) {
        throw new Error('Roadmap generator returned no output');
      }

      const generatedRoadmap = {
        title: roadmapOutput.title || 'Learning Roadmap',
        description: roadmapOutput.description || 'Your personalized learning path',
        estimated_weeks: roadmapOutput.estimated_weeks || 12,
        modules: Array.isArray(roadmapOutput.modules) ? roadmapOutput.modules : [],
      };

      if (generatedRoadmap.modules.length === 0) {
        throw new Error('Roadmap generator returned empty modules array');
      }

      this.trace(`Generated roadmap with ${generatedRoadmap.modules.length} modules`);

      // Step 5: Persist roadmap
      this.trace('Persisting roadmap...');
      const persistResult = await this.toolExecutor.execute('roadmap_persister', {
        user_id: context.user_id,
        roadmap: {
          ...generatedRoadmap,
          target_role: targetRoles[0],
        },
      });

      if (!persistResult.success) {
        throw new Error(`Failed to persist roadmap: ${persistResult.error}`);
      }

      const persisted = persistResult.output as {
        roadmap_id: string;
        modules_created: number;
      };

      // Log roadmap generation (events would be for cross-agent communication)
      console.log(`[Architect] Generated roadmap ${persisted.roadmap_id} with ${persisted.modules_created} modules`);

      // Record learning
      if (this.config.enable_learning) {
        await this.memory.recordEpisode({
          episode_type: 'roadmap_generation',
          action_taken: 'generate_roadmap',
          context: {
            trigger_event: 'generate_roadmap',
            input_summary: `Roadmap for ${targetRoles[0]}`,
          },
          outcome: {
            success: true,
            result_summary: `Generated ${persisted.modules_created} modules`,
            metrics: {
              modules: persisted.modules_created,
              estimated_weeks: generatedRoadmap.estimated_weeks,
            },
          },
        });
      }

      await this.stateMachine.transition({
        type: 'EVALUATION_PASS',
        payload: { confidence: 0.9 },
      });

      const output: RoadmapGenerationOutput = {
        roadmap_id: persisted.roadmap_id,
        title: generatedRoadmap.title,
        description: generatedRoadmap.description,
        modules_count: persisted.modules_created,
        estimated_weeks: generatedRoadmap.estimated_weeks,
        target_role: targetRoles[0],
        skill_gap_summary: gapAnalysis?.summary || 'Analysis not available',
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
   * Re-path an existing roadmap based on changes
   */
  async repathRoadmap(context: RepathContext): Promise<ArchitectResult<RepathOutput>> {
    const startTime = Date.now();
    this.reasoningTrace = [];

    try {
      this.trace(`Starting roadmap re-pathing (trigger: ${context.trigger_reason})`);

      // Initialize state machine
      this.stateMachine = await createStateMachine({
        agent_name: 'architect',
        user_id: context.user_id,
        task_id: context.task_id,
      });

      await this.stateMachine.transition({
        type: 'START',
        payload: { task_id: context.task_id },
      });

      // Analyze if re-pathing is needed
      const repathResult = await this.toolExecutor.execute('repath_analyzer', {
        roadmap_id: context.roadmap_id,
        trigger_reason: context.trigger_reason,
        context: context.trigger_data || {},
      });

      if (!repathResult.success) {
        throw new Error(`Repath analysis failed: ${repathResult.error}`);
      }

      const analysis = repathResult.output as {
        should_repath: boolean;
        changes: Array<{ type: string; module: string; reason: string }>;
        new_priorities: string[];
        reasoning: string;
      };

      this.trace(`Should repath: ${analysis.should_repath}`);

      if (analysis.should_repath && analysis.changes.length > 0) {
        this.trace(`Applying ${analysis.changes.length} changes...`);

        // Apply changes to roadmap
        for (const change of analysis.changes) {
          this.trace(`  ${change.type}: ${change.module} - ${change.reason}`);

          if (change.type === 'reorder') {
            // Update module order
            // Implementation would update order_index
          } else if (change.type === 'remove') {
            // Mark module as completed (to skip it - no 'skipped' status available)
            await db.update(roadmapModules)
              .set({ status: 'completed' })
              .where(
                and(
                  eq(roadmapModules.roadmap_id, context.roadmap_id),
                  eq(roadmapModules.title, change.module)
                )
              );
          }
        }

        // Log re-path (events would be for cross-agent communication)
        console.log(`[Architect] Repathed roadmap ${context.roadmap_id} with ${analysis.changes.length} changes`);
      }

      await this.stateMachine.transition({
        type: 'EVALUATION_PASS',
        payload: { confidence: 0.85 },
      });

      return {
        success: true,
        output: {
          repathed: analysis.should_repath,
          changes_made: analysis.changes,
          new_priorities: analysis.new_priorities,
          reasoning: analysis.reasoning,
        },
        iterations: 1,
        confidence: 0.85,
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

  /**
   * Evaluate progress on a roadmap
   */
  async evaluateProgress(context: ProgressEvaluationContext): Promise<ArchitectResult<ProgressOutput>> {
    const startTime = Date.now();
    this.reasoningTrace = [];

    try {
      this.trace('Evaluating roadmap progress...');

      const evalResult = await this.toolExecutor.execute('progress_evaluator', {
        roadmap_id: context.roadmap_id,
      });

      if (!evalResult.success) {
        throw new Error(`Progress evaluation failed: ${evalResult.error}`);
      }

      const evaluation = evalResult.output as {
        overall_progress_percentage: number;
        pace: 'ahead' | 'on-track' | 'behind';
        modules_completed: number;
        estimated_completion_date: string;
        recommendations: string[];
        motivational_message: string;
      };

      this.trace(`Progress: ${evaluation.overall_progress_percentage}% (${evaluation.pace})`);

      // Check if re-pathing is needed based on progress
      if (evaluation.pace === 'behind') {
        this.trace('User is behind schedule - may need roadmap adjustment');
      }

      return {
        success: true,
        output: {
          overall_progress: evaluation.overall_progress_percentage,
          pace: evaluation.pace,
          modules_completed: evaluation.modules_completed,
          estimated_completion: evaluation.estimated_completion_date,
          recommendations: evaluation.recommendations,
          motivational_message: evaluation.motivational_message,
        },
        iterations: 1,
        confidence: 0.9,
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

  private async loadMemoryContext(): Promise<{
    pastRoadmaps: unknown[];
    userPreferences: unknown[];
  }> {
    const [pastRoadmaps, userPreferences] = await Promise.all([
      this.memory.recallEpisodes({ limit: 5 }),
      this.memory.recallFacts({ categories: ['user_preference'], limit: 10 }),
    ]);

    return {
      pastRoadmaps: pastRoadmaps || [],
      userPreferences: userPreferences || [],
    };
  }

  private trace(message: string): void {
    const timestamp = new Date().toISOString();
    this.reasoningTrace.push(`[${timestamp}] ${message}`);
    console.log(`[ArchitectAgent] ${message}`);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createArchitectAgent(
  taskId: string,
  userId: string,
  config?: Partial<ArchitectAgentConfig>
): ArchitectAgent {
  return new ArchitectAgent(taskId, userId, config);
}

/**
 * Quick roadmap generation function
 */
export async function generateRoadmap(
  userId: string,
  options: {
    target_roles?: string[];
    config?: Partial<ArchitectAgentConfig>;
  } = {}
): Promise<ArchitectResult<RoadmapGenerationOutput>> {
  const taskId = crypto.randomUUID();
  const agent = createArchitectAgent(taskId, userId, options.config);

  return agent.generateRoadmap({
    task_id: taskId,
    user_id: userId,
    target_roles: options.target_roles,
  });
}

/**
 * Quick re-path function
 */
export async function repathRoadmap(
  userId: string,
  roadmapId: string,
  trigger: RepathContext['trigger_reason'],
  triggerData?: RepathContext['trigger_data'],
  config?: Partial<ArchitectAgentConfig>
): Promise<ArchitectResult<RepathOutput>> {
  const taskId = crypto.randomUUID();
  const agent = createArchitectAgent(taskId, userId, config);

  return agent.repathRoadmap({
    task_id: taskId,
    user_id: userId,
    roadmap_id: roadmapId,
    trigger_reason: trigger,
    trigger_data: triggerData,
  });
}

/**
 * Quick progress evaluation function
 */
export async function evaluateProgress(
  userId: string,
  roadmapId: string,
  config?: Partial<ArchitectAgentConfig>
): Promise<ArchitectResult<ProgressOutput>> {
  const taskId = crypto.randomUUID();
  const agent = createArchitectAgent(taskId, userId, config);

  return agent.evaluateProgress({
    task_id: taskId,
    user_id: userId,
    roadmap_id: roadmapId,
  });
}
