/**
 * Agents Module - Main Barrel Export
 *
 * This module provides the complete autonomous agent framework for Career Prep.
 *
 * Architecture Overview:
 * - Core: State machine, memory manager, base agent, coordinator
 * - Reasoning: Goal decomposition, planning, scoring, iteration
 * - Tools: Registry, selector, executor
 * - Agents: Interviewer (pilot), and future agent implementations
 *
 * @see docs/agentic-improvements/01-AGENTIC_ARCHITECTURE_OVERVIEW.md
 */

// ============================================================================
// Core Components
// ============================================================================

export {
  // State Machine
  AgentStateMachine,
  createStateMachine,
  loadStateMachine,
  getActiveStates,
  type TransitionEvent,
  type TransitionEventType,
  type StateContext,
  type TransitionResult,
  type StateMachineConfig,
  // Memory Manager
  AgentMemoryManager,
  createMemoryManager,
  type MemoryManagerConfig,
  type EpisodeContext,
  type EpisodeOutcome,
  type RetrievalOptions,
  type MemoryEvidence,
  // Base Agent
  BaseAutonomousAgent,
  createId,
  type AgentConfig,
  type AgentProgress,
  type AgentResult,
  type PlanStep,
  type Plan,
  // Agent Coordinator
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
} from './core';

// ============================================================================
// Reasoning Layer
// ============================================================================

export {
  // Goal Decomposer
  GoalDecomposer,
  createGoalDecomposer,
  type Goal,
  type SubGoal,
  type GoalDecomposerConfig,
  type DecompositionContext,
  // Plan Generator
  PlanGenerator,
  createPlanGenerator,
  type Plan as ReasoningPlan,
  type PlanStep as ReasoningPlanStep,
  type ExecutionFeedback,
  type PlanGeneratorConfig,
  type PlanContext,
  // Confidence Scorer
  ConfidenceScorer,
  createConfidenceScorer,
  type ConfidenceAssessment,
  type CriterionScore,
  type EvaluationCriteria,
  type ConfidenceScorerConfig,
  type ScoringContext,
  // Iteration Controller
  IterationController,
  createIterationController,
  createTerminationConditions,
  type IterationState,
  type IterationResult,
  type IterationLoopResult,
  type TerminationConditions,
  type IterationControllerConfig,
} from './reasoning';

// ============================================================================
// Tools Module
// ============================================================================

export {
  // Tool Registry
  ToolRegistry,
  toolRegistry,
  defineTool,
  registerTool,
  type ToolCategory,
  type ToolDefinition,
  type ToolCost,
  type ToolRateLimit,
  type ToolExample,
  type ToolHandler,
  type ToolSearchResult,
  type ToolExecutionResult,
  // Tool Selector
  ToolSelector,
  createToolSelector,
  type ToolSelectionContext,
  type ToolSelectionResult,
  type SelectedTool,
  type ToolSelectorConfig,
  // Tool Executor
  ToolExecutor,
  createToolExecutor,
  type ExecutionOptions,
  type ExecutionResult,
  type ExecutionLog,
  type ToolExecutorConfig,
} from './tools';

// ============================================================================
// Agent Implementations
// ============================================================================

export {
  // Interviewer Agent (Pilot)
  InterviewerAgent,
  createInterviewerAgent,
  analyzeInterview,
  INTERVIEWER_PROMPTS,
  buildPrompt,
  registerInterviewerTools,
  getInterviewerToolIds,
  type InterviewContext,
  type AnalysisOutput,
  type AnalysisResult,
  type InterviewerAgentConfig,
} from './agents';

// ============================================================================
// Existing Infrastructure (Message Bus & Events)
// ============================================================================

export {
  publishAgentEvent,
  shouldSkipEvent,
  markEventProcessing,
  markEventCompleted,
  markEventFailed,
  incrementRetryCount,
  type PublishResult,
  type IdempotencyCheckResult,
} from './message-bus';

export {
  type AgentEventUnion,
  EVENT_SOURCE_AGENTS,
  EVENT_TARGET_AGENTS,
  EVENT_PRIORITIES,
  EVENT_JOB_IDS,
  getQueueForEvent,
} from './events';
