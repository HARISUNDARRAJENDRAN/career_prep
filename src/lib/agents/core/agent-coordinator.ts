/**
 * Agent Coordinator
 *
 * Orchestrates multi-agent workflows with dependency management,
 * state tracking, and failure handling.
 *
 * @see docs/agentic-improvements/05-AGENT_COORDINATOR.md
 */

import { db } from '@/drizzle/db';
import {
  agentStates,
  agentStateTransitions,
} from '@/drizzle/schema/agent-states';
import { eq, and } from 'drizzle-orm';
import { publishAgentEvent } from '../message-bus';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent names in the system
 */
export type AgentName =
  | 'interviewer'
  | 'sentinel'
  | 'architect'
  | 'action'
  | 'strategist';

/**
 * A single step in a workflow
 */
export interface WorkflowStep {
  id: string;
  agent: AgentName;
  action: string;
  depends_on?: string[];
  input_mapping?: Record<
    string,
    { from_step?: string; output_key?: string; from_trigger?: string }
  >;
  condition?: {
    step: string;
    output_key: string;
    operator: 'eq' | 'gt' | 'lt' | 'exists' | 'not_exists';
    value: unknown;
  };
  config?: {
    timeout_ms?: number;
    retry_count?: number;
    allow_failure?: boolean;
  };
}

/**
 * Complete workflow definition
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  trigger: string;
  version: number;
  steps: WorkflowStep[];
  onSuccess?: string;
  onFailure?: string;
  config: {
    timeout_ms: number;
    max_retries: number;
    allow_partial_success: boolean;
  };
}

/**
 * Result of a step execution
 */
export interface StepResult {
  step_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: Record<string, unknown>;
  error?: string;
  started_at?: Date;
  completed_at?: Date;
  duration_ms?: number;
}

/**
 * Context during workflow execution
 */
export interface WorkflowContext {
  workflow_id: string;
  execution_id: string;
  trigger_payload: Record<string, unknown>;
  step_results: Map<string, StepResult>;
  metadata: Record<string, unknown>;
}

/**
 * Result of workflow execution
 */
export interface WorkflowExecutionResult {
  success: boolean;
  execution_id: string;
  workflow_id: string;
  results: Record<string, StepResult>;
  duration_ms: number;
  failures: StepResult[];
}

/**
 * Action handler function type
 */
export type ActionHandler = (
  input: Record<string, unknown>
) => Promise<Record<string, unknown>>;

/**
 * Registered action handlers by agent and action
 */
export type ActionRegistry = Map<string, Map<string, ActionHandler>>;

// ============================================================================
// Agent Coordinator Class
// ============================================================================

/**
 * AgentCoordinator orchestrates multi-agent workflows
 */
export class AgentCoordinator {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private actionHandlers: ActionRegistry = new Map();
  private executionHistory: Map<string, WorkflowExecutionResult> = new Map();

  constructor() {
    // Subscribe to message bus for workflow triggers
    this.setupTriggerListeners();
  }

  // ==========================================================================
  // Workflow Registration
  // ==========================================================================

  /**
   * Register a workflow definition
   */
  registerWorkflow(workflow: WorkflowDefinition): void {
    // Validate workflow
    this.validateWorkflow(workflow);

    this.workflows.set(workflow.trigger, workflow);
    console.log(
      `[AgentCoordinator] Registered workflow: ${workflow.name} for trigger: ${workflow.trigger}`
    );
  }

  /**
   * Register an action handler for an agent
   */
  registerAction(agent: AgentName, action: string, handler: ActionHandler): void {
    if (!this.actionHandlers.has(agent)) {
      this.actionHandlers.set(agent, new Map());
    }
    this.actionHandlers.get(agent)!.set(action, handler);
    console.log(`[AgentCoordinator] Registered action: ${agent}.${action}`);
  }

  /**
   * Register multiple actions at once
   */
  registerActions(
    registrations: Array<{
      agent: AgentName;
      action: string;
      handler: ActionHandler;
    }>
  ): void {
    for (const { agent, action, handler } of registrations) {
      this.registerAction(agent, action, handler);
    }
  }

  // ==========================================================================
  // Workflow Execution
  // ==========================================================================

