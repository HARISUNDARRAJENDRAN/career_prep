/**
 * Resume Architect Agent Barrel Export
 *
 * @see PHASE_6_AUTORESUME_PLAN.md - Milestone 2
 */

export {
  ResumeArchitectAgent,
  createResumeArchitectAgent,
  tailorResume,
  analyzeJobForResume,
  generateResume,
  type ResumeTailoringContext,
  type BatchTailoringContext,
  type ResumeReviewContext,
  type ResumeTailoringOutput,
  type JobAnalysisOutput,
  type ResumeArchitectConfig,
  type ResumeArchitectResult,
} from './resume-architect-agent';

export {
  registerResumeArchitectTools,
  getResumeArchitectToolIds,
} from './resume-tools';

export {
  RESUME_PROMPTS,
  buildJobAnalysisPrompt,
  buildResumeTailoringPrompt,
  buildBulletOptimizationPrompt,
  buildSummaryGenerationPrompt,
  buildSkillsSectionPrompt,
} from './resume-prompts';
