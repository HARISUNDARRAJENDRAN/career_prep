# Agent Coordinator

> **Document Version:** 1.0
> **Created:** January 5, 2026
> **Depends On:** 01-AGENTIC_ARCHITECTURE_OVERVIEW.md, 03-AGENT_STATE_MACHINE.md, 04-AGENT_MEMORY_SYSTEM.md
> **Purpose:** Multi-agent orchestration and workflow management

---

## Table of Contents

1. [Overview](#overview)
2. [Coordination Patterns](#coordination-patterns)
3. [Workflow Definitions](#workflow-definitions)
4. [Implementation](#implementation)
5. [Inter-Agent Communication](#inter-agent-communication)
6. [Conflict Resolution](#conflict-resolution)
7. [Integration with Existing Code](#integration-with-existing-code)

---

## Overview

### The Problem

Currently, agents operate independently without coordination:

```
Current Flow (Uncoordinated):

Interview Completed
        │
        ├──► Interviewer Agent (analyzes)
        ├──► Sentinel Agent (updates skills)      ← No order guarantee
        └──► Architect Agent (modifies roadmap)   ← May conflict
        
Problems:
• Architect may run before Sentinel finishes skill update
• No shared understanding of the "current state"
• Each agent makes decisions in isolation
• User sees fragmented, potentially conflicting actions
```

### The Solution

A Coordinator that orchestrates multi-agent workflows:

```
Target Flow (Coordinated):

Interview Completed
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    AGENT COORDINATOR                         │
│                                                              │
│  1. Receive trigger event                                    │
│  2. Determine workflow (interview_feedback_workflow)        │
│  3. Execute agents in order with dependencies               │
│  4. Manage state transitions                                 │
│  5. Handle failures and rollbacks                            │
│  6. Aggregate results for user                               │
└─────────────────────────────────────────────────────────────┘
        │
        ├──► Step 1: Interviewer Agent
        │         ├── Analyze transcript
        │         └── Output: feedback, skill_signals
        │                    │
        ├──► Step 2: Sentinel Agent (waits for Step 1)
        │         ├── Input: skill_signals from Step 1
        │         └── Output: updated_skills
        │                    │
        └──► Step 3: Architect Agent (waits for Step 2)
                  ├── Input: updated_skills, feedback
                  └── Output: roadmap_adjustments
```

---

## Coordination Patterns

### Pattern 1: Sequential Pipeline

Agents run in strict order, each receiving outputs from previous:

```
A ──► B ──► C ──► D

Example: Resume Upload Flow
ParseResume ──► ExtractSkills ──► MatchJobs ──► GenerateRoadmap
```

### Pattern 2: Fan-Out / Fan-In

Multiple agents run in parallel, results aggregated:

```
        ┌──► B ──┐
A ──────┼──► C ──┼──► E
        └──► D ──┘

Example: Market Analysis
FetchData ──┬──► AnalyzeTrends ──┬──► CompileReport
            ├──► AnalyzeSalaries ─┤
            └──► AnalyzeSkills ───┘
```

### Pattern 3: Conditional Branching

Different paths based on intermediate results:

```
        ┌── [high confidence] ──► B
A ──────┤
        └── [low confidence] ──► C ──► D ──► B

Example: Interview Analysis
Analyze ──┬── [good performance] ──► Celebrate ──► MinorTweaks
          └── [needs work] ──► DeepDive ──► RoadmapOverhaul
```

### Pattern 4: Iterative Refinement

Agent output feeds back to itself until satisfied:

```
        ┌────────────────────┐
        │                    │
A ──────┴──► B ──► Evaluate ─┴──► [satisfied] ──► C

Example: Response Generation
Draft ──► Evaluate ──► [not good enough] ──► Refine ──► Evaluate ──► ...
```

---

## Workflow Definitions

### Workflow Schema

```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  trigger: string;  // Event type that starts this workflow
  version: number;
  
  steps: WorkflowStep[];
  
  onSuccess?: string;  // Event to emit on completion
  onFailure?: string;  // Event to emit on failure
  
  config: {
    timeout_ms: number;
    max_retries: number;
    allow_partial_success: boolean;
  };
}

interface WorkflowStep {
  id: string;
  agent: AgentName;
  action: string;
  
  // Dependencies
  depends_on?: string[];  // Step IDs that must complete first
  
  // Inputs from previous steps
  input_mapping?: {
    [inputKey: string]: {
      from_step: string;
      output_key: string;
    } | {
      from_trigger: string;
    };
  };
  
  // Conditional execution
  condition?: {
    step: string;
    output_key: string;
    operator: 'eq' | 'gt' | 'lt' | 'exists' | 'not_exists';
    value: unknown;
  };
  
  // Step-specific config
  config?: {
    timeout_ms?: number;
    retry_count?: number;
    allow_failure?: boolean;
  };
}
```

### Example Workflows

```typescript
// src/lib/agents/workflows/interview-completed.ts

export const interviewCompletedWorkflow: WorkflowDefinition = {
  id: 'interview_completed',
  name: 'Interview Completed Workflow',
  trigger: 'INTERVIEW_COMPLETED',
  version: 1,
  
  steps: [
    {
      id: 'analyze_interview',
      agent: 'interviewer',
      action: 'analyze_transcript',
      input_mapping: {
        interview_id: { from_trigger: 'interview_id' },
        user_id: { from_trigger: 'user_id' },
      },
    },
    {
      id: 'extract_skill_signals',
      agent: 'sentinel',
      action: 'extract_skills_from_interview',
      depends_on: ['analyze_interview'],
      input_mapping: {
        analysis: { from_step: 'analyze_interview', output_key: 'analysis' },
        user_id: { from_trigger: 'user_id' },
      },
    },
    {
      id: 'update_skills',
      agent: 'sentinel',
      action: 'update_user_skills',
      depends_on: ['extract_skill_signals'],
      input_mapping: {
        skill_signals: { from_step: 'extract_skill_signals', output_key: 'skills' },
        user_id: { from_trigger: 'user_id' },
      },
    },
    {
      id: 'check_roadmap_impact',
      agent: 'architect',
      action: 'evaluate_roadmap_relevance',
      depends_on: ['update_skills'],
      input_mapping: {
        updated_skills: { from_step: 'update_skills', output_key: 'skills' },
        interview_feedback: { from_step: 'analyze_interview', output_key: 'feedback' },
        user_id: { from_trigger: 'user_id' },
      },
    },
    {
      id: 'adjust_roadmap',
      agent: 'architect',
      action: 'adjust_roadmap',
      depends_on: ['check_roadmap_impact'],
      condition: {
        step: 'check_roadmap_impact',
        output_key: 'needs_adjustment',
        operator: 'eq',
        value: true,
      },
      input_mapping: {
        impact_analysis: { from_step: 'check_roadmap_impact', output_key: 'analysis' },
        user_id: { from_trigger: 'user_id' },
      },
    },
    {
      id: 'notify_user',
      agent: 'action',
      action: 'send_interview_summary',
      depends_on: ['analyze_interview', 'adjust_roadmap'],
      input_mapping: {
        analysis: { from_step: 'analyze_interview', output_key: 'analysis' },
        roadmap_changes: { from_step: 'adjust_roadmap', output_key: 'changes' },
        user_id: { from_trigger: 'user_id' },
      },
      config: {
        allow_failure: true,  // Don't fail workflow if notification fails
      },
    },
  ],
  
  onSuccess: 'INTERVIEW_WORKFLOW_COMPLETED',
  onFailure: 'INTERVIEW_WORKFLOW_FAILED',
  
  config: {
    timeout_ms: 5 * 60 * 1000,  // 5 minutes total
    max_retries: 2,
    allow_partial_success: true,
  },
};
```

---

## Implementation

### File: `src/lib/agents/core/agent-coordinator.ts`

```typescript
/**
 * Agent Coordinator
 * 
 * Orchestrates multi-agent workflows with dependency management,
 * state tracking, and failure handling.
 */

import { db } from '@/drizzle/db';
import { workflowExecutions, workflowStepExecutions } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { publishAgentEvent } from '@/lib/agents/message-bus';
import { AgentStateMachine, createAgentStateMachine } from './agent-state';
import { createMemoryManager } from './agent-memory';

// Types
type AgentName = 'interviewer' | 'sentinel' | 'architect' | 'action' | 'strategist';

interface WorkflowStep {
  id: string;
  agent: AgentName;
  action: string;
  depends_on?: string[];
  input_mapping?: Record<string, { from_step?: string; output_key?: string; from_trigger?: string }>;
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

interface WorkflowDefinition {
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

interface StepResult {
  step_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: Record<string, unknown>;
  error?: string;
  started_at?: Date;
  completed_at?: Date;
}

interface WorkflowContext {
  workflow_id: string;
  execution_id: string;
  trigger_payload: Record<string, unknown>;
  step_results: Map<string, StepResult>;
  state_machines: Map<string, AgentStateMachine>;
}

// Agent action registry (maps agent + action to handler)
const ACTION_HANDLERS: Record<string, Record<string, (input: unknown) => Promise<unknown>>> = {
  interviewer: {
    analyze_transcript: async (input) => {
      // Import and call actual implementation
      const { analyzeTranscript } = await import('@/trigger/jobs/interview-analyzer');
      return analyzeTranscript(input);
    },
  },
  sentinel: {
    extract_skills_from_interview: async (input) => {
      const { extractSkillsFromInterview } = await import('@/trigger/jobs/skill-extractor');
      return extractSkillsFromInterview(input);
    },
    update_user_skills: async (input) => {
      const { updateUserSkills } = await import('@/trigger/jobs/skill-updater');
      return updateUserSkills(input);
    },
  },
  architect: {
    evaluate_roadmap_relevance: async (input) => {
      const { evaluateRoadmapRelevance } = await import('@/trigger/jobs/roadmap-evaluator');
      return evaluateRoadmapRelevance(input);
    },
    adjust_roadmap: async (input) => {
      const { adjustRoadmap } = await import('@/trigger/jobs/roadmap-repather');
      return adjustRoadmap(input);
    },
  },
  action: {
    send_interview_summary: async (input) => {
      const { sendInterviewSummary } = await import('@/services/notifications');
      return sendInterviewSummary(input);
    },
  },
};

export class AgentCoordinator {
  private workflows: Map<string, WorkflowDefinition> = new Map();

  /**
   * Register a workflow definition
   */
  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.trigger, workflow);
    console.log(`Registered workflow: ${workflow.name} for trigger: ${workflow.trigger}`);
  }

  /**
   * Execute a workflow triggered by an event
   */
  async executeWorkflow(
    trigger: string,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; execution_id: string; results: Record<string, StepResult> }> {
    const workflow = this.workflows.get(trigger);
    
    if (!workflow) {
      throw new Error(`No workflow registered for trigger: ${trigger}`);
    }

    // Create execution record
    const execution_id = crypto.randomUUID();
    const context: WorkflowContext = {
      workflow_id: workflow.id,
      execution_id,
      trigger_payload: payload,
      step_results: new Map(),
      state_machines: new Map(),
    };

    // Persist execution start
    await this.persistExecutionStart(workflow, execution_id, payload);

    try {
      // Build execution graph
      const executionOrder = this.topologicalSort(workflow.steps);
      
      // Execute steps
      for (const stepId of executionOrder) {
        const step = workflow.steps.find(s => s.id === stepId)!;
        await this.executeStep(workflow, step, context);
      }

      // Check for failures
      const failures = Array.from(context.step_results.values()).filter(r => r.status === 'failed');
      const success = failures.length === 0 || 
        (workflow.config.allow_partial_success && failures.every(f => {
          const step = workflow.steps.find(s => s.id === f.step_id);
          return step?.config?.allow_failure;
        }));

      // Persist completion
      await this.persistExecutionComplete(execution_id, success, context);

      // Emit completion event
      if (success && workflow.onSuccess) {
        await publishAgentEvent({
          type: workflow.onSuccess as any,
          payload: {
            workflow_id: workflow.id,
            execution_id,
            results: Object.fromEntries(context.step_results),
          },
        });
      } else if (!success && workflow.onFailure) {
        await publishAgentEvent({
          type: workflow.onFailure as any,
          payload: {
            workflow_id: workflow.id,
            execution_id,
            failures,
          },
        });
      }

      return {
        success,
        execution_id,
        results: Object.fromEntries(context.step_results),
      };

    } catch (error) {
      await this.persistExecutionComplete(execution_id, false, context, error);
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
    if (step.depends_on) {
      for (const depId of step.depends_on) {
        const depResult = context.step_results.get(depId);
        if (!depResult || depResult.status !== 'completed') {
          // If dependency failed and this step requires it, skip
          if (depResult?.status === 'failed') {
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
        await this.persistStepResult(context.execution_id, stepResult);
        return;
      }
    }

    // Build input from mapping
    const input = this.buildStepInput(step, context);

    // Create state machine for this step's agent
    const stateMachine = createAgentStateMachine({
      agentName: step.agent,
      userId: context.trigger_payload.user_id as string,
      taskId: `${context.execution_id}:${step.id}`,
    });
    context.state_machines.set(step.id, stateMachine);

    // Execute
    stepResult.status = 'running';
    stepResult.started_at = new Date();
    await this.persistStepResult(context.execution_id, stepResult);

    try {
      await stateMachine.transition({ type: 'START', payload: { task_id: step.id } });
      
      const handler = ACTION_HANDLERS[step.agent]?.[step.action];
      if (!handler) {
        throw new Error(`No handler for ${step.agent}.${step.action}`);
      }

      const timeout = step.config?.timeout_ms || workflow.config.timeout_ms;
      const output = await Promise.race([
        handler(input),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Step timeout')), timeout)
        ),
      ]);

      stepResult.status = 'completed';
      stepResult.output = output as Record<string, unknown>;
      stepResult.completed_at = new Date();

      await stateMachine.transition({ type: 'EVALUATION_PASS', payload: { confidence: 1.0 } });

    } catch (error) {
      stepResult.status = 'failed';
      stepResult.error = error instanceof Error ? error.message : 'Unknown error';
      stepResult.completed_at = new Date();

      await stateMachine.transition({
        type: 'STEP_FAILED',
        payload: { step_id: step.id, error: stepResult.error },
      });

      // Retry logic
      const retryCount = step.config?.retry_count || workflow.config.max_retries;
      // Note: Implement retry logic here if needed
    }

    await this.persistStepResult(context.execution_id, stepResult);
  }

  /**
   * Build input for a step from mappings
   */
  private buildStepInput(step: WorkflowStep, context: WorkflowContext): Record<string, unknown> {
    const input: Record<string, unknown> = {};

    if (step.input_mapping) {
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
    if (!stepResult?.output) return false;

    const value = stepResult.output[condition.output_key];

    switch (condition.operator) {
      case 'eq': return value === condition.value;
      case 'gt': return (value as number) > (condition.value as number);
      case 'lt': return (value as number) < (condition.value as number);
      case 'exists': return value !== undefined && value !== null;
      case 'not_exists': return value === undefined || value === null;
      default: return false;
    }
  }

  /**
   * Topologically sort steps by dependencies
   */
  private topologicalSort(steps: WorkflowStep[]): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (stepId: string) => {
      if (visited.has(stepId)) return;
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected at step: ${stepId}`);
      }

      visiting.add(stepId);
      const step = steps.find(s => s.id === stepId);
      
      if (step?.depends_on) {
        for (const dep of step.depends_on) {
          visit(dep);
        }
      }

      visiting.delete(stepId);
      visited.add(stepId);
      result.push(stepId);
    };

    for (const step of steps) {
      visit(step.id);
    }

    return result;
  }

  /**
   * Persist execution start to database
   */
  private async persistExecutionStart(
    workflow: WorkflowDefinition,
    execution_id: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await db.insert(workflowExecutions).values({
      id: execution_id,
      workflow_id: workflow.id,
      workflow_version: workflow.version,
      trigger_payload: payload,
      status: 'running',
      started_at: new Date(),
    });
  }

  /**
   * Persist execution completion
   */
  private async persistExecutionComplete(
    execution_id: string,
    success: boolean,
    context: WorkflowContext,
    error?: unknown
  ): Promise<void> {
    await db
      .update(workflowExecutions)
      .set({
        status: success ? 'completed' : 'failed',
        completed_at: new Date(),
        result: Object.fromEntries(context.step_results),
        error: error instanceof Error ? error.message : undefined,
      })
      .where(eq(workflowExecutions.id, execution_id));
  }

  /**
   * Persist step result
   */
  private async persistStepResult(execution_id: string, result: StepResult): Promise<void> {
    await db
      .insert(workflowStepExecutions)
      .values({
        id: crypto.randomUUID(),
        execution_id,
        step_id: result.step_id,
        status: result.status,
        output: result.output,
        error: result.error,
        started_at: result.started_at,
        completed_at: result.completed_at,
      })
      .onConflictDoUpdate({
        target: [workflowStepExecutions.execution_id, workflowStepExecutions.step_id],
        set: {
          status: result.status,
          output: result.output,
          error: result.error,
          completed_at: result.completed_at,
        },
      });
  }

  /**
   * Get workflow execution status
   */
  async getExecutionStatus(execution_id: string): Promise<{
    status: string;
    steps: StepResult[];
  } | null> {
    const execution = await db.query.workflowExecutions.findFirst({
      where: eq(workflowExecutions.id, execution_id),
    });

    if (!execution) return null;

    const steps = await db.query.workflowStepExecutions.findMany({
      where: eq(workflowStepExecutions.execution_id, execution_id),
    });

    return {
      status: execution.status,
      steps: steps.map(s => ({
        step_id: s.step_id,
        status: s.status as StepResult['status'],
        output: s.output as Record<string, unknown>,
        error: s.error || undefined,
        started_at: s.started_at || undefined,
        completed_at: s.completed_at || undefined,
      })),
    };
  }
}

// Singleton instance
let coordinatorInstance: AgentCoordinator | null = null;

export function getCoordinator(): AgentCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new AgentCoordinator();
  }
  return coordinatorInstance;
}

