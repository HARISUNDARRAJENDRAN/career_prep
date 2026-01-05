/**
 * Agents Module - Agent Implementations
 *
 * Exports all agent implementations.
 *
 * @see docs/agentic-improvements/08-PILOT_INTERVIEW_AGENT.md
 */

// Interviewer Agent (Pilot Implementation)
export {
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
} from './interviewer';

// Sentinel Agent (Market Intelligence)
export {
  SentinelAgent,
  createSentinelAgent,
  SENTINEL_PROMPTS,
  registerSentinelTools,
  getSentinelToolIds,
  type SentinelAgentConfig,
  type SentinelResult,
} from './sentinel';

// Architect Agent (Roadmap Generation)
export {
  ArchitectAgent,
  createArchitectAgent,
  generateRoadmap,
  repathRoadmap,
  evaluateProgress,
  ARCHITECT_PROMPTS,
  registerArchitectTools,
  getArchitectToolIds,
  type ArchitectAgentConfig,
  type ArchitectResult,
  type RoadmapGenerationContext,
  type RepathContext,
  type ProgressEvaluationContext,
  type RoadmapGenerationOutput,
  type RepathOutput,
  type ProgressOutput,
} from './architect';

// Action Agent (Auto-Applier)
export {
  ActionAgent,
  createApplicationAgent,
  createBatchApplicationAgent,
  createFollowUpAgent,
  createPrioritizationAgent,
  ACTION_PROMPTS,
  registerActionTools,
  getActionToolIds,
  type ActionAgentConfig,
  type ActionResult,
} from './action';
