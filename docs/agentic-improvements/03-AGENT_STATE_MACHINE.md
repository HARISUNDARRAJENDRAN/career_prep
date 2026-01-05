# Agent State Machine

> **Document Version:** 1.0
> **Created:** January 5, 2026
> **Depends On:** 01-AGENTIC_ARCHITECTURE_OVERVIEW.md, 02-REASONING_LAYER_INTEGRATION.md
> **Purpose:** Implementation plan for agent state management and transitions

---

## Table of Contents

1. [Overview](#overview)
2. [Why State Machines?](#why-state-machines)
3. [State Definitions](#state-definitions)
4. [State Transitions](#state-transitions)
5. [Implementation](#implementation)
6. [Database Schema](#database-schema)
7. [Integration with Existing Code](#integration-with-existing-code)
8. [State Visualization](#state-visualization)

---

## Overview

### What is an Agent State Machine?

A state machine defines the explicit states an agent can be in and the valid transitions between them. Instead of agents being "running or not", they have meaningful states like `planning`, `executing`, `evaluating`, `waiting_for_input`, etc.

### Current vs Target

| Current | Target |
|---------|--------|
| Agent is either "idle" or "running" | Agent has 8+ explicit states |
| No visibility into what agent is doing | Clear state indicates current activity |
| No control over execution flow | Can pause, resume, retry from any state |
| Failures are binary (success/fail) | Failures have recovery paths based on state |

---

## Why State Machines?

### Problems Without State Machines

1. **No visibility**: "Is the interview analyzer running or stuck?"
2. **No recovery**: If a job fails at step 5 of 10, we restart from step 1
3. **No coordination**: Can't tell other agents "I'm waiting for your output"
4. **No debugging**: "What was the agent doing when it failed?"

### Benefits of State Machines

```
✅ Explicit state = clear debugging
✅ State transitions = audit trail
✅ Invalid transitions = bug detection
✅ Persistent state = crash recovery
✅ State queries = coordination between agents
```

---

## State Definitions

### Universal Agent States

Every autonomous agent can be in one of these states:

```typescript
type AgentState =
  | 'idle'              // Not doing anything, waiting for trigger
  | 'initializing'      // Loading context, preparing resources
  | 'planning'          // Reasoning about what to do
  | 'executing'         // Running a plan step
  | 'evaluating'        // Assessing output quality
  | 'adapting'          // Modifying plan based on evaluation
  | 'waiting_input'     // Blocked on external input (user, API, other agent)
  | 'waiting_agent'     // Blocked on another agent's completion
  | 'succeeded'         // Completed successfully
  | 'failed'            // Failed after exhausting retries
  | 'paused'            // Manually paused by user/admin
  | 'cancelled';        // Explicitly cancelled
```

### State Descriptions

| State | Description | Typical Duration | Can Transition To |
|-------|-------------|------------------|-------------------|
| `idle` | Agent is dormant, no active task | Indefinite | `initializing` |
| `initializing` | Loading memory, context, tools | 1-5 seconds | `planning`, `failed` |
| `planning` | AI reasoning about approach | 5-30 seconds | `executing`, `failed` |
| `executing` | Running tools, calling APIs | Varies | `evaluating`, `waiting_input`, `failed` |
| `evaluating` | Checking output quality | 2-10 seconds | `adapting`, `succeeded`, `executing` |
| `adapting` | Modifying plan based on feedback | 5-15 seconds | `executing`, `failed` |
| `waiting_input` | Needs external data | Indefinite | `executing`, `cancelled` |
| `waiting_agent` | Blocked on another agent | Indefinite | `executing`, `cancelled` |
| `succeeded` | Task completed successfully | Terminal | `idle` (after cleanup) |
| `failed` | Task failed permanently | Terminal | `idle` (after cleanup) |
| `paused` | Manually paused | Indefinite | Any previous state |
| `cancelled` | Explicitly stopped | Terminal | `idle` (after cleanup) |

---

## State Transitions

### Valid Transition Matrix

```
             │ idle │ init │ plan │ exec │ eval │ adapt │ wait_i │ wait_a │ succ │ fail │ pause │ cancel │
─────────────┼──────┼──────┼──────┼──────┼──────┼───────┼────────┼────────┼──────┼──────┼───────┼────────┤
idle         │  -   │  ✓   │  -   │  -   │  -   │   -   │   -    │   -    │  -   │  -   │   -   │   -    │
initializing │  -   │  -   │  ✓   │  -   │  -   │   -   │   -    │   -    │  -   │  ✓   │   ✓   │   ✓    │
planning     │  -   │  -   │  -   │  ✓   │  -   │   -   │   -    │   -    │  -   │  ✓   │   ✓   │   ✓    │
executing    │  -   │  -   │  -   │  -   │  ✓   │   -   │   ✓    │   ✓    │  -   │  ✓   │   ✓   │   ✓    │
evaluating   │  -   │  -   │  -   │  ✓   │  -   │   ✓   │   -    │   -    │  ✓   │  ✓   │   ✓   │   ✓    │
adapting     │  -   │  -   │  -   │  ✓   │  -   │   -   │   -    │   -    │  -   │  ✓   │   ✓   │   ✓    │
waiting_input│  -   │  -   │  -   │  ✓   │  -   │   -   │   -    │   -    │  -   │  ✓   │   ✓   │   ✓    │
waiting_agent│  -   │  -   │  -   │  ✓   │  -   │   -   │   -    │   -    │  -   │  ✓   │   ✓   │   ✓    │
succeeded    │  ✓   │  -   │  -   │  -   │  -   │   -   │   -    │   -    │  -   │  -   │   -   │   -    │
failed       │  ✓   │  -   │  -   │  -   │  -   │   -   │   -    │   -    │  -   │  -   │   -   │   -    │
paused       │  -   │  ✓*  │  ✓*  │  ✓*  │  ✓*  │   ✓*  │   ✓*   │   ✓*   │  -   │  -   │   -   │   ✓    │
cancelled    │  ✓   │  -   │  -   │  -   │  -   │   -   │   -    │   -    │  -   │  -   │   -   │   -    │

* Returns to the state it was paused from
```

### Transition Events

Each transition is triggered by an event:

```typescript
type TransitionEvent =
  | { type: 'START'; payload: { task_id: string } }
  | { type: 'INIT_COMPLETE'; payload: { context_loaded: boolean } }
  | { type: 'PLAN_COMPLETE'; payload: { plan_id: string; steps: number } }
  | { type: 'STEP_COMPLETE'; payload: { step_id: string; output: unknown } }
  | { type: 'STEP_FAILED'; payload: { step_id: string; error: string } }
  | { type: 'EVALUATION_PASS'; payload: { confidence: number } }
  | { type: 'EVALUATION_FAIL'; payload: { confidence: number; reason: string } }
  | { type: 'ADAPTATION_COMPLETE'; payload: { new_plan_id: string } }
  | { type: 'INPUT_RECEIVED'; payload: { input_type: string; data: unknown } }
  | { type: 'AGENT_COMPLETE'; payload: { agent_id: string; output: unknown } }
  | { type: 'TIMEOUT'; payload: { duration_ms: number } }
  | { type: 'MAX_ITERATIONS'; payload: { iterations: number } }
  | { type: 'PAUSE'; payload: { reason: string } }
  | { type: 'RESUME'; payload: {} }
  | { type: 'CANCEL'; payload: { reason: string } };
```

---

## Implementation

### File: `src/lib/agents/core/agent-state.ts`

```typescript
/**
 * Agent State Machine
 * 
 * Manages agent states and transitions with validation.
 * Persists state to database for crash recovery.
 * 
 * Integration Points:
 * - Used by all autonomous agents
 * - Stores state in agent_states table
 * - Emits state change events to message bus
 */

import { db } from '@/drizzle/db';
import { agentStates } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { publishAgentEvent } from '@/lib/agents/message-bus';

// State type definition
export type AgentState =
  | 'idle'
  | 'initializing'
  | 'planning'
  | 'executing'
  | 'evaluating'
  | 'adapting'
  | 'waiting_input'
  | 'waiting_agent'
  | 'succeeded'
  | 'failed'
  | 'paused'
  | 'cancelled';

// Transition event types
export type TransitionEvent =
  | { type: 'START'; payload: { task_id: string } }
  | { type: 'INIT_COMPLETE'; payload: { context_loaded: boolean } }
  | { type: 'PLAN_COMPLETE'; payload: { plan_id: string; steps: number } }
  | { type: 'STEP_COMPLETE'; payload: { step_id: string; output: unknown } }
  | { type: 'STEP_FAILED'; payload: { step_id: string; error: string } }
  | { type: 'EVALUATION_PASS'; payload: { confidence: number } }
  | { type: 'EVALUATION_FAIL'; payload: { confidence: number; reason: string } }
  | { type: 'ADAPTATION_COMPLETE'; payload: { new_plan_id: string } }
  | { type: 'INPUT_RECEIVED'; payload: { input_type: string; data: unknown } }
  | { type: 'AGENT_COMPLETE'; payload: { agent_id: string; output: unknown } }
  | { type: 'TIMEOUT'; payload: { duration_ms: number } }
  | { type: 'MAX_ITERATIONS'; payload: { iterations: number } }
  | { type: 'PAUSE'; payload: { reason: string } }
  | { type: 'RESUME'; payload: {} }
  | { type: 'CANCEL'; payload: { reason: string } };

// Valid transitions map
const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ['initializing'],
  initializing: ['planning', 'failed', 'paused', 'cancelled'],
  planning: ['executing', 'failed', 'paused', 'cancelled'],
  executing: ['evaluating', 'waiting_input', 'waiting_agent', 'failed', 'paused', 'cancelled'],
  evaluating: ['executing', 'adapting', 'succeeded', 'failed', 'paused', 'cancelled'],
  adapting: ['executing', 'failed', 'paused', 'cancelled'],
  waiting_input: ['executing', 'failed', 'paused', 'cancelled'],
  waiting_agent: ['executing', 'failed', 'paused', 'cancelled'],
  succeeded: ['idle'],
  failed: ['idle'],
  paused: ['initializing', 'planning', 'executing', 'evaluating', 'adapting', 'waiting_input', 'waiting_agent', 'cancelled'],
  cancelled: ['idle'],
};

// State metadata
interface StateMetadata {
  task_id?: string;
  plan_id?: string;
  current_step_id?: string;
  iteration?: number;
  confidence?: number;
  error?: string;
  waiting_for?: string;
  paused_from_state?: AgentState;
  extra?: Record<string, unknown>;
}

// State history entry
interface StateHistoryEntry {
  from_state: AgentState;
  to_state: AgentState;
  event: TransitionEvent;
  timestamp: Date;
  metadata?: StateMetadata;
}

export interface AgentStateConfig {
  agentName: string;
  userId?: string;
  taskId?: string;
  persistToDb?: boolean;
}

export class AgentStateMachine {
  private state: AgentState = 'idle';
  private metadata: StateMetadata = {};
  private history: StateHistoryEntry[] = [];
  private config: AgentStateConfig;
  private dbId?: string;

  constructor(config: AgentStateConfig) {
    this.config = {
      persistToDb: true,
      ...config,
    };
  }

  /**
   * Get current state
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Get state metadata
   */
  getMetadata(): StateMetadata {
    return { ...this.metadata };
  }

  /**
   * Get state history
   */
  getHistory(): StateHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Check if a transition is valid
   */
  canTransition(toState: AgentState): boolean {
    return VALID_TRANSITIONS[this.state].includes(toState);
  }

  /**
   * Transition to a new state
   */
  async transition(event: TransitionEvent): Promise<{ success: boolean; newState: AgentState; error?: string }> {
    const targetState = this.getTargetState(event);
    
    if (!targetState) {
      return {
        success: false,
        newState: this.state,
        error: `No target state for event ${event.type} from state ${this.state}`,
      };
    }

    if (!this.canTransition(targetState)) {
      return {
        success: false,
        newState: this.state,
        error: `Invalid transition: ${this.state} -> ${targetState}`,
      };
    }

    const previousState = this.state;
    
    // Update metadata based on event
    this.updateMetadata(event, targetState);
    
    // Record history
    this.history.push({
      from_state: previousState,
      to_state: targetState,
      event,
      timestamp: new Date(),
      metadata: { ...this.metadata },
    });

    // Update state
    this.state = targetState;

    // Persist to database if enabled
    if (this.config.persistToDb) {
      await this.persistState();
    }

    // Emit state change event
    await this.emitStateChange(previousState, targetState, event);

    return { success: true, newState: this.state };
  }

  /**
   * Determine target state from event
   */
  private getTargetState(event: TransitionEvent): AgentState | null {
    switch (event.type) {
      case 'START':
        return this.state === 'idle' ? 'initializing' : null;
      
      case 'INIT_COMPLETE':
        return this.state === 'initializing' ? 'planning' : null;
      
      case 'PLAN_COMPLETE':
        return this.state === 'planning' ? 'executing' : null;
      
      case 'STEP_COMPLETE':
        return this.state === 'executing' ? 'evaluating' : null;
      
      case 'STEP_FAILED':
        return 'failed'; // Can fail from multiple states
      
      case 'EVALUATION_PASS':
        return this.state === 'evaluating' ? 'succeeded' : null;
      
      case 'EVALUATION_FAIL':
        return this.state === 'evaluating' ? 'adapting' : null;
      
      case 'ADAPTATION_COMPLETE':
        return this.state === 'adapting' ? 'executing' : null;
      
      case 'INPUT_RECEIVED':
        return this.state === 'waiting_input' ? 'executing' : null;
      
      case 'AGENT_COMPLETE':
        return this.state === 'waiting_agent' ? 'executing' : null;
      
      case 'TIMEOUT':
      case 'MAX_ITERATIONS':
        return 'failed';
      
      case 'PAUSE':
        return 'paused';
      
      case 'RESUME':
        return this.metadata.paused_from_state || 'idle';
      
      case 'CANCEL':
        return 'cancelled';
      
      default:
        return null;
    }
  }

  /**
   * Update metadata based on event
   */
  private updateMetadata(event: TransitionEvent, targetState: AgentState): void {
    switch (event.type) {
      case 'START':
        this.metadata.task_id = event.payload.task_id;
        break;
      
      case 'PLAN_COMPLETE':
        this.metadata.plan_id = event.payload.plan_id;
        break;
      
      case 'STEP_COMPLETE':
        this.metadata.current_step_id = event.payload.step_id;
        break;
      
      case 'STEP_FAILED':
        this.metadata.error = event.payload.error;
        break;
      
      case 'EVALUATION_PASS':
      case 'EVALUATION_FAIL':
        this.metadata.confidence = event.payload.confidence;
        break;
      
      case 'PAUSE':
        this.metadata.paused_from_state = this.state;
        break;
      
      case 'RESUME':
        delete this.metadata.paused_from_state;
        break;
    }
  }

  /**
   * Persist state to database
   */
  private async persistState(): Promise<void> {
    const stateData = {
      agent_name: this.config.agentName,
      user_id: this.config.userId,
      task_id: this.config.taskId,
      current_state: this.state,
      metadata: this.metadata,
      history: this.history.slice(-50), // Keep last 50 transitions
      updated_at: new Date(),
    };

    if (this.dbId) {
      await db
        .update(agentStates)
        .set(stateData)
        .where(eq(agentStates.id, this.dbId));
    } else {
      const [inserted] = await db
        .insert(agentStates)
        .values(stateData)
        .returning({ id: agentStates.id });
      this.dbId = inserted.id;
    }
  }

  /**
   * Emit state change event to message bus
   */
  private async emitStateChange(
    fromState: AgentState,
    toState: AgentState,
    event: TransitionEvent
  ): Promise<void> {
    // Only emit for significant state changes
    const significantStates: AgentState[] = ['succeeded', 'failed', 'waiting_input', 'waiting_agent'];
    
    if (significantStates.includes(toState)) {
      await publishAgentEvent({
        type: 'AGENT_STATE_CHANGED' as any, // Add to event types
        payload: {
          agent_name: this.config.agentName,
          user_id: this.config.userId,
          task_id: this.config.taskId,
          from_state: fromState,
          to_state: toState,
          trigger_event: event.type,
        },
      });
    }
  }

  /**
   * Load state from database (for crash recovery)
   */
  static async loadFromDb(
    agentName: string,
    taskId: string
  ): Promise<AgentStateMachine | null> {
    const record = await db.query.agentStates.findFirst({
      where: and(
        eq(agentStates.agent_name, agentName),
        eq(agentStates.task_id, taskId)
      ),
    });

    if (!record) return null;

    const machine = new AgentStateMachine({
      agentName,
      taskId,
      userId: record.user_id || undefined,
    });

    machine.dbId = record.id;
    machine.state = record.current_state as AgentState;
    machine.metadata = record.metadata as StateMetadata;
    machine.history = (record.history as StateHistoryEntry[]) || [];

    return machine;
  }

  /**
   * Check if agent is in a terminal state
   */
  isTerminal(): boolean {
    return ['succeeded', 'failed', 'cancelled'].includes(this.state);
  }

  /**
   * Check if agent is blocked
   */
  isBlocked(): boolean {
    return ['waiting_input', 'waiting_agent', 'paused'].includes(this.state);
  }

  /**
   * Get human-readable state description
   */
  getStateDescription(): string {
    const descriptions: Record<AgentState, string> = {
      idle: 'Agent is idle, waiting for a task',
      initializing: 'Loading context and preparing resources',
      planning: 'Analyzing goal and generating execution plan',
      executing: 'Running plan steps',
      evaluating: 'Assessing output quality',
      adapting: 'Modifying plan based on evaluation',
      waiting_input: `Waiting for external input${this.metadata.waiting_for ? `: ${this.metadata.waiting_for}` : ''}`,
      waiting_agent: `Waiting for agent: ${this.metadata.waiting_for || 'unknown'}`,
      succeeded: 'Task completed successfully',
      failed: `Task failed: ${this.metadata.error || 'unknown error'}`,
      paused: `Paused from state: ${this.metadata.paused_from_state || 'unknown'}`,
      cancelled: 'Task was cancelled',
    };
    return descriptions[this.state];
  }
}

// Factory function for creating state machines
export function createAgentStateMachine(config: AgentStateConfig): AgentStateMachine {
  return new AgentStateMachine(config);
}
```

---

## Database Schema

### File: `src/drizzle/schema/agent-states.ts`

```typescript
/**
 * Agent States Table
 * 
 * Tracks the current state and history of each agent execution.
 * Used for crash recovery, debugging, and coordination.
 */

import {
  pgTable,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './user';

// Agent state enum
export const agentStateEnum = pgEnum('agent_state', [
  'idle',
  'initializing',
  'planning',
  'executing',
  'evaluating',
  'adapting',
  'waiting_input',
  'waiting_agent',
  'succeeded',
  'failed',
  'paused',
  'cancelled',
]);

// Agent name enum
export const agentNameEnum = pgEnum('agent_name', [
  'interviewer',
  'sentinel',
  'architect',
  'action',
  'strategist',
  'coordinator',
  'planner',
]);

export const agentStates = pgTable(
  'agent_states',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Agent identification
    agent_name: agentNameEnum('agent_name').notNull(),
    
    // Associated user (optional - some agents are system-wide)
    user_id: varchar('user_id', { length: 255 }).references(() => users.clerk_id),
    
    // Task identification
    task_id: varchar('task_id', { length: 100 }),

    // Current state
    current_state: agentStateEnum('current_state').default('idle').notNull(),

    // State metadata (varies by state)
    metadata: jsonb('metadata').$type<{
      task_id?: string;
      plan_id?: string;
      current_step_id?: string;
      iteration?: number;
      confidence?: number;
      error?: string;
      waiting_for?: string;
      paused_from_state?: string;
      extra?: Record<string, unknown>;
    }>().default({}),

    // State history (last N transitions)
    history: jsonb('history').$type<Array<{
      from_state: string;
      to_state: string;
      event: { type: string; payload: Record<string, unknown> };
      timestamp: string;
      metadata?: Record<string, unknown>;
    }>>().default([]),

    // Timestamps
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // Find active agents for a user
    index('idx_agent_states_user').on(table.user_id, table.current_state),
    
    // Find agents by task
    index('idx_agent_states_task').on(table.task_id),
    
    // Find all agents in a specific state
    index('idx_agent_states_state').on(table.current_state),
    
    // Find blocked agents
    index('idx_agent_states_blocked').on(table.agent_name, table.current_state),
  ]
);

export type AgentStateRecord = typeof agentStates.$inferSelect;
export type NewAgentStateRecord = typeof agentStates.$inferInsert;
```

---

## Integration with Existing Code

### Modifying Agent Jobs to Use State Machine

```typescript
// src/trigger/jobs/interview-analyzer.ts

import { createAgentStateMachine, AgentStateMachine } from '@/lib/agents/core/agent-state';

export const interviewAnalyzer = task({
  id: 'interview.analyze',
  run: async (payload: InterviewAnalyzerPayload) => {
    const { event_id, interview_id, user_id } = payload;

    // Create or recover state machine
    let stateMachine = await AgentStateMachine.loadFromDb('interviewer', interview_id);
    
    if (!stateMachine) {
      stateMachine = createAgentStateMachine({
        agentName: 'interviewer',
        userId: user_id,
        taskId: interview_id,
      });
    }

    // Check if we're resuming from a crash
    if (stateMachine.isBlocked() || stateMachine.getState() === 'paused') {
      console.log(`Resuming from state: ${stateMachine.getState()}`);
    }

    try {
      // Start if idle
      if (stateMachine.getState() === 'idle') {
        await stateMachine.transition({
          type: 'START',
          payload: { task_id: interview_id },
        });
      }

      // Initialize
      await stateMachine.transition({
        type: 'INIT_COMPLETE',
        payload: { context_loaded: true },
      });

      // Generate plan
      const plan = await generateAnalysisPlan(interview_id, user_id);
      await stateMachine.transition({
        type: 'PLAN_COMPLETE',
        payload: { plan_id: plan.id, steps: plan.steps.length },
      });

      // Execute plan steps
      for (const step of plan.steps) {
        const stepResult = await executeStep(step);
        
        await stateMachine.transition({
          type: 'STEP_COMPLETE',
          payload: { step_id: step.id, output: stepResult },
        });

        // Evaluate
        const confidence = await evaluateOutput(stepResult);
        
        if (confidence >= 0.85) {
          await stateMachine.transition({
            type: 'EVALUATION_PASS',
            payload: { confidence },
          });
          break;
        } else {
          await stateMachine.transition({
            type: 'EVALUATION_FAIL',
            payload: { confidence, reason: 'Below threshold' },
          });
          
          // Adapt and continue
          plan = await adaptPlan(plan, stepResult);
          await stateMachine.transition({
            type: 'ADAPTATION_COMPLETE',
            payload: { new_plan_id: plan.id },
          });
        }
      }

      return {
        success: true,
        state: stateMachine.getState(),
        history: stateMachine.getHistory(),
      };

    } catch (error) {
      await stateMachine.transition({
        type: 'STEP_FAILED',
        payload: {
          step_id: stateMachine.getMetadata().current_step_id || 'unknown',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  },
});
```

### Querying Agent States (for Dashboard/Monitoring)

```typescript
// src/app/api/agents/status/route.ts

import { db } from '@/drizzle/db';
import { agentStates } from '@/drizzle/schema';
import { eq, and, inArray } from 'drizzle-orm';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  // Get all active agents for user
  const activeAgents = await db.query.agentStates.findMany({
    where: and(
      eq(agentStates.user_id, userId),
      inArray(agentStates.current_state, [
        'initializing', 'planning', 'executing', 
        'evaluating', 'adapting', 'waiting_input', 'waiting_agent'
      ])
    ),
  });

  return Response.json({
    agents: activeAgents.map(a => ({
      name: a.agent_name,
      state: a.current_state,
      task: a.task_id,
      metadata: a.metadata,
    })),
  });
}
```

---

## State Visualization

### Dashboard Component

```typescript
// src/components/dashboard/agent-status-card.tsx

'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const STATE_COLORS: Record<string, string> = {
  idle: 'bg-gray-500',
  initializing: 'bg-blue-500',
  planning: 'bg-purple-500',
  executing: 'bg-yellow-500',
  evaluating: 'bg-orange-500',
  adapting: 'bg-pink-500',
  waiting_input: 'bg-cyan-500',
  waiting_agent: 'bg-indigo-500',
  succeeded: 'bg-green-500',
  failed: 'bg-red-500',
  paused: 'bg-gray-400',
  cancelled: 'bg-gray-600',
};

export function AgentStatusCard() {
  const { data: agents } = useQuery({
    queryKey: ['agent-status'],
    queryFn: () => fetch('/api/agents/status').then(r => r.json()),
    refetchInterval: 5000, // Poll every 5 seconds
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {agents?.agents.map((agent: any) => (
            <div key={agent.name} className="flex items-center justify-between">
              <span className="font-medium capitalize">{agent.name}</span>
              <Badge className={STATE_COLORS[agent.state]}>
                {agent.state.replace('_', ' ')}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Next Document

Continue to **04-AGENT_MEMORY_SYSTEM.md** for implementing knowledge accumulation.

---

**Document Status:** Draft
**Dependencies:** 01, 02
**Next:** 04-AGENT_MEMORY_SYSTEM.md