export function registerWorkflow(workflow: WorkflowDefinition): void {
  getCoordinator().registerWorkflow(workflow);
}
```

---

## Inter-Agent Communication

### Shared Context Pattern

```typescript
// Agents can read from shared workflow context

interface SharedContext {
  workflow_id: string;
  execution_id: string;
  
  // Outputs from previous steps
  step_outputs: Record<string, unknown>;
  
  // Shared knowledge accumulated during workflow
  shared_memory: Record<string, unknown>;
  
  // Signals for downstream agents
  signals: Array<{
    from_agent: string;
    signal_type: string;
    data: unknown;
  }>;
}

// Example: Sentinel signals high-priority skill gap
await sharedContext.addSignal({
  from_agent: 'sentinel',
  signal_type: 'SKILL_GAP_CRITICAL',
  data: {
    skill: 'system_design',
    current_level: 2,
    required_level: 4,
    urgency: 'high',
  },
});

// Architect reads signal and prioritizes
const criticalSignals = sharedContext.signals.filter(
  s => s.signal_type === 'SKILL_GAP_CRITICAL'
);
```

### Message Passing

```typescript
// Add to message-bus.ts

export async function sendAgentMessage(
  from_agent: string,
  to_agent: string,
  message: {
    type: string;
    payload: unknown;
    requires_response?: boolean;
  }
): Promise<unknown | void> {
  const messageId = crypto.randomUUID();
  
  await db.insert(agentMessages).values({
    id: messageId,
    from_agent,
    to_agent,
    message_type: message.type,
    payload: message.payload,
    requires_response: message.requires_response || false,
    status: 'pending',
  });

  if (message.requires_response) {
    // Wait for response (with timeout)
    return waitForResponse(messageId, 30000);
  }
}
```

---

## Conflict Resolution

### Priority-Based Resolution

```typescript
// When multiple agents want to modify the same resource

