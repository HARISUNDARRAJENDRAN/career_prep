/**
 * Agent State Machine
 *
 * Manages agent states and transitions with validation.
 * Persists state to database for crash recovery.
 * Emits state change events for monitoring.
 *
 * @see docs/agentic-improvements/03-AGENT_STATE_MACHINE.md
 */

import { db } from '@/drizzle/db';
import {
  agentStates,
  agentStateTransitions,
  type AgentState,
  type StateAgentName,
} from '@/drizzle/schema';
import { eq, and, sql } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

/**
 * Transition event types that trigger state changes
 */
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
  | { type: 'RESUME'; payload: Record<string, never> }
  | { type: 'CANCEL'; payload: { reason: string } }
  | { type: 'RESET'; payload: Record<string, never> };

export type TransitionEventType = TransitionEvent['type'];

/**
 * State context for persisting agent state
 */
export interface StateContext {
  plan_id?: string;
  current_step_id?: string;
  iteration?: number;
  waiting_for?: {
    type: 'input' | 'agent' | 'api';
    identifier: string;
    timeout_at?: string;
  };
  last_error?: string;
  resume_data?: Record<string, unknown>;
}

/**
 * Result of a state transition
 */
export interface TransitionResult {
  success: boolean;
  from_state: AgentState;
  to_state: AgentState;
  transition_id?: string;
  error?: string;
}

/**
 * Configuration for the state machine
 */
export interface StateMachineConfig {
  agent_name: StateAgentName;
  task_id: string;
  user_id?: string;
  on_transition?: (result: TransitionResult) => void | Promise<void>;
}

// ============================================================================
// State Transition Matrix
// ============================================================================

/**
 * Valid state transitions
 * Key: current state, Value: array of valid next states
 */
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

/**
 * Map events to target states based on current state
 */
const EVENT_TRANSITIONS: Record<TransitionEventType, Partial<Record<AgentState, AgentState>>> = {
  START: { idle: 'initializing' },
  INIT_COMPLETE: { initializing: 'planning' },
  PLAN_COMPLETE: { planning: 'executing' },
  STEP_COMPLETE: { executing: 'evaluating' },
  STEP_FAILED: {
    executing: 'failed', // Will check retry logic
    evaluating: 'adapting',
  },
  EVALUATION_PASS: { evaluating: 'succeeded' },
  EVALUATION_FAIL: { evaluating: 'adapting' },
  ADAPTATION_COMPLETE: { adapting: 'executing' },
  INPUT_RECEIVED: { waiting_input: 'executing' },
  AGENT_COMPLETE: { waiting_agent: 'executing' },
  TIMEOUT: {
    waiting_input: 'failed',
    waiting_agent: 'failed',
    executing: 'failed',
  },
  MAX_ITERATIONS: { adapting: 'failed' },
  PAUSE: {
    initializing: 'paused',
    planning: 'paused',
    executing: 'paused',
    evaluating: 'paused',
    adapting: 'paused',
    waiting_input: 'paused',
    waiting_agent: 'paused',
  },
  RESUME: {}, // Special case: returns to previous state
  CANCEL: {
    initializing: 'cancelled',
    planning: 'cancelled',
    executing: 'cancelled',
    evaluating: 'cancelled',
    adapting: 'cancelled',
    waiting_input: 'cancelled',
    waiting_agent: 'cancelled',
    paused: 'cancelled',
  },
  RESET: {
    succeeded: 'idle',
    failed: 'idle',
    cancelled: 'idle',
  },
};

// ============================================================================
// Agent State Machine Class
// ============================================================================

/**
 * AgentStateMachine manages state transitions for autonomous agents
 */
export class AgentStateMachine {
  private agent_name: StateAgentName;
  private task_id: string;
  private user_id?: string;
  private current_state: AgentState = 'idle';
  private previous_state?: AgentState;
  private state_id?: string;
  private state_context: StateContext = {};
  private state_entered_at: Date = new Date();
  private on_transition?: (result: TransitionResult) => void | Promise<void>;

