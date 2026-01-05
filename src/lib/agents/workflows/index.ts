/**
 * Workflows Module - Public Exports
 */

export {
  WorkflowOrchestrator,
  workflowOrchestrator,
  INTERVIEW_FEEDBACK_WORKFLOW,
  DAILY_CAREER_PIPELINE,
  ONBOARDING_WORKFLOW,
  WEEKLY_PROGRESS_WORKFLOW,
  type WorkflowStep,
  type WorkflowDefinition,
  type WorkflowExecution,
  type ParallelGroup,
  type StepResult,
  type WorkflowError,
  type AgentType,
  type AgentFactory,
  type AgentInstance,
} from './workflow-orchestrator';

export {
  fanOutFanIn,
  aggregate,
  pipeline,
  scatterGather,
  saga,
  AggregationStrategies,
  fanOutJobMatching,
  fanOutSkillExtraction,
  interviewAnalysisPipeline,
  multiSourceJobScrape,
  processBatches,
  type FanOutConfig,
  type FanOutResult,
  type AggregationStrategy,
  type PipelineStage,
  type SagaStep,
  type ScatterGatherConfig,
} from './workflow-patterns';

export {
  ConflictResolver,
  conflictResolver,
  type ConflictType,
  type ConflictItem,
  type Conflict,
  type Resolution,
  type ResolutionStrategy,
  type ResolutionRule,
  type ConflictResolverConfig,
} from './conflict-resolver';
