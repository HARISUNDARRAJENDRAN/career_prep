/**
 * Workflow Orchestrator
 *
 * Defines and executes complex multi-agent workflows.
 * Enables chaining agents, parallel execution, and conditional branching.
 *
 * @see docs/agentic-improvements/05-AGENT_COORDINATOR.md
 */

import { randomUUID } from 'crypto';
import { messageBus, MessageTopics, type MessagePayloads } from '../message-bus';

// ============================================================================
// Types
// ============================================================================

export type AgentType = 'interviewer' | 'sentinel' | 'architect' | 'action';

export interface WorkflowStep {
  id: string;
  name: string;
  agent: AgentType;
  action: string;
  input_mapping: Record<string, string>; // Map workflow data to agent params
  output_key: string; // Key to store output in workflow data
  condition?: string; // JavaScript expression for conditional execution
  on_error?: 'fail' | 'skip' | 'retry';
  max_retries?: number;
  timeout_ms?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  trigger: {
    event?: string;
    schedule?: string;
    manual?: boolean;
  };
  steps: WorkflowStep[];
  parallel_groups?: ParallelGroup[];
  on_complete?: {
    publish_event?: string;
    notify?: boolean;
  };
}

export interface ParallelGroup {
  id: string;
  name: string;
  steps: string[]; // Step IDs to run in parallel
  aggregation: 'all' | 'any' | 'majority';
  timeout_ms?: number;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: Date;
  completed_at?: Date;
  current_step?: string;
  data: Record<string, unknown>;
  results: Record<string, StepResult>;
  errors: WorkflowError[];
}

export interface StepResult {
  step_id: string;
  status: 'success' | 'failed' | 'skipped';
  output: unknown;
  duration_ms: number;
  retries: number;
}

export interface WorkflowError {
  step_id: string;
  error: string;
  timestamp: Date;
  recoverable: boolean;
}

// ============================================================================
// Predefined Workflows
// ============================================================================

/**
 * Interview Feedback Workflow
 * Triggered after interview completion, updates roadmap based on feedback
 */
export const INTERVIEW_FEEDBACK_WORKFLOW: WorkflowDefinition = {
  id: 'interview_feedback_workflow',
  name: 'Interview Feedback Processing',
  description: 'Process interview results to update user roadmap and find better matches',
  version: '1.0.0',
  trigger: {
    event: 'interview_completed',
  },
  steps: [
    {
      id: 'analyze_interview',
      name: 'Analyze Interview Performance',
      agent: 'interviewer',
      action: 'analyzePerformance',
      input_mapping: {
        session_id: '$.trigger.session_id',
      },
      output_key: 'interview_analysis',
      on_error: 'fail',
    },
    {
      id: 'identify_skill_gaps',
      name: 'Identify Skill Gaps',
      agent: 'sentinel',
      action: 'analyzeSkillGaps',
      input_mapping: {
        user_id: '$.trigger.user_id',
        weak_areas: '$.interview_analysis.weak_areas',
      },
      output_key: 'skill_gaps',
      on_error: 'skip',
    },
    {
      id: 'update_roadmap',
      name: 'Update Learning Roadmap',
      agent: 'architect',
      action: 'repathRoadmap',
      input_mapping: {
        user_id: '$.trigger.user_id',
        skill_gaps: '$.skill_gaps',
        interview_feedback: '$.interview_analysis',
      },
      output_key: 'updated_roadmap',
      condition: '$.interview_analysis.overall_score < 0.7',
      on_error: 'skip',
    },
    {
      id: 'find_better_matches',
      name: 'Find Better Job Matches',
      agent: 'sentinel',
      action: 'matchJobsForUser',
      input_mapping: {
        user_id: '$.trigger.user_id',
        updated_skills: '$.interview_analysis.demonstrated_skills',
      },
      output_key: 'new_matches',
      on_error: 'skip',
    },
  ],
  on_complete: {
    publish_event: 'interview_feedback_processed',
    notify: true,
  },
};

/**
 * Daily Career Pipeline Workflow
 * Runs daily to scrape jobs, match, and auto-apply
 */
