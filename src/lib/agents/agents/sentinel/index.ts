/**
 * Sentinel Agent Barrel Export
 */

export {
  SentinelAgent,
  createSentinelAgent,
  scrapeMarket,
  matchJobsForUser,
  type MarketScrapeContext,
  type JobMatchContext,
  type MarketScrapeOutput,
  type JobMatchOutput,
  type SentinelAgentConfig,
  type SentinelResult,
} from './sentinel-agent';

export {
  registerSentinelTools,
  getSentinelToolIds,
} from './sentinel-tools';

export {
  SENTINEL_PROMPTS,
  buildSkillExtractionPrompt,
  buildMarketAnalysisPrompt,
  buildJobMatchingPrompt,
  buildGitHubCorrelationPrompt,
} from './sentinel-prompts';
