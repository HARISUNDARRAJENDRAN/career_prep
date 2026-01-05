/**
 * Iteration Controller
 *
 * Manages "loop until satisfied" iterations with termination conditions,
 * backtracking, and adaptation strategies.
 *
 * @see docs/agentic-improvements/06-ITERATIVE_LOOPS.md
 */

import type { ConfidenceAssessment, ConfidenceScorer } from './confidence-scorer';
import type { ExecutionFeedback, Plan, PlanGenerator } from './plan-generator';
import type { Goal, SubGoal } from './goal-decomposer';

// ============================================================================
// Types
// ============================================================================

/**
 * Conditions that can terminate an iteration loop
 */
export interface TerminationConditions {
  max_iterations: number;
  confidence_threshold: number;
  max_duration_ms: number;
  convergence_threshold: number; // Minimum improvement between iterations
  max_degradations: number; // Max consecutive degradations before stopping
}

/**
 * State of an iteration loop
 */
export interface IterationState {
  iteration_number: number;
  started_at: Date;
  last_output: unknown;
  last_assessment: ConfidenceAssessment | null;
  assessments_history: ConfidenceAssessment[];
  total_duration_ms: number;
  consecutive_degradations: number;
  adaptations_made: number;
  status: 'running' | 'succeeded' | 'failed' | 'terminated';
  termination_reason?: string;
}

/**
 * Result of a single iteration
 */
export interface IterationResult {
  output: unknown;
  assessment: ConfidenceAssessment;
  duration_ms: number;
  decision: 'continue' | 'succeed' | 'adapt' | 'terminate';
  reasoning: string;
}

/**
 * Final result of the iteration loop
 */
export interface IterationLoopResult {
  success: boolean;
  final_output: unknown;
  final_assessment: ConfidenceAssessment | null;
  total_iterations: number;
  total_duration_ms: number;
  adaptations_made: number;
  termination_reason: string;
  iteration_history: IterationResult[];
}

/**
 * Callback function type for executing a single step
 */
export type ExecuteStepFn = (
  plan: Plan,
  stepIndex: number,
  context: Record<string, unknown>
) => Promise<{
  output: unknown;
  feedback: ExecutionFeedback;
}>;

/**
 * Configuration for the iteration controller
 */
export interface IterationControllerConfig {
  conditions: TerminationConditions;
  enable_adaptation: boolean;
  adaptation_cooldown_ms: number; // Minimum time between adaptations
  checkpoint_interval: number; // Save state every N iterations
}

// ============================================================================
// Iteration Controller Class
// ============================================================================

/**
 * IterationController manages the "loop until satisfied" pattern
 */
export class IterationController {
  private config: IterationControllerConfig;
  private scorer: ConfidenceScorer;
  private planGenerator: PlanGenerator;
  private state: IterationState | null = null;
  private lastAdaptationTime: number = 0;

  constructor(
    config: IterationControllerConfig,
    scorer: ConfidenceScorer,
    planGenerator: PlanGenerator
  ) {
    this.config = config;
    this.scorer = scorer;
    this.planGenerator = planGenerator;
  }