interface ResourceLock {
  resource_type: string;  // 'roadmap', 'skills', 'job_applications'
  resource_id: string;
  locked_by: string;      // agent name
  locked_at: Date;
  expires_at: Date;
}

async function acquireResourceLock(
  agentName: string,
  resourceType: string,
  resourceId: string,
  priority: number
): Promise<{ acquired: boolean; existing_lock?: ResourceLock }> {
  const existingLock = await db.query.resourceLocks.findFirst({
    where: and(
      eq(resourceLocks.resource_type, resourceType),
      eq(resourceLocks.resource_id, resourceId),
      gt(resourceLocks.expires_at, new Date())
    ),
  });

  if (existingLock) {
    // Check priority
    const existingPriority = AGENT_PRIORITIES[existingLock.locked_by];
    if (priority > existingPriority) {
      // Higher priority agent can preempt
      await releaseLock(existingLock.id);
    } else {
      return { acquired: false, existing_lock: existingLock };
    }
  }

  // Acquire lock
  await db.insert(resourceLocks).values({
    resource_type: resourceType,
    resource_id: resourceId,
    locked_by: agentName,
    locked_at: new Date(),
    expires_at: new Date(Date.now() + 60000), // 1 minute
  });

  return { acquired: true };
}

const AGENT_PRIORITIES: Record<string, number> = {
  strategist: 5,   // Highest - strategic decisions
  architect: 4,    // Roadmap changes
  sentinel: 3,     // Skill updates
  interviewer: 2,  // Interview analysis
  action: 1,       // Actions/notifications
};
```

---

## Integration with Existing Code

### Modifying Message Bus

```typescript
// src/lib/agents/message-bus.ts - Add workflow integration

