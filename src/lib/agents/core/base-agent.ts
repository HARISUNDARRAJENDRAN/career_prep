/**
 * Base Autonomous Agent
 *
 * Abstract base class for all autonomous agents in the system.
 * Integrates state machine, memory, tools, and reasoning capabilities.
 *
 * @see docs/agentic-improvements/01-AGENTIC_ARCHITECTURE_OVERVIEW.md
 * @see docs/agentic-improvements/08-PILOT_INTERVIEW_AGENT.md
 */

import {
  AgentStateMachine,
  createStateMachine,
  type TransitionEvent,
  type StateContext,
} from './agent-state';
import {
  AgentMemoryManager,
  createMemoryManager,
  type EpisodeContext,
  type EpisodeOutcome,
} from './agent-memory';
import { toolRegistry, type ToolExecutionResult } from '../tools/tool-registry';
import { db } from '@/drizzle/db';
import {
  agentPlans,
  agentPlanSteps,
  agentGoals,
  agentToolUsage,
  type AgentState,
  type StateAgentName,
  type MemoryAgentName,
} from '@/drizzle/schema';
import { eq, and, asc } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for autonomous agents
 */
export interface AgentConfig {
  agent_name: StateAgentName & MemoryAgentName;
  task_id: string;
  user_id?: string;
  goal: string;
  context?: Record<string, unknown>;

  // Execution constraints
  max_iterations?: number;
  confidence_threshold?: number;
  timeout_ms?: number;

  // Callbacks
  on_state_change?: (from: AgentState, to: AgentState) => void | Promise<void>;
  on_progress?: (progress: AgentProgress) => void | Promise<void>;
}

/**
 * Agent execution progress
 */
export interface AgentProgress {
  state: AgentState;
  iteration: number;
  step?: string;
  confidence?: number;
  message?: string;
}

/**
 * Agent execution result
 */
export interface AgentResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
  iterations: number;
  confidence: number;
  duration_ms: number;
  plan_id?: string;
  memory_id?: string;
}

/**
 * Plan step definition
 */
export interface PlanStep {
  id: string;
  name: string;
  description?: string;
  tool_id: string;
  tool_input: Record<string, unknown>;
  depends_on?: string[];
}

/**
 * Generated plan
 */
export interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
  estimated_duration_ms: number;
}

// ============================================================================
// Base Autonomous Agent
// ============================================================================

/**
 * BaseAutonomousAgent provides core autonomous capabilities
 *
 * Concrete agents extend this class and implement:
 * - generatePlan(): How to plan for a goal
 * - executeStep(): How to execute a plan step
 * - evaluateOutput(): How to evaluate the output quality
 */
export abstract class BaseAutonomousAgent<TOutput = unknown> {
  // Configuration
  protected config: AgentConfig;

  // Core components
  protected stateMachine!: AgentStateMachine;
  protected memory!: AgentMemoryManager;

  // Execution state
  protected currentPlan?: Plan;
  protected currentStepIndex = 0;
  protected iterations = 0;
  protected startTime = 0;
  protected output?: TOutput;
  protected confidence = 0;
  protected lastError?: string;

  constructor(config: AgentConfig) {
    this.config = {
      max_iterations: 3,
      confidence_threshold: 0.85,
      timeout_ms: 5 * 60 * 1000, // 5 minutes default
      ...config,
    };
  }

  // ==========================================================================
  // Abstract Methods (to be implemented by concrete agents)
  // ==========================================================================

  /**
   * Generate a plan to achieve the goal
   * Called during the 'planning' state
   */
  protected abstract generatePlan(
    goal: string,
    context: Record<string, unknown>
  ): Promise<Plan>;

  /**
   * Execute a single plan step
   * Called during the 'executing' state
   */
  protected abstract executeStep(
    step: PlanStep,
    context: Record<string, unknown>
  ): Promise<unknown>;