export const DAILY_CAREER_PIPELINE: WorkflowDefinition = {
  id: 'daily_career_pipeline',
  name: 'Daily Career Pipeline',
  description: 'Daily workflow to scrape jobs, find matches, and auto-apply',
  version: '1.0.0',
  trigger: {
    schedule: '0 6 * * *', // 6 AM daily
  },
  steps: [
    {
      id: 'scrape_market',
      name: 'Scrape Job Market',
      agent: 'sentinel',
      action: 'scrapeMarket',
      input_mapping: {},
      output_key: 'market_data',
      on_error: 'fail',
      timeout_ms: 300000, // 5 minutes
    },
    {
      id: 'match_jobs',
      name: 'Match Jobs for All Users',
      agent: 'sentinel',
      action: 'matchAllUsers',
      input_mapping: {
        jobs: '$.market_data.jobs',
      },
      output_key: 'all_matches',
      on_error: 'fail',
    },
    {
      id: 'auto_apply',
      name: 'Auto Apply to Top Matches',
      agent: 'action',
      action: 'batchApply',
      input_mapping: {
        matches: '$.all_matches',
      },
      output_key: 'applications',
      condition: '$.all_matches.length > 0',
      on_error: 'skip',
    },
  ],
  parallel_groups: [
    {
      id: 'scrape_sources',
      name: 'Parallel Job Source Scraping',
      steps: ['scrape_jooble', 'scrape_adzuna', 'scrape_github'],
      aggregation: 'all',
      timeout_ms: 120000,
    },
  ],
  on_complete: {
    publish_event: 'daily_pipeline_completed',
    notify: false,
  },
};

/**
 * New User Onboarding Workflow
 * Triggered when user completes onboarding
 */
export const ONBOARDING_WORKFLOW: WorkflowDefinition = {
  id: 'onboarding_workflow',
  name: 'New User Onboarding',
  description: 'Set up initial roadmap and find job matches for new users',
  version: '1.0.0',
  trigger: {
    event: 'onboarding_completed',
  },
  steps: [
    {
      id: 'generate_roadmap',
      name: 'Generate Initial Roadmap',
      agent: 'architect',
      action: 'generateRoadmap',
      input_mapping: {
        user_id: '$.trigger.user_id',
      },
      output_key: 'initial_roadmap',
      on_error: 'fail',
    },
    {
      id: 'find_matches',
      name: 'Find Initial Job Matches',
      agent: 'sentinel',
      action: 'matchJobsForUser',
      input_mapping: {
        user_id: '$.trigger.user_id',
      },
      output_key: 'initial_matches',
      on_error: 'skip',
    },
    {
      id: 'schedule_practice',
      name: 'Schedule Practice Interview',
      agent: 'interviewer',
      action: 'suggestPracticeSession',
      input_mapping: {
        user_id: '$.trigger.user_id',
        target_roles: '$.trigger.target_roles',
      },
      output_key: 'practice_suggestion',
      on_error: 'skip',
    },
  ],
  on_complete: {
    publish_event: 'onboarding_setup_completed',
    notify: true,
  },
};

/**
 * Weekly Progress Review Workflow
 */
export const WEEKLY_PROGRESS_WORKFLOW: WorkflowDefinition = {
  id: 'weekly_progress_workflow',
  name: 'Weekly Progress Review',
  description: 'Evaluate weekly progress and adjust roadmap',
  version: '1.0.0',
  trigger: {
    schedule: '0 9 * * 1', // Monday 9 AM
  },
  steps: [
    {
      id: 'evaluate_progress',
      name: 'Evaluate User Progress',
      agent: 'architect',
      action: 'evaluateProgress',
      input_mapping: {
        user_id: '$.trigger.user_id',
        period: 'week',
      },
      output_key: 'progress_evaluation',
      on_error: 'fail',
    },
    {
      id: 'check_market_changes',
      name: 'Check Market Trend Changes',
      agent: 'sentinel',
      action: 'checkTrendChanges',
      input_mapping: {
        target_roles: '$.trigger.target_roles',
      },
      output_key: 'market_changes',
      on_error: 'skip',
    },
    {
      id: 'adjust_roadmap',
      name: 'Adjust Roadmap if Needed',
      agent: 'architect',
      action: 'repathRoadmap',
      input_mapping: {
        user_id: '$.trigger.user_id',
        progress: '$.progress_evaluation',
        market: '$.market_changes',
      },
      output_key: 'adjusted_roadmap',
      condition: '$.progress_evaluation.needs_adjustment === true',
      on_error: 'skip',
    },
  ],
  on_complete: {
    publish_event: 'weekly_review_completed',
    notify: true,
  },
};

// ============================================================================
// Workflow Orchestrator
// ============================================================================