  constructor(config: StateMachineConfig) {
    this.agent_name = config.agent_name;
    this.task_id = config.task_id;
    this.user_id = config.user_id;
    this.on_transition = config.on_transition;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Initialize the state machine, loading existing state or creating new
   */
  async initialize(): Promise<void> {
    // Try to load existing state from database
    const existingState = await db.query.agentStates.findFirst({
      where: and(
        eq(agentStates.agent_name, this.agent_name),
        eq(agentStates.task_id, this.task_id),
        this.user_id ? eq(agentStates.user_id, this.user_id) : undefined
      ),
    });

    if (existingState) {
      // Resume from existing state
      this.state_id = existingState.id;
      this.current_state = existingState.current_state;
      this.previous_state = existingState.previous_state || undefined;
      this.state_context = (existingState.state_context as StateContext) || {};
      this.state_entered_at = existingState.state_entered_at;
      console.log(`[StateMachine] Resumed from state: ${this.current_state}`);
    } else {
      // Create new state record
      const [newState] = await db
        .insert(agentStates)
        .values({
          agent_name: this.agent_name,
          task_id: this.task_id,
          user_id: this.user_id,
          current_state: 'idle',
          state_context: {},
        })
        .returning();

      this.state_id = newState.id;
      console.log(`[StateMachine] Created new state: idle`);
    }
  }

  /**
   * Process an event and transition to a new state
   */
  async transition(event: TransitionEvent): Promise<TransitionResult> {
    const from_state = this.current_state;

    // Determine target state from event
    let to_state: AgentState | undefined;

    if (event.type === 'RESUME') {
      // Special case: resume to previous state
      if (this.current_state !== 'paused' || !this.previous_state) {
        return {
          success: false,
          from_state,
          to_state: from_state,
          error: 'Can only RESUME from paused state with valid previous state',
        };
      }
      to_state = this.previous_state;
    } else {
      to_state = EVENT_TRANSITIONS[event.type]?.[this.current_state];
    }

    // Validate transition
    if (!to_state) {
      return {
        success: false,
        from_state,
        to_state: from_state,
        error: `Invalid event ${event.type} for state ${this.current_state}`,
      };
    }

    if (!this.isValidTransition(from_state, to_state)) {
      return {
        success: false,
        from_state,
        to_state,
        error: `Invalid transition from ${from_state} to ${to_state}`,
      };
    }

    // Calculate duration in previous state
    const duration_ms = Date.now() - this.state_entered_at.getTime();

    // Update internal state
    this.previous_state = from_state;
    this.current_state = to_state;
    this.state_entered_at = new Date();

    // Update context based on event
    this.updateContextFromEvent(event);

    // Persist to database
    await this.persistState();

    // Log transition
    const transition_id = await this.logTransition(from_state, to_state, event, duration_ms);

    const result: TransitionResult = {
      success: true,
      from_state,
      to_state,
      transition_id,
    };

    // Call transition callback
    if (this.on_transition) {
      await this.on_transition(result);
    }

    console.log(`[StateMachine] ${from_state} → ${to_state} (event: ${event.type})`);

    return result;
  }

  /**
   * Get current state
   */
  getState(): AgentState {
    return this.current_state;
  }

  /**
   * Get state context
   */
  getContext(): StateContext {
    return { ...this.state_context };
  }

  /**
   * Update state context without changing state
   */
  async updateContext(context: Partial<StateContext>): Promise<void> {
    this.state_context = { ...this.state_context, ...context };
    await this.persistState();
  }

  /**
   * Check if agent is in a terminal state
   */
  isTerminal(): boolean {
    return ['succeeded', 'failed', 'cancelled'].includes(this.current_state);
  }

  /**
   * Check if agent is active (not idle or terminal)
   */
  isActive(): boolean {
    return !['idle', 'succeeded', 'failed', 'cancelled'].includes(this.current_state);
  }

  /**
   * Check if agent is waiting for something
   */
  isWaiting(): boolean {
    return ['waiting_input', 'waiting_agent'].includes(this.current_state);
  }

  /**
   * Get time spent in current state
   */
  getTimeInCurrentState(): number {
    return Date.now() - this.state_entered_at.getTime();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private isValidTransition(from: AgentState, to: AgentState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  private updateContextFromEvent(event: TransitionEvent): void {
    switch (event.type) {
      case 'PLAN_COMPLETE':
        this.state_context.plan_id = event.payload.plan_id;
        break;
      case 'STEP_COMPLETE':
      case 'STEP_FAILED':
        this.state_context.current_step_id = event.payload.step_id;
        if (event.type === 'STEP_FAILED') {
          this.state_context.last_error = event.payload.error;
        }
        break;
      case 'ADAPTATION_COMPLETE':
        this.state_context.plan_id = event.payload.new_plan_id;
        this.state_context.iteration = (this.state_context.iteration || 0) + 1;
        break;
      case 'PAUSE':
        this.state_context.resume_data = {
          previous_state: this.previous_state,
          context_snapshot: { ...this.state_context },
        };
        break;
      case 'RESUME':
        // Restore context if needed
        break;
    }
  }

  private async persistState(): Promise<void> {
    if (!this.state_id) return;

    await db
      .update(agentStates)
      .set({
        current_state: this.current_state,
        previous_state: this.previous_state,
        state_context: this.state_context,
        state_entered_at: this.state_entered_at,
        last_transition_at: new Date(),
        total_transitions: sql`total_transitions + 1`,
        updated_at: new Date(),
      })
      .where(eq(agentStates.id, this.state_id));
  }

  private async logTransition(
    from_state: AgentState,
    to_state: AgentState,
    event: TransitionEvent,
    duration_ms: number
  ): Promise<string> {
    if (!this.state_id) return '';

    const [transition] = await db
      .insert(agentStateTransitions)
      .values({
        agent_state_id: this.state_id,
        agent_name: this.agent_name,
        task_id: this.task_id,
        from_state,
        to_state,
        transition_event: event.type,
        event_payload: event.payload,
        duration_ms,
      })
      .returning({ id: agentStateTransitions.id });

    return transition.id;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new state machine for an agent
 */
export async function createStateMachine(
  config: StateMachineConfig
): Promise<AgentStateMachine> {
  const machine = new AgentStateMachine(config);
  await machine.initialize();
  return machine;
}

/**
 * Load an existing state machine by task ID
 */
export async function loadStateMachine(
  agent_name: StateAgentName,
  task_id: string,
  user_id?: string
): Promise<AgentStateMachine | null> {
  const existingState = await db.query.agentStates.findFirst({
    where: and(
      eq(agentStates.agent_name, agent_name),
      eq(agentStates.task_id, task_id),
      user_id ? eq(agentStates.user_id, user_id) : undefined
    ),
  });

  if (!existingState) return null;

  const machine = new AgentStateMachine({
    agent_name,
    task_id,
    user_id,
  });
  await machine.initialize();

  return machine;
}

/**
 * Get all active state machines for an agent
 */
export async function getActiveStates(
  agent_name: StateAgentName
): Promise<{ task_id: string; state: AgentState; entered_at: Date }[]> {
  const activeStates = await db.query.agentStates.findMany({
    where: and(eq(agentStates.agent_name, agent_name)),
  });

  return activeStates
    .filter(
      (s) => !['idle', 'succeeded', 'failed', 'cancelled'].includes(s.current_state)
    )
    .map((s) => ({
      task_id: s.task_id,
      state: s.current_state,
      entered_at: s.state_entered_at,
    }));
}