import { getCoordinator } from './core/agent-coordinator';

export async function publishAgentEvent(event: AgentEventUnion): Promise<void> {
  // Existing event publishing...
  await persistEvent(event);
  
  // Check if this event triggers a workflow
  const coordinator = getCoordinator();
  try {
    await coordinator.executeWorkflow(event.type, event.payload as Record<string, unknown>);
  } catch (error) {
    // Workflow not found for this trigger - that's OK
    if (!(error instanceof Error && error.message.includes('No workflow registered'))) {
      console.error('Workflow execution failed:', error);
    }
  }
  
  // Continue with existing event routing...
}
```

### Registering Workflows at Startup

```typescript
// src/lib/agents/workflows/index.ts

import { registerWorkflow } from '../core/agent-coordinator';
import { interviewCompletedWorkflow } from './interview-completed';
import { resumeUploadedWorkflow } from './resume-uploaded';
import { marketUpdateWorkflow } from './market-update';
import { jobMatchedWorkflow } from './job-matched';

export function initializeWorkflows(): void {
  registerWorkflow(interviewCompletedWorkflow);
  registerWorkflow(resumeUploadedWorkflow);
  registerWorkflow(marketUpdateWorkflow);
  registerWorkflow(jobMatchedWorkflow);
  
  console.log('All workflows registered');
}