  /**
   * Evaluate the quality of the current output
   * Called during the 'evaluating' state
   * Returns a confidence score between 0 and 1
   */
  protected abstract evaluateOutput(output: unknown): Promise<number>;

  /**
   * Adapt the plan based on evaluation feedback
   * Called during the 'adapting' state
   * Returns a new or modified plan
   */
  protected abstract adaptPlan(
    currentPlan: Plan,
    feedback: { confidence: number; reason: string }
  ): Promise<Plan>;

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Run the agent to completion
   */
  async run(): Promise<AgentResult<TOutput>> {
    this.startTime = Date.now();

    try {
      // Initialize components
      await this.initialize();

      // Start execution
      await this.stateMachine.transition({ type: 'START', payload: { task_id: this.config.task_id } });

      // Run the main loop
      while (!this.stateMachine.isTerminal()) {
        // Check timeout
        if (this.isTimedOut()) {
          await this.stateMachine.transition({
            type: 'TIMEOUT',
            payload: { duration_ms: Date.now() - this.startTime },
          });
          break;
        }

        // Execute current state
        await this.executeCurrentState();
      }

      // Record episode in memory
      const memoryId = await this.recordEpisode();

      return {
        success: this.stateMachine.getState() === 'succeeded',
        output: this.output,
        error: this.lastError,
        iterations: this.iterations,
        confidence: this.confidence,
        duration_ms: Date.now() - this.startTime,
        plan_id: this.currentPlan?.id,
        memory_id: memoryId,
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: this.lastError,
        iterations: this.iterations,
        confidence: 0,
        duration_ms: Date.now() - this.startTime,
      };
    }
  }

  /**
   * Get current progress
   */
  getProgress(): AgentProgress {
    return {
      state: this.stateMachine.getState(),
      iteration: this.iterations,
      step: this.currentPlan?.steps[this.currentStepIndex]?.name,
      confidence: this.confidence,
    };
  }

  /**
   * Pause the agent
   */
  async pause(reason: string): Promise<void> {
    await this.stateMachine.transition({ type: 'PAUSE', payload: { reason } });
  }

  /**
   * Resume a paused agent
   */
  async resume(): Promise<void> {
    await this.stateMachine.transition({ type: 'RESUME', payload: {} });
  }

  /**
   * Cancel the agent
   */
  async cancel(reason: string): Promise<void> {
    await this.stateMachine.transition({ type: 'CANCEL', payload: { reason } });
  }

  // ==========================================================================
  // State Execution
  // ==========================================================================

  private async executeCurrentState(): Promise<void> {
    const state = this.stateMachine.getState();

    switch (state) {
      case 'initializing':
        await this.handleInitializing();
        break;
      case 'planning':
        await this.handlePlanning();
        break;
      case 'executing':
        await this.handleExecuting();
        break;
      case 'evaluating':
        await this.handleEvaluating();
        break;
      case 'adapting':
        await this.handleAdapting();
        break;
      default:
        // Terminal or waiting states - do nothing
        break;
    }
  }

  private async handleInitializing(): Promise<void> {
    // Load context from memory
    const recentEpisodes = await this.memory.recallEpisodes({ limit: 5 });
    const relevantFacts = await this.memory.recallFacts({ limit: 10 });

    // Store in working memory
    await this.memory.setWorking('recent_episodes', recentEpisodes);
    await this.memory.setWorking('relevant_facts', relevantFacts);
    await this.memory.setWorking('goal', this.config.goal);
    await this.memory.setWorking('context', this.config.context || {});

    await this.stateMachine.transition({
      type: 'INIT_COMPLETE',
      payload: { context_loaded: true },
    });

    this.reportProgress('Initialized with memory context');
  }

  private async handlePlanning(): Promise<void> {
    try {
      const context = await this.memory.getAllWorking();
      const plan = await this.generatePlan(this.config.goal, context);

      // Store plan in database
      await this.savePlan(plan);

      this.currentPlan = plan;
      this.currentStepIndex = 0;

      await this.memory.setWorking('current_plan', plan);

      await this.stateMachine.transition({
        type: 'PLAN_COMPLETE',
        payload: { plan_id: plan.id, steps: plan.steps.length },
      });

      this.reportProgress(`Generated plan with ${plan.steps.length} steps`);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Planning failed';
      await this.stateMachine.transition({
        type: 'STEP_FAILED',
        payload: { step_id: 'planning', error: this.lastError },
      });
    }
  }

  private async handleExecuting(): Promise<void> {
    if (!this.currentPlan || this.currentStepIndex >= this.currentPlan.steps.length) {
      // All steps completed, move to evaluation
      await this.stateMachine.transition({
        type: 'STEP_COMPLETE',
        payload: { step_id: 'all', output: this.output },
      });
      return;
    }

    const step = this.currentPlan.steps[this.currentStepIndex];

    try {
      const context = await this.memory.getAllWorking();
      const stepOutput = await this.executeStep(step, context);

      // Store step output
      await this.memory.setWorking(`step_${step.id}_output`, stepOutput);

      // Record tool usage
      await this.recordToolUsage(step, stepOutput, true);

      // Update output with latest result
      this.output = stepOutput as TOutput;

      // Move to next step
      this.currentStepIndex++;

      await this.stateMachine.transition({
        type: 'STEP_COMPLETE',
        payload: { step_id: step.id, output: stepOutput },
      });

      this.reportProgress(`Completed step: ${step.name}`);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Step execution failed';

      await this.recordToolUsage(step, null, false, this.lastError);

      await this.stateMachine.transition({
        type: 'STEP_FAILED',
        payload: { step_id: step.id, error: this.lastError },
      });
    }
  }

