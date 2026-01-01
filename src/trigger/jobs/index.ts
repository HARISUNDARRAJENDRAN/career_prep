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

// Architect Agent Jobs
export { initialRoadmapGenerator } from './initial-roadmap';
export { roadmapRepather } from './roadmap-repather';
export { skillStatusUpdater, marketRepathCheck } from './skill-updater';

// Sentinel Agent Jobs
export { marketScraper, marketCleanup } from './market-scraper';

// Action Agent Jobs
export { autoApplier, executeApply } from './auto-applier';

// Strategist Agent Jobs
export { rejectionParser, trackApplication } from './rejection-parser';
export { strategistGlobalListener } from './strategist-listener';