  /**
   * Execute a workflow triggered by an event
   */
  async executeWorkflow(
    trigger: string,
    payload: Record<string, unknown>
  ): Promise<WorkflowExecutionResult> {
    const workflow = this.workflows.get(trigger);

    if (!workflow) {
      throw new Error(`No workflow registered for trigger: ${trigger}`);
    }

    const startTime = Date.now();
    const execution_id = crypto.randomUUID();

    const context: WorkflowContext = {
      workflow_id: workflow.id,
      execution_id,
      trigger_payload: payload,
      step_results: new Map(),
      metadata: {},
    };

    console.log(
      `[AgentCoordinator] Starting workflow ${workflow.name} (${execution_id})`
    );

    try {
      // Persist execution start
      await this.persistExecutionStart(workflow, execution_id, payload);

      // Build execution order using topological sort
      const executionOrder = this.topologicalSort(workflow.steps);

      // Execute steps in order
      for (const stepId of executionOrder) {
        const step = workflow.steps.find((s) => s.id === stepId)!;
        await this.executeStep(workflow, step, context);
      }

      // Determine success
      const allResults = Array.from(context.step_results.values());
      const failures = allResults.filter((r) => r.status === 'failed');

      const success =
        failures.length === 0 ||
        (workflow.config.allow_partial_success &&
          failures.every((f) => {
            const step = workflow.steps.find((s) => s.id === f.step_id);
            return step?.config?.allow_failure;
          }));

      // Build result
      const result: WorkflowExecutionResult = {
        success,
        execution_id,
        workflow_id: workflow.id,
        results: Object.fromEntries(context.step_results),
        duration_ms: Date.now() - startTime,
        failures,
      };

      // Persist completion
      await this.persistExecutionComplete(execution_id, result);

      // Store in history
      this.executionHistory.set(execution_id, result);

      // Emit completion event
      if (success && workflow.onSuccess) {
        await this.emitEvent(workflow.onSuccess, {
          workflow_id: workflow.id,
          execution_id,
          results: result.results,
        });
      } else if (!success && workflow.onFailure) {
        await this.emitEvent(workflow.onFailure, {
          workflow_id: workflow.id,
          execution_id,
          failures: failures.map((f) => ({
            step_id: f.step_id,
            error: f.error,
          })),
        });
      }

      console.log(
        `[AgentCoordinator] Workflow ${workflow.name} completed: ${success ? 'SUCCESS' : 'FAILED'} (${result.duration_ms}ms)`
      );

      return result;
    } catch (error) {
      const errorResult: WorkflowExecutionResult = {
        success: false,
        execution_id,
        workflow_id: workflow.id,
        results: Object.fromEntries(context.step_results),
        duration_ms: Date.now() - startTime,
        failures: [
          {
            step_id: 'workflow',
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };

      await this.persistExecutionComplete(execution_id, errorResult);
      throw error;
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    workflow: WorkflowDefinition,
    step: WorkflowStep,
    context: WorkflowContext
  ): Promise<void> {
    const stepResult: StepResult = {
      step_id: step.id,
      status: 'pending',
    };
    context.step_results.set(step.id, stepResult);

    // Check dependencies
    if (step.depends_on?.length) {
      for (const depId of step.depends_on) {
        const depResult = context.step_results.get(depId);

        if (!depResult || depResult.status === 'pending') {
          stepResult.status = 'skipped';
          stepResult.error = `Dependency ${depId} not completed`;
          return;
        }

        if (depResult.status === 'failed' || depResult.status === 'skipped') {
          const depStep = workflow.steps.find((s) => s.id === depId);
          if (!depStep?.config?.allow_failure) {
            stepResult.status = 'skipped';
            stepResult.error = `Dependency ${depId} failed`;
            return;
          }
        }
      }
    }

    // Check condition
    if (step.condition) {
      const conditionMet = this.evaluateCondition(step.condition, context);
      if (!conditionMet) {
        stepResult.status = 'skipped';
        stepResult.error = 'Condition not met';
        return;
      }
    }

    // Build input
    const input = this.buildStepInput(step, context);

    // Get handler
    const handler = this.actionHandlers.get(step.agent)?.get(step.action);
    if (!handler) {
      stepResult.status = 'failed';
      stepResult.error = `No handler for ${step.agent}.${step.action}`;
      return;
    }

    // Execute with timeout
    stepResult.status = 'running';
    stepResult.started_at = new Date();

    const timeout = step.config?.timeout_ms || workflow.config.timeout_ms;

    try {
      const output = await Promise.race([
        handler(input),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Step timeout after ${timeout}ms`)), timeout)
        ),
      ]);

      stepResult.status = 'completed';
      stepResult.output = output;
      stepResult.completed_at = new Date();
      stepResult.duration_ms =
        stepResult.completed_at.getTime() - stepResult.started_at.getTime();

      console.log(
        `[AgentCoordinator] Step ${step.id} completed (${stepResult.duration_ms}ms)`
      );
    } catch (error) {
      stepResult.status = 'failed';
      stepResult.error = error instanceof Error ? error.message : 'Unknown error';
      stepResult.completed_at = new Date();
      stepResult.duration_ms =
        stepResult.completed_at.getTime() - stepResult.started_at.getTime();

      console.error(`[AgentCoordinator] Step ${step.id} failed: ${stepResult.error}`);

      // Retry if configured
      if (step.config?.retry_count && step.config.retry_count > 0) {
        // For now, we don't implement retry loop to keep it simple
        // Could be extended with retry logic
      }
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Topological sort for step execution order
   */
  private topologicalSort(steps: WorkflowStep[]): string[] {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize
    for (const step of steps) {
      graph.set(step.id, []);
      inDegree.set(step.id, 0);
    }

    // Build graph
    for (const step of steps) {
      if (step.depends_on) {
        for (const dep of step.depends_on) {
          graph.get(dep)?.push(step.id);
          inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    const result: string[] = [];

    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      for (const neighbor of graph.get(current) || []) {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (result.length !== steps.length) {
      throw new Error('Workflow has circular dependencies');
    }

    return result;
  }

  /**
   * Build input for a step from mappings
   */
  private buildStepInput(
    step: WorkflowStep,
    context: WorkflowContext
  ): Record<string, unknown> {
    const input: Record<string, unknown> = {};

    if (!step.input_mapping) {
      return input;
    }

    for (const [key, mapping] of Object.entries(step.input_mapping)) {
      if ('from_trigger' in mapping && mapping.from_trigger) {
        input[key] = context.trigger_payload[mapping.from_trigger];
      } else if ('from_step' in mapping && mapping.from_step && mapping.output_key) {
        const stepResult = context.step_results.get(mapping.from_step);
        if (stepResult?.output) {
          input[key] = stepResult.output[mapping.output_key];
        }
      }
    }

    return input;
  }

  /**
   * Evaluate a step condition
   */
  private evaluateCondition(
    condition: NonNullable<WorkflowStep['condition']>,
    context: WorkflowContext
  ): boolean {
    const stepResult = context.step_results.get(condition.step);
    if (!stepResult?.output) {
      return condition.operator === 'not_exists';
    }

    const value = stepResult.output[condition.output_key];

    switch (condition.operator) {
      case 'eq':
        return value === condition.value;
      case 'gt':
        return typeof value === 'number' && value > (condition.value as number);
      case 'lt':
        return typeof value === 'number' && value < (condition.value as number);
      case 'exists':
        return value !== undefined && value !== null;
      case 'not_exists':
        return value === undefined || value === null;
      default:
        return false;
    }
  }

  /**
   * Validate workflow definition
   */
  private validateWorkflow(workflow: WorkflowDefinition): void {
    if (!workflow.id || !workflow.trigger || !workflow.steps?.length) {
      throw new Error('Invalid workflow: missing required fields');
    }

    // Check for duplicate step IDs
    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      if (stepIds.has(step.id)) {
        throw new Error(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);
    }

    // Validate dependencies exist
    for (const step of workflow.steps) {
      if (step.depends_on) {
        for (const dep of step.depends_on) {
          if (!stepIds.has(dep)) {
            throw new Error(`Step ${step.id} depends on non-existent step: ${dep}`);
          }
        }
      }
    }
  }

  /**
   * Setup listeners for workflow triggers
   */
  private setupTriggerListeners(): void {
    // Subscribe to all registered workflow triggers
    // This is called when workflows are registered
  }

  /**
   * Emit an event to the message bus
   */
  private async emitEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    await publishAgentEvent({
      type: type as 'INTERVIEW_COMPLETED', // Type assertion for union
      payload: payload as any,
    });
  }

  // ==========================================================================
  // Persistence Methods
  // ==========================================================================

  private async persistExecutionStart(
    workflow: WorkflowDefinition,
    execution_id: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    // In production, persist to workflow_executions table
    // For now, just log
    console.log(`[AgentCoordinator] Execution started: ${execution_id}`);
  }

  private async persistExecutionComplete(
    execution_id: string,
    result: WorkflowExecutionResult
  ): Promise<void> {
    // In production, update workflow_executions table
    console.log(
      `[AgentCoordinator] Execution completed: ${execution_id} (success: ${result.success})`
    );
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get execution result by ID
   */
  getExecution(execution_id: string): WorkflowExecutionResult | undefined {
    return this.executionHistory.get(execution_id);
  }

  /**
   * Get registered workflows
   */
  getWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get workflow by trigger
   */
  getWorkflowByTrigger(trigger: string): WorkflowDefinition | undefined {
    return this.workflows.get(trigger);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const agentCoordinator = new AgentCoordinator();

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Define a workflow (helper for type safety)
 */
export function defineWorkflow(
  definition: WorkflowDefinition
): WorkflowDefinition {
  return definition;
}

/**
 * Define a workflow step (helper for type safety)
 */
export function defineStep(step: WorkflowStep): WorkflowStep {
  return step;
}