  private async handleEvaluating(): Promise<void> {
    try {
      this.confidence = await this.evaluateOutput(this.output);

      if (this.confidence >= (this.config.confidence_threshold || 0.85)) {
        // Good enough - we're done!
        await this.stateMachine.transition({
          type: 'EVALUATION_PASS',
          payload: { confidence: this.confidence },
        });

        this.reportProgress(`Evaluation passed with confidence: ${this.confidence.toFixed(2)}`);
      } else {
        // Need improvement
        await this.stateMachine.transition({
          type: 'EVALUATION_FAIL',
          payload: {
            confidence: this.confidence,
            reason: `Confidence ${this.confidence.toFixed(2)} below threshold ${this.config.confidence_threshold}`,
          },
        });

        this.reportProgress(`Evaluation failed, confidence: ${this.confidence.toFixed(2)}`);
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Evaluation failed';
      await this.stateMachine.transition({
        type: 'STEP_FAILED',
        payload: { step_id: 'evaluation', error: this.lastError },
      });
    }
  }

  private async handleAdapting(): Promise<void> {
    this.iterations++;

    if (this.iterations >= (this.config.max_iterations || 3)) {
      await this.stateMachine.transition({
        type: 'MAX_ITERATIONS',
        payload: { iterations: this.iterations },
      });
      return;
    }

    try {
      const newPlan = await this.adaptPlan(this.currentPlan!, {
        confidence: this.confidence,
        reason: `Iteration ${this.iterations}, improving from confidence ${this.confidence.toFixed(2)}`,
      });

      // Store new plan
      await this.savePlan(newPlan, this.currentPlan?.id);

      this.currentPlan = newPlan;
      this.currentStepIndex = 0;

      await this.memory.setWorking('current_plan', newPlan);

      await this.stateMachine.transition({
        type: 'ADAPTATION_COMPLETE',
        payload: { new_plan_id: newPlan.id },
      });

      this.reportProgress(`Adapted plan for iteration ${this.iterations}`);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Adaptation failed';
      await this.stateMachine.transition({
        type: 'STEP_FAILED',
        payload: { step_id: 'adaptation', error: this.lastError },
      });
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async initialize(): Promise<void> {
    // Initialize state machine
    this.stateMachine = await createStateMachine({
      agent_name: this.config.agent_name,
      task_id: this.config.task_id,
      user_id: this.config.user_id,
      on_transition: async (result) => {
        if (this.config.on_state_change) {
          await this.config.on_state_change(result.from_state, result.to_state);
        }
      },
    });

    // Initialize memory manager
    this.memory = createMemoryManager({
      agent_name: this.config.agent_name,
      task_id: this.config.task_id,
      user_id: this.config.user_id,
    });
  }

  private isTimedOut(): boolean {
    return Date.now() - this.startTime > (this.config.timeout_ms || 5 * 60 * 1000);
  }

  private reportProgress(message: string): void {
    if (this.config.on_progress) {
      this.config.on_progress({
        ...this.getProgress(),
        message,
      });
    }
    console.log(`[${this.config.agent_name}] ${message}`);
  }

  private async savePlan(plan: Plan, parentPlanId?: string): Promise<void> {
    // Insert plan record
    await db.insert(agentPlans).values({
      id: plan.id,
      agent_name: this.config.agent_name,
      user_id: this.config.user_id,
      task_id: this.config.task_id,
      goal_description: plan.goal,
      status: 'active',
      config: {
        max_iterations: this.config.max_iterations || 3,
        confidence_threshold: this.config.confidence_threshold || 0.85,
        timeout_ms: this.config.timeout_ms || 5 * 60 * 1000,
        allow_adaptation: true,
      },
      total_steps: plan.steps.length,
      estimated_duration_ms: plan.estimated_duration_ms,
      parent_plan_id: parentPlanId,
      adaptation_reason: parentPlanId ? 'Adapted from previous plan' : undefined,
    });

    // Insert step records
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      await db.insert(agentPlanSteps).values({
        id: step.id,
        plan_id: plan.id,
        step_index: i,
        step_name: step.name,
        description: step.description,
        tool_id: step.tool_id,
        tool_input: step.tool_input,
        depends_on: step.depends_on,
        status: 'pending',
      });
    }
  }

  private async recordToolUsage(
    step: PlanStep,
    output: unknown,
    success: boolean,
    error?: string
  ): Promise<void> {
    await db.insert(agentToolUsage).values({
      agent_name: this.config.agent_name,
      task_id: this.config.task_id,
      plan_id: this.currentPlan?.id,
      step_id: step.id,
      tool_id: step.tool_id,
      success: success ? 1 : 0,
      output_summary: output ? JSON.stringify(output).slice(0, 500) : undefined,
      error,
      selection_reason: `Step ${step.name} in plan`,
    });
  }

  private async recordEpisode(): Promise<string> {
    const context: EpisodeContext = {
      trigger_event: 'agent_run',
      input_summary: this.config.goal,
      tools_used: this.currentPlan?.steps.map((s) => s.tool_id) || [],
      plan_id: this.currentPlan?.id,
    };

    const outcome: EpisodeOutcome = {
      success: this.stateMachine.getState() === 'succeeded',
      result_summary: this.lastError || 'Completed successfully',
      metrics: {
        iterations: this.iterations,
        confidence: this.confidence,
        duration_ms: Date.now() - this.startTime,
      },
    };

    return this.memory.recordEpisode({
      episode_type: `${this.config.agent_name}_run`,
      action_taken: `Executed goal: ${this.config.goal}`,
      context,
      outcome,
      confidence_score: this.confidence,
    });
  }

  // ==========================================================================
  // Tool Helpers
  // ==========================================================================

  /**
   * Execute a tool from the registry
   */
  protected async executeTool<TInput, TOutput>(
    toolId: string,
    input: TInput
  ): Promise<ToolExecutionResult<TOutput>> {
    return toolRegistry.execute<TInput, TOutput>(toolId, input);
  }

  /**
   * Find tools suitable for a task
   */
  protected findTools(goal: string) {
    return toolRegistry.findForGoal(goal);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a unique ID for plans and steps
 */
export function createId(): string {
  return crypto.randomUUID();
}