export class WorkflowOrchestrator {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private agentFactories: Map<AgentType, AgentFactory> = new Map();

  constructor() {
    // Register predefined workflows
    this.registerWorkflow(INTERVIEW_FEEDBACK_WORKFLOW);
    this.registerWorkflow(DAILY_CAREER_PIPELINE);
    this.registerWorkflow(ONBOARDING_WORKFLOW);
    this.registerWorkflow(WEEKLY_PROGRESS_WORKFLOW);

    // Subscribe to trigger events
    this.setupEventTriggers();
  }

  /**
   * Register a workflow definition
   */
  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
    console.log(`[Orchestrator] Registered workflow: ${workflow.name}`);
  }

  /**
   * Register an agent factory for creating agent instances
   */
  registerAgentFactory(type: AgentType, factory: AgentFactory): void {
    this.agentFactories.set(type, factory);
  }

  /**
   * Execute a workflow
   */
  async execute(
    workflowId: string,
    triggerData: Record<string, unknown>
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const executionId = randomUUID();
    const execution: WorkflowExecution = {
      id: executionId,
      workflow_id: workflowId,
      status: 'pending',
      started_at: new Date(),
      data: { trigger: triggerData },
      results: {},
      errors: [],
    };

    this.executions.set(executionId, execution);

    console.log(`[Orchestrator] Starting workflow ${workflow.name} (${executionId})`);

    try {
      execution.status = 'running';

      // Execute steps in order
      for (const step of workflow.steps) {
        execution.current_step = step.id;

        // Check condition if present
        if (step.condition) {
          const shouldRun = this.evaluateCondition(step.condition, execution.data);
          if (!shouldRun) {
            console.log(`[Orchestrator] Skipping step ${step.name} - condition not met`);
            execution.results[step.id] = {
              step_id: step.id,
              status: 'skipped',
              output: null,
              duration_ms: 0,
              retries: 0,
            };
            continue;
          }
        }

        // Execute step
        const result = await this.executeStep(step, execution);
        execution.results[step.id] = result;

        if (result.status === 'failed' && step.on_error === 'fail') {
          throw new Error(`Step ${step.name} failed`);
        }

        // Store output in workflow data
        if (result.status === 'success' && result.output) {
          execution.data[step.output_key] = result.output;
        }
      }

      execution.status = 'completed';
      execution.completed_at = new Date();

      // Publish completion event
      if (workflow.on_complete?.publish_event) {
        // Convert SCREAMING_CASE to snake_case for MessagePayloads
        const topicKey = workflow.on_complete.publish_event.toLowerCase() as keyof MessagePayloads;
        await messageBus.publish(topicKey, {
          workflow_id: workflowId,
          execution_id: executionId,
          results: execution.results,
        } as never);
      }

      console.log(`[Orchestrator] Workflow ${workflow.name} completed successfully`);
    } catch (error) {
      execution.status = 'failed';
      execution.completed_at = new Date();
      execution.errors.push({
        step_id: execution.current_step || 'unknown',
        error: (error as Error).message,
        timestamp: new Date(),
        recoverable: false,
      });

      console.error(`[Orchestrator] Workflow ${workflow.name} failed:`, error);
    }

    return execution;
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    execution: WorkflowExecution
  ): Promise<StepResult> {
    const startTime = Date.now();
    let retries = 0;
    const maxRetries = step.max_retries || 0;

    while (retries <= maxRetries) {
      try {
        console.log(`[Orchestrator] Executing step: ${step.name} (attempt ${retries + 1})`);

        // Map inputs from workflow data
        const inputs = this.mapInputs(step.input_mapping, execution.data);

        // Get agent factory
        const factory = this.agentFactories.get(step.agent);
        if (!factory) {
          throw new Error(`No factory registered for agent type: ${step.agent}`);
        }

        // Create agent and execute action
        const agent = await factory.create(inputs);
        const output = await agent.execute(step.action, inputs);

        return {
          step_id: step.id,
          status: 'success',
          output,
          duration_ms: Date.now() - startTime,
          retries,
        };
      } catch (error) {
        console.error(`[Orchestrator] Step ${step.name} failed:`, error);

        if (retries < maxRetries) {
          retries++;
          await this.sleep(1000 * retries); // Exponential backoff
          continue;
        }

        execution.errors.push({
          step_id: step.id,
          error: (error as Error).message,
          timestamp: new Date(),
          recoverable: step.on_error !== 'fail',
        });

        return {
          step_id: step.id,
          status: 'failed',
          output: null,
          duration_ms: Date.now() - startTime,
          retries,
        };
      }
    }

    // Should never reach here
    return {
      step_id: step.id,
      status: 'failed',
      output: null,
      duration_ms: Date.now() - startTime,
      retries,
    };
  }

  /**
   * Execute steps in parallel
   */
  async executeParallel(
    group: ParallelGroup,
    workflow: WorkflowDefinition,
    execution: WorkflowExecution
  ): Promise<Map<string, StepResult>> {
    const steps = workflow.steps.filter((s) => group.steps.includes(s.id));
    const results = new Map<string, StepResult>();

    const timeout = group.timeout_ms || 60000;

    const promises = steps.map(async (step) => {
      const result = await Promise.race([
        this.executeStep(step, execution),
        this.createTimeout(timeout, step.id),
      ]);
      return { stepId: step.id, result };
    });

    const settled = await Promise.allSettled(promises);

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.set(result.value.stepId, result.value.result);
      }
    }

    // Check aggregation requirement
    const successCount = Array.from(results.values()).filter(
      (r) => r.status === 'success'
    ).length;

    const totalSteps = steps.length;
    let aggregationPassed = false;

    switch (group.aggregation) {
      case 'all':
        aggregationPassed = successCount === totalSteps;
        break;
      case 'any':
        aggregationPassed = successCount > 0;
        break;
      case 'majority':
        aggregationPassed = successCount > totalSteps / 2;
        break;
    }

    if (!aggregationPassed) {
      console.warn(`[Orchestrator] Parallel group ${group.name} did not meet aggregation requirement`);
    }

    return results;
  }

  /**
   * Map workflow data to step inputs using JSONPath-like syntax
   */
  private mapInputs(
    mapping: Record<string, string>,
    data: Record<string, unknown>
  ): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};

    for (const [key, path] of Object.entries(mapping)) {
      if (path.startsWith('$.')) {
        inputs[key] = this.getValueByPath(data, path.slice(2));
      } else {
        inputs[key] = path; // Literal value
      }
    }

    return inputs;
  }

  /**
   * Get value from object by dot-notation path
   */
  private getValueByPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Evaluate a condition expression
   */
  private evaluateCondition(condition: string, data: Record<string, unknown>): boolean {
    try {
      // Replace $.path references with actual values
      const evaluated = condition.replace(/\$\.[\w.]+/g, (match) => {
        const value = this.getValueByPath(data, match.slice(2));
        return JSON.stringify(value);
      });

      // Safe evaluation using Function constructor
      // Note: In production, use a proper expression evaluator
      const result = new Function(`return ${evaluated}`)();
      return Boolean(result);
    } catch (error) {
      console.warn(`[Orchestrator] Condition evaluation failed: ${condition}`, error);
      return false;
    }
  }

  /**
   * Set up event triggers for workflows
   */
  private setupEventTriggers(): void {
    for (const [id, workflow] of this.workflows) {
      if (workflow.trigger.event) {
        // Convert SCREAMING_CASE to snake_case for MessagePayloads
        const eventName = workflow.trigger.event.toLowerCase() as keyof MessagePayloads;
        messageBus.subscribe(eventName, async (payload: unknown) => {
          console.log(`[Orchestrator] Triggered workflow ${workflow.name} by event ${workflow.trigger.event}`);
          await this.execute(id, payload as Record<string, unknown>);
        });
      }
    }
  }

  /**
   * Get workflow execution status
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * List all registered workflows
   */
  listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Cancel a running workflow execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution) return false;

    if (execution.status === 'running') {
      execution.status = 'cancelled';
      execution.completed_at = new Date();
      return true;
    }

    return false;
  }

  private createTimeout(ms: number, stepId: string): Promise<StepResult> {
    return new Promise((_, reject) =>
      setTimeout(
        () =>
          reject({
            step_id: stepId,
            status: 'failed',
            output: null,
            duration_ms: ms,
            retries: 0,
          } as StepResult),
        ms
      )
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Agent Factory Interface
// ============================================================================

export interface AgentFactory {
  create(params: Record<string, unknown>): Promise<AgentInstance>;
}

export interface AgentInstance {
  execute(action: string, inputs: Record<string, unknown>): Promise<unknown>;
}

// ============================================================================
// Singleton Export
// ============================================================================

export const workflowOrchestrator = new WorkflowOrchestrator();

export default WorkflowOrchestrator;