// Call in app initialization
// src/app/layout.tsx or src/trigger/index.ts
import { initializeWorkflows } from '@/lib/agents/workflows';
initializeWorkflows();
```

---

## Database Schema for Workflows

```typescript
// src/drizzle/schema/workflow-executions.ts

export const workflowExecutions = pgTable('workflow_executions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  workflow_id: varchar('workflow_id', { length: 100 }).notNull(),
  workflow_version: integer('workflow_version').notNull(),
  trigger_payload: jsonb('trigger_payload'),
  status: pgEnum('workflow_status', ['pending', 'running', 'completed', 'failed'])('status').default('pending'),
  result: jsonb('result'),
  error: text('error'),
  started_at: timestamp('started_at'),
  completed_at: timestamp('completed_at'),
});

export const workflowStepExecutions = pgTable('workflow_step_executions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  execution_id: varchar('execution_id', { length: 36 }).references(() => workflowExecutions.id),
  step_id: varchar('step_id', { length: 100 }).notNull(),
  status: pgEnum('step_status', ['pending', 'running', 'completed', 'failed', 'skipped'])('status'),
  output: jsonb('output'),
  error: text('error'),
  started_at: timestamp('started_at'),
  completed_at: timestamp('completed_at'),
}, (table) => [
  index('idx_step_execution').on(table.execution_id, table.step_id),
]);
```

---

## Next Document

Continue to **06-ITERATIVE_LOOPS.md** for loop-until-satisfied execution.

---

**Document Status:** Draft
**Dependencies:** 01, 03, 04
**Next:** 06-ITERATIVE_LOOPS.md
