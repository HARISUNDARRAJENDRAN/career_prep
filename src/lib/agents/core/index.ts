/**
 * Agent Core Module
 *
 * Exports all core autonomous agent components.
 */

// State Machine
export {
  AgentStateMachine,
  createStateMachine,
  loadStateMachine,
  getActiveStates,
  type TransitionEvent,
  type TransitionEventType,
  type StateContext,
  type TransitionResult,
  type StateMachineConfig,
} from './agent-state';

// Memory Manager
export {
  AgentMemoryManager,
  createMemoryManager,
  type MemoryManagerConfig,
  type EpisodeContext,
  type EpisodeOutcome,
  type RetrievalOptions,
  type MemoryEvidence,
} from './agent-memory';

// Base Agent
export {
  BaseAutonomousAgent,
  createId,
  type AgentConfig,
  type AgentProgress,
  type AgentResult,
  type PlanStep,
  type Plan,
} from './base-agent';

// Agent Coordinator
export {
  AgentCoordinator,
  agentCoordinator,
  defineWorkflow,
  defineStep,
  type AgentName,
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowContext,
  type WorkflowExecutionResult,
  type StepResult,
  type ActionHandler,
} from './agent-coordinator';