/**
 * Architect Agent Barrel Export
 */

export {
  ArchitectAgent,
  createArchitectAgent,
  generateRoadmap,
  repathRoadmap,
  evaluateProgress,
  type RoadmapGenerationContext,
  type RepathContext,
  type ProgressEvaluationContext,
  type RoadmapGenerationOutput,
  type RepathOutput,
  type ProgressOutput,
  type ArchitectAgentConfig,
  type ArchitectResult,
} from './architect-agent';

export {
  registerArchitectTools,
  getArchitectToolIds,
} from './architect-tools';

export {
  ARCHITECT_PROMPTS,
  buildRoadmapGenerationPrompt,
  buildSkillGapAnalysisPrompt,
  buildRepathingPrompt,
  buildModuleGenerationPrompt,
  buildProgressEvaluationPrompt,
} from './architect-prompts';
