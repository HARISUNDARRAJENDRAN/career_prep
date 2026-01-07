/**
 * Trigger.dev Jobs Index
 *
 * This file exports all background job definitions for Trigger.dev.
 * Each job corresponds to an agent event handler.
 *
 * Job Naming Convention:
 * - {agent}.{action} - e.g., 'interview.analyze', 'architect.repath-roadmap'
 *
 * Priority Queues:
 * - high-priority: User-facing, real-time expectations
 * - default: System-triggered, moderate urgency
 * - low-priority: Background processing, bulk operations
 */

// Interviewer Agent Jobs
export { interviewAnalyzer } from './interview-analyzer';

// Architect Agent Jobs (Legacy)
export { initialRoadmapGenerator } from './initial-roadmap';
export { roadmapRepather } from './roadmap-repather';
export { skillStatusUpdater, marketRepathCheck } from './skill-updater';

// Sentinel Agent Jobs (Legacy)
export { marketScraper, marketCleanup, dailyMarketScraper } from './market-scraper';

// Action Agent Jobs (Legacy)
export { autoApplier, executeApply } from './auto-applier';
export { embedResumeJob, reEmbedResumeJob } from './embed-resume';
export { embedInterviewJob, reEmbedInterviewsJob } from './embed-interview';

// ============================================================================
// Autonomous Agent Jobs (Phase 5)
// ============================================================================

// Autonomous Sentinel Agent
export {
  dailyMarketScraper as autonomousMarketScraper,
  dailyMarketScraperSchedule,
  matchJobsForUser,
  batchMatchAllUsers,
} from './autonomous-market-scraper';

// Autonomous Architect Agent
export {
  generateInitialRoadmap,
  repathRoadmapTask,
  evaluateProgressTask,
  handleOnboardingCompleted,
} from './autonomous-roadmap';

// Autonomous Action Agent
export {
  applyToJob,
  batchApply,
  analyzeFollowUps,
  prioritizeJobs,
  handleJobMatchFound,
} from './autonomous-auto-applier';


// Strategist Agent Jobs
export { rejectionParser, trackApplication } from './rejection-parser';
export { strategistGlobalListener } from './strategist-listener';

// ============================================================================
// Phase 6: Autonomous Career Management
// ============================================================================

// Weekly Career Sprint (Strategist Orchestration)
export {
  weeklyCareerSprint,
  runUserSprintTask,
  dailyGhostingCheck,
  weeklyRejectionAnalysis,
} from './weekly-career-sprint';

// Email Monitoring (Phase 2)
export { emailMonitoringTask } from './email-monitoring';
