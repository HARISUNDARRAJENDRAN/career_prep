/**
 * Job Scraper Service - Sentinel Agent
 *
 * This service powers the market intelligence capabilities of the Sentinel Agent.
 * It scrapes job listings from multiple sources, normalizes them, and provides
 * intelligent matching and analysis.
 *
 * Architecture:
 * - Jooble & Adzuna APIs for job data
 * - AI-powered skill extraction
 * - Intelligent job matching with scoring
 * - Market trend analysis
 */

// Types
export type {
  JoobleJob,
  JoobleResponse,
  JoobleSearchParams,
  AdzunaJob,
  AdzunaResponse,
  AdzunaSearchParams,
  NormalizedJob,
  JobSource,
  JobType,
  RemoteType,
  SkillDemand,
  MarketInsightsData,
  JobMatchResult,
  UserSkillProfile,
} from './types';

// API Clients
export { scrapeJooble, isJoobleConfigured } from './jooble';
export { scrapeAdzuna, isAdzunaConfigured } from './adzuna';

// Normalizer & Skill Extraction
export {
  normalizeJoobleJob,
  normalizeAdzunaJob,
  deduplicateJobs,
  extractSkillsBasic,
  extractSkillsWithAI,
  batchExtractSkillsWithAI,
} from './normalizer';

// Market Analysis
export {
  generateMarketInsights,
  generateMarketAnalysisWithAI,
  detectMarketShifts,
} from './market-analyzer';

// Job Matching
export {
  matchUserToJobs,
  calculateJobMatch,
  explainMatchWithAI,
  findBestMatchesWithExplanations,
} from './job-matcher';

/**
 * Check if any job scraping API is configured
 */
export function isJobScrapingConfigured(): boolean {
  return !!(
    process.env.JOOBLE_API_KEY ||
    (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY)
  );
}

/**
 * Get status of all API configurations
 */
export function getAPIStatus(): {
  jooble: boolean;
  adzuna: boolean;
  openai: boolean;
} {
  return {
    jooble: !!process.env.JOOBLE_API_KEY,
    adzuna: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
    openai: !!process.env.OPENAI_API_KEY,
  };
}