  /**
   * Run the iteration loop for a goal
   */
  async runLoop(
    goal: Goal | SubGoal,
    plan: Plan,
    executePlan: (plan: Plan, context: Record<string, unknown>) => Promise<{
      output: unknown;
      feedback: ExecutionFeedback[];
    }>,
    context: Record<string, unknown> = {}
  ): Promise<IterationLoopResult> {
    // Initialize state
    this.state = this.initializeState();
    const iterationHistory: IterationResult[] = [];
    let currentPlan = plan;

    while (this.state.status === 'running') {
      const iterationStart = Date.now();
      this.state.iteration_number++;

      try {
        // Execute the plan
        const { output, feedback } = await executePlan(currentPlan, {
          ...context,
          iteration: this.state.iteration_number,
          previous_output: this.state.last_output,
        });

        // Score the output
        const assessment = await this.scorer.score({
          goal,
          output,
          previous_attempts: this.state.assessments_history.map((a, i) => ({
            output: iterationHistory[i]?.output,
            score: a.overall_score,
          })),
        });

        const duration = Date.now() - iterationStart;
        this.state.total_duration_ms += duration;
        this.state.last_output = output;
        this.state.last_assessment = assessment;
        this.state.assessments_history.push(assessment);

        // Determine what to do next
        const decision = this.evaluateIteration(assessment);

        const iterationResult: IterationResult = {
          output,
          assessment,
          duration_ms: duration,
          decision: decision.action,
          reasoning: decision.reasoning,
        };
        iterationHistory.push(iterationResult);

        // Act on decision
        switch (decision.action) {
          case 'succeed':
            this.state.status = 'succeeded';
            this.state.termination_reason = decision.reasoning;
            break;

          case 'terminate':
            this.state.status = decision.canRetry ? 'failed' : 'terminated';
            this.state.termination_reason = decision.reasoning;
            break;

          case 'adapt':
            if (this.canAdapt()) {
              try {
                currentPlan = await this.planGenerator.adapt(currentPlan, feedback);
                this.state.adaptations_made++;
                this.lastAdaptationTime = Date.now();
              } catch {
                // Adaptation failed, continue with current plan
              }
            }
            break;

          case 'continue':
            // Just continue to next iteration
            break;
        }

        // Check checkpoint
        if (
          this.state.iteration_number % this.config.checkpoint_interval === 0
        ) {
          await this.saveCheckpoint();
        }
      } catch (error) {
        // Handle execution error
        this.state.status = 'failed';
        this.state.termination_reason = `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    return {
      success: this.state.status === 'succeeded',
      final_output: this.state.last_output,
      final_assessment: this.state.last_assessment,
      total_iterations: this.state.iteration_number,
      total_duration_ms: this.state.total_duration_ms,
      adaptations_made: this.state.adaptations_made,
      termination_reason: this.state.termination_reason || 'Unknown',
      iteration_history: iterationHistory,
    };
  }

  /**
   * Run a single iteration (for external control)
   */
  async runSingleIteration(
    goal: Goal | SubGoal,
    plan: Plan,
    executePlan: (plan: Plan, context: Record<string, unknown>) => Promise<{
      output: unknown;
      feedback: ExecutionFeedback[];
    }>,
    state: IterationState,
    context: Record<string, unknown> = {}
  ): Promise<{
    result: IterationResult;
    state: IterationState;
    adaptedPlan?: Plan;
  }> {
    this.state = state;
    const iterationStart = Date.now();
    state.iteration_number++;

    const { output, feedback } = await executePlan(plan, {
      ...context,
      iteration: state.iteration_number,
      previous_output: state.last_output,
    });

    const assessment = await this.scorer.score({
      goal,
      output,
      previous_attempts: state.assessments_history.map((a, i) => ({
        output: null, // We don't store outputs in state
        score: a.overall_score,
      })),
    });

    const duration = Date.now() - iterationStart;
    state.total_duration_ms += duration;
    state.last_output = output;
    state.last_assessment = assessment;
    state.assessments_history.push(assessment);

    const decision = this.evaluateIteration(assessment);

    const result: IterationResult = {
      output,
      assessment,
      duration_ms: duration,
      decision: decision.action,
      reasoning: decision.reasoning,
    };

    // Update state based on decision
    let adaptedPlan: Plan | undefined;

    switch (decision.action) {
      case 'succeed':
        state.status = 'succeeded';
        state.termination_reason = decision.reasoning;
        break;

      case 'terminate':
        state.status = decision.canRetry ? 'failed' : 'terminated';
        state.termination_reason = decision.reasoning;
        break;

      case 'adapt':
        if (this.canAdapt()) {
          adaptedPlan = await this.planGenerator.adapt(plan, feedback);
          state.adaptations_made++;
          this.lastAdaptationTime = Date.now();
        }
        break;
    }

    return { result, state, adaptedPlan };
  }

  /**
   * Get recommended action based on progress
   */
  getRecommendation(): {
    action: 'continue' | 'adapt' | 'stop';
    confidence: number;
    reasoning: string;
  } {
    if (!this.state || this.state.assessments_history.length < 2) {
      return {
        action: 'continue',
        confidence: 0.5,
        reasoning: 'Not enough data to make a recommendation',
      };
    }

    const progress = this.scorer.trackProgress(this.state.assessments_history);

    switch (progress.trend) {
      case 'improving':
        return {
          action: 'continue',
          confidence: 0.8,
          reasoning: progress.recommendation,
        };

      case 'degrading':
        return {
          action: 'adapt',
          confidence: 0.9,
          reasoning: progress.recommendation,
        };

      case 'stable':
        const lastScore = this.state.assessments_history.at(-1)?.overall_score || 0;
        if (lastScore >= this.config.conditions.confidence_threshold) {
          return {
            action: 'stop',
            confidence: 0.9,
            reasoning: 'Threshold reached with stable performance',
          };
        }
        return {
          action: 'adapt',
          confidence: 0.7,
          reasoning: progress.recommendation,
        };

      case 'fluctuating':
        return {
          action: 'adapt',
          confidence: 0.6,
          reasoning: progress.recommendation,
        };

      default:
        return {
          action: 'continue',
          confidence: 0.5,
          reasoning: 'Continuing with current approach',
        };
    }
  }

  /**
   * Reset the controller state
   */
  reset(): void {
    this.state = null;
    this.lastAdaptationTime = 0;
  }

  /**
   * Get current state (for persistence)
   */
  getState(): IterationState | null {
    return this.state;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private initializeState(): IterationState {
    return {
      iteration_number: 0,
      started_at: new Date(),
      last_output: null,
      last_assessment: null,
      assessments_history: [],
      total_duration_ms: 0,
      consecutive_degradations: 0,
      adaptations_made: 0,
      status: 'running',
    };
  }

  private evaluateIteration(assessment: ConfidenceAssessment): {
    action: 'continue' | 'succeed' | 'adapt' | 'terminate';
    reasoning: string;
    canRetry: boolean;
  } {
    if (!this.state) {
      return {
        action: 'terminate',
        reasoning: 'No state available',
        canRetry: false,
      };
    }

    const { conditions } = this.config;

    // Check success condition
    if (assessment.meets_threshold) {
      return {
        action: 'succeed',
        reasoning: `Confidence threshold ${conditions.confidence_threshold} reached with score ${assessment.overall_score.toFixed(3)}`,
        canRetry: false,
      };
    }

    // Check max iterations
    if (this.state.iteration_number >= conditions.max_iterations) {
      return {
        action: 'terminate',
        reasoning: `Maximum iterations (${conditions.max_iterations}) reached`,
        canRetry: true,
      };
    }

    // Check max duration
    if (this.state.total_duration_ms >= conditions.max_duration_ms) {
      return {
        action: 'terminate',
        reasoning: `Maximum duration (${conditions.max_duration_ms}ms) exceeded`,
        canRetry: true,
      };
    }

    // Check convergence
    if (this.state.assessments_history.length >= 2) {
      const prevScore = this.state.assessments_history.at(-2)?.overall_score || 0;
      const improvement = assessment.overall_score - prevScore;

      if (improvement < 0) {
        this.state.consecutive_degradations++;

        if (this.state.consecutive_degradations >= conditions.max_degradations) {
          return {
            action: 'terminate',
            reasoning: `${conditions.max_degradations} consecutive degradations`,
            canRetry: true,
          };
        }

        return {
          action: 'adapt',
          reasoning: `Performance degraded (${improvement.toFixed(3)}). Adapting plan.`,
          canRetry: true,
        };
      } else {
        this.state.consecutive_degradations = 0;

        if (Math.abs(improvement) < conditions.convergence_threshold) {
          // Stable but below threshold - try adaptation
          if (this.canAdapt()) {
            return {
              action: 'adapt',
              reasoning: `Progress stalled (improvement: ${improvement.toFixed(3)}). Trying adaptation.`,
              canRetry: true,
            };
          }
        }
      }
    }

    // Default: continue
    return {
      action: 'continue',
      reasoning: `Score ${assessment.overall_score.toFixed(3)} below threshold. Continuing iteration.`,
      canRetry: true,
    };
  }

  private canAdapt(): boolean {
    if (!this.config.enable_adaptation) {
      return false;
    }

    if (!this.state) {
      return false;
    }

    // Check cooldown
    const timeSinceLastAdaptation = Date.now() - this.lastAdaptationTime;
    if (timeSinceLastAdaptation < this.config.adaptation_cooldown_ms) {
      return false;
    }

    return true;
  }

  private async saveCheckpoint(): Promise<void> {
    // In a real implementation, this would persist to database
    // For now, we just log
    console.log(
      `[IterationController] Checkpoint at iteration ${this.state?.iteration_number}`
    );
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an iteration controller with default settings
 */
export function createIterationController(
  scorer: ConfidenceScorer,
  planGenerator: PlanGenerator,
  options: Partial<IterationControllerConfig> = {}
): IterationController {
  return new IterationController(
    {
      conditions: {
        max_iterations: 5,
        confidence_threshold: 0.85,
        max_duration_ms: 60000, // 1 minute
        convergence_threshold: 0.02,
        max_degradations: 2,
      },
      enable_adaptation: true,
      adaptation_cooldown_ms: 5000,
      checkpoint_interval: 3,
      ...options,
    },
    scorer,
    planGenerator
  );
}

/**
 * Create default termination conditions
 */
export function createTerminationConditions(
  overrides: Partial<TerminationConditions> = {}
): TerminationConditions {
  return {
    max_iterations: 5,
    confidence_threshold: 0.85,
    max_duration_ms: 60000,
    convergence_threshold: 0.02,
    max_degradations: 2,
    ...overrides,
  };
}
