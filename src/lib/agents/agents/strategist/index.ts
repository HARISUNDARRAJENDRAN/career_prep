/**
 * Strategist Agent Barrel Export
 *
 * Strategic oversight agent that:
 * 1. Monitors all agent events globally
 * 2. Detects cross-domain patterns (skill gaps, declining performance, etc.)
 * 3. Triggers interventions (roadmap repaths, notifications, strategy adjustments)
 * 4. Tracks career velocity and progress
 *
 * @see docs/agentic-improvements/09-STRATEGIST_AGENT.md
 */

export {
  StrategistAgent,
  createStrategistAgent,
  analyzeCareerProgress,
  processStrategicEvent,
  type StrategistContext,
  type StrategistOutput,
  type StrategistAgentConfig,
  type StrategistResult,
  type StrategicRecommendation,
  type VelocityMetrics,
  type InterventionDecision,
} from './strategist-agent';

export {
  registerStrategistTools,
  getStrategistToolIds,
} from './strategist-tools';

export {
  STRATEGIST_PROMPTS,
  buildRejectionAnalysisPrompt,
  buildPatternDetectionPrompt,
  buildRecommendationPrompt,
} from './strategist-prompts';

export {
  PatternDetector,
  createPatternDetector,
  type SkillGapCluster,
  type TrendAnalysis,
  type MilestoneDetection,
  type PatternMatch,
} from './pattern-detector';

export {
  RejectionAnalyzer,
  createRejectionAnalyzer,
  type RejectionAnalysis,
  type SkillGap,
} from './rejection-analyzer';

export {
  VelocityTracker,
  createVelocityTracker,
  type VelocityReport,
  type VelocityTrend,
  type PeriodMetrics,
} from './velocity-tracker';
