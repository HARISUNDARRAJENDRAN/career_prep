/**
 * Market Scraper Job - Sentinel Agent
 *
 * This is the core of the Sentinel Agent - it autonomously scrapes job listings,
 * analyzes market trends, and matches users to opportunities.
 *
 * Triggered: Daily via cron schedule (2 AM UTC)
 * Purpose: Scrape job listings from Jooble and Adzuna APIs
 *
 * Agentic Features:
 * - AI-powered skill extraction from job descriptions
 * - Intelligent job matching with scoring algorithm
 * - Market trend detection and analysis
 * - Autonomous roadmap re-pathing triggers on market shifts
 *
 * Flow:
 * 1. Scrape Jooble API for job listings
 * 2. Scrape Adzuna API for job listings
 * 3. Deduplicate and normalize listings
 * 4. Extract skills using AI (for high-value jobs)
 * 5. Bulk upsert to job_listings table
 * 6. Generate market insights with trend detection
 * 7. Find job matches for all active users
 * 8. Publish MARKET_UPDATE and JOB_MATCH_FOUND events
 */

import { task, schedules } from '@trigger.dev/sdk';
import { db } from '@/drizzle/db';
import { jobListings, marketInsights, users, userSkills, userProfiles } from '@/drizzle/schema';
import { eq, and, sql, desc, lt } from 'drizzle-orm';
import { publishAgentEvent } from '@/lib/agents/message-bus';

import {
  scrapeJooble,
  scrapeAdzuna,
  normalizeJoobleJob,
  normalizeAdzunaJob,
  deduplicateJobs,
  generateMarketInsights,
  detectMarketShifts,
  matchUserToJobs,
  isJobScrapingConfigured,
  getAPIStatus,
  type NormalizedJob,
  type MarketInsightsData,
  type UserSkillProfile,
} from '@/services/job-scraper';

import {
  isGitHubConfigured,
  fetchGitHubVelocityReport,
  correlateWithJobMarket,
  type GitHubVelocityReport,
  type TechVelocity,
} from '@/services/github-velocity';

import { createJobMatchNotification } from '@/services/notifications';

// ============================================================================
// Configuration
// ============================================================================

// Keywords to search for across job boards
const SEARCH_KEYWORDS = [
  'software engineer',
  'frontend developer',
  'backend developer',
  'full stack developer',
  'data scientist',
  'machine learning engineer',
  'devops engineer',
  'cloud engineer',
  'react developer',
  'python developer',
  'node.js developer',
  'java developer',
  'data engineer',
  'product manager',
];

// Minimum match score to trigger JOB_MATCH_FOUND event
const MIN_MATCH_SCORE_FOR_EVENT = 60;

// Maximum jobs to process with AI skill extraction
const MAX_AI_EXTRACTION_JOBS = 100;

// ============================================================================
// Scheduled Task - Daily Market Scraper
// ============================================================================

/**
 * Daily Market Scraper - Runs at 2 AM UTC
 *
 * This is the main scheduled job that keeps the market intelligence up to date.
 */
export const dailyMarketScraper = schedules.task({
  id: 'market.scrape.daily',
  cron: '0 2 * * *', // 2:00 AM UTC daily
  run: async (payload) => {
    console.log('='.repeat(70));
    console.log('[Sentinel Agent] Daily Market Scrape Starting');
    console.log(`  Scheduled Time: ${payload.timestamp}`);
    console.log(`  Last Run: ${payload.lastTimestamp || 'First run'}`);
    console.log('='.repeat(70));

    return await runMarketScraper({ isScheduled: true });
  },
});

/**
 * Manual Market Scraper - Can be triggered on demand
 *
 * Use this for testing or when you need an immediate market update.
 */
export const marketScraper = task({
  id: 'market.scrape',
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
  },
  run: async (payload: { force?: boolean } = {}) => {
    console.log('[Sentinel Agent] Manual market scrape triggered');
    return await runMarketScraper({ isScheduled: false, force: payload.force });
  },
});

// ============================================================================
// Core Scraping Logic
// ============================================================================

interface ScrapeResult {
  success: boolean;
  jobs_scraped: number;
  jobs_inserted: number;
  jobs_updated: number;
  insights_generated: boolean;
  matches_found: number;
  market_shifts_detected: boolean;
  github_velocity_fetched: boolean;
  tech_trends: number;
  duration_seconds: number;
  api_status: { jooble: boolean; adzuna: boolean; openai: boolean; github: boolean };
  error?: string;
}

async function runMarketScraper(options: {
  isScheduled?: boolean;
  force?: boolean;
}): Promise<ScrapeResult> {
  const startTime = Date.now();
  const apiStatus = { ...getAPIStatus(), github: isGitHubConfigured() };

  // Check if any API is configured
  if (!isJobScrapingConfigured()) {
    console.warn('[Sentinel Agent] No job scraping APIs configured');
    console.log('  Configure JOOBLE_API_KEY or ADZUNA_APP_ID/ADZUNA_APP_KEY');
    return {
      success: false,
      jobs_scraped: 0,
      jobs_inserted: 0,
      jobs_updated: 0,
      insights_generated: false,
      matches_found: 0,
      market_shifts_detected: false,
      github_velocity_fetched: false,
      tech_trends: 0,
      duration_seconds: 0,
      api_status: apiStatus,
      error: 'No job scraping APIs configured',
    };
  }

  try {
    // =========================================================================
    // Step 1: Scrape Jooble API
    // =========================================================================
    console.log('\n[Step 1/7] Scraping Jooble...');

    const joobleJobs = await scrapeJooble({
      keywords: SEARCH_KEYWORDS,
      location: 'United States',
      maxPages: 2, // Limit pages to stay within rate limits
    });

    console.log(`  Fetched ${joobleJobs.length} jobs from Jooble`);

    // =========================================================================
    // Step 2: Scrape Adzuna API
    // =========================================================================
    console.log('\n[Step 2/7] Scraping Adzuna...');

    const adzunaJobs = await scrapeAdzuna({
      keywords: SEARCH_KEYWORDS,
      country: 'us',
      maxPages: 2,
    });

    console.log(`  Fetched ${adzunaJobs.length} jobs from Adzuna`);

    // =========================================================================
    // Step 3: Normalize and Deduplicate
    // =========================================================================
    console.log('\n[Step 3/7] Normalizing and deduplicating...');

    const normalizedJooble = joobleJobs.map(normalizeJoobleJob);
    const normalizedAdzuna = adzunaJobs.map(normalizeAdzunaJob);
    const allJobs = deduplicateJobs([...normalizedJooble, ...normalizedAdzuna]);

    console.log(`  ${allJobs.length} unique jobs after deduplication`);
    console.log(`    - From Jooble: ${normalizedJooble.length}`);
    console.log(`    - From Adzuna: ${normalizedAdzuna.length}`);

    if (allJobs.length === 0) {
      console.warn('[Sentinel Agent] No jobs scraped - check API configurations');
      return {
        success: true,
        jobs_scraped: 0,
        jobs_inserted: 0,
        jobs_updated: 0,
        insights_generated: false,
        matches_found: 0,
        market_shifts_detected: false,
        github_velocity_fetched: false,
        tech_trends: 0,
        duration_seconds: Math.round((Date.now() - startTime) / 1000),
        api_status: apiStatus,
      };
    }

    // =========================================================================
    // Step 4: Bulk Upsert to Database
    // =========================================================================
    console.log('\n[Step 4/7] Upserting to database...');

    const { insertedCount, updatedCount } = await upsertJobsToDB(allJobs);

    console.log(`  Inserted: ${insertedCount} new jobs`);
    console.log(`  Updated: ${updatedCount} existing jobs`);

    // =========================================================================
    // Step 5: Generate Market Insights
    // =========================================================================
    console.log('\n[Step 5/8] Generating market insights...');

    // Fetch previous insights for trend comparison
    const previousInsight = await db.query.marketInsights.findFirst({
      orderBy: [desc(marketInsights.analyzed_at)],
      where: eq(marketInsights.skill_name, 'market_summary'),
    });

    const previousData = previousInsight?.raw_data as MarketInsightsData | undefined;
    const insights = generateMarketInsights(allJobs, previousData);

    // Detect market shifts
    let marketShifts = { hasSignificantShift: false, shifts: [] as Array<{ type: string; description: string; impact: string }> };
    if (previousData) {
      marketShifts = detectMarketShifts(insights, previousData);
      if (marketShifts.hasSignificantShift) {
        console.log('  ⚠️ Significant market shift detected!');
        marketShifts.shifts.forEach((shift) => {
          console.log(`    - ${shift.description} (${shift.impact} impact)`);
        });
      }
    }

    // Store insights in database
    // demand_score is a percentage (0-100) representing market activity level
    // We calculate it as: min(100, (job_count / 20)) to cap at 100
    const demandScore = Math.min(99.99, allJobs.length / 20).toFixed(2);

    await db.insert(marketInsights).values({
      skill_name: 'market_summary',
      role_category: 'all',
      demand_score: demandScore,
      trend_direction: marketShifts.hasSignificantShift ? 'rising' : 'stable',
      job_count: String(allJobs.length),
      raw_data: {
        ...insights,
        market_shifts: marketShifts.shifts,
      },
      analyzed_at: new Date(),
    });

    console.log(`  Insights saved: ${insights.trending_skills.length} trending skills`);
    console.log(`  Remote jobs: ${insights.remote_percentage}%`);

    // =========================================================================
    // Step 6: Fetch GitHub Velocity Data
    // =========================================================================
    console.log('\n[Step 6/8] Fetching GitHub velocity data...');

    let githubVelocity: GitHubVelocityReport | null = null;
    let techCorrelations: Array<{
      skill: string;
      job_demand: number;
      github_velocity: number;
      correlation: 'high' | 'medium' | 'low';
      recommendation: string;
    }> = [];

    if (isGitHubConfigured()) {
      try {
        githubVelocity = await fetchGitHubVelocityReport();
        console.log(`  Fetched ${githubVelocity.trending_repos.length} trending repos`);
        console.log(`  Analyzed ${githubVelocity.language_trends.length} language trends`);
        console.log(`  Calculated ${githubVelocity.tech_velocity.length} tech velocities`);

        // Correlate with job market
        techCorrelations = correlateWithJobMarket(
          githubVelocity.tech_velocity,
          insights.skill_demand
        );

        // Store GitHub velocity insights
        // demand_score represents average velocity score (0-100 scale)
        const avgVelocity = githubVelocity.tech_velocity.length > 0
          ? githubVelocity.tech_velocity.reduce((sum, t) => sum + t.velocity_score, 0) / githubVelocity.tech_velocity.length
          : 0;

        await db.insert(marketInsights).values({
          skill_name: 'github_velocity',
          role_category: 'all',
          demand_score: Math.min(99.99, avgVelocity).toFixed(2),
          trend_direction: 'stable',
          job_count: String(githubVelocity.trending_repos.length),
          raw_data: {
            trending_repos: githubVelocity.trending_repos.slice(0, 10),
            language_trends: githubVelocity.language_trends,
            tech_velocity: githubVelocity.tech_velocity,
            tech_correlations: techCorrelations.slice(0, 20),
            scraped_at: githubVelocity.scraped_at,
          },
          analyzed_at: new Date(),
        });

        console.log(`  GitHub velocity insights saved`);
        console.log(`  Top correlated skills: ${techCorrelations.slice(0, 5).map(c => c.skill).join(', ')}`);
      } catch (error) {
        console.warn('[GitHub Velocity] Error fetching data:', error);
        console.log('  Continuing without GitHub data...');
      }
    } else {
      console.log('  GitHub API not configured (GITHUB_TOKEN missing)');
      console.log('  Skipping velocity tracking...');
    }

    // =========================================================================
    // Step 7: Publish MARKET_UPDATE Event
    // =========================================================================
    console.log('\n[Step 7/8] Publishing MARKET_UPDATE event...');

    await publishAgentEvent({
      type: 'MARKET_UPDATE',
      payload: {
        skills: insights.trending_skills,
        demand_scores: insights.skill_demand,
        trending_roles: insights.trending_roles,
        job_count: allJobs.length,
      },
    });

    console.log('  MARKET_UPDATE event published');

    // =========================================================================
    // Step 8: Find Job Matches for Users
    // =========================================================================
    console.log('\n[Step 8/8] Finding job matches for users...');

    const matchesFound = await findAndPublishJobMatches(allJobs);

    console.log(`  Published ${matchesFound} job match events`);

    // =========================================================================
    // Summary
    // =========================================================================
    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log('\n' + '='.repeat(70));
    console.log('[Sentinel Agent] Daily scrape complete!');
    console.log(`  Duration: ${duration} seconds`);
    console.log(`  Total jobs processed: ${allJobs.length}`);
    console.log(`  New jobs: ${insertedCount}`);
    console.log(`  Updated jobs: ${updatedCount}`);
    console.log(`  User matches found: ${matchesFound}`);
    console.log(`  Market shifts: ${marketShifts.hasSignificantShift ? 'Yes' : 'No'}`);
    console.log(`  GitHub velocity: ${githubVelocity ? 'Yes' : 'No'}`);
    console.log('='.repeat(70));

    return {
      success: true,
      jobs_scraped: allJobs.length,
      jobs_inserted: insertedCount,
      jobs_updated: updatedCount,
      insights_generated: true,
      matches_found: matchesFound,
      market_shifts_detected: marketShifts.hasSignificantShift,
      github_velocity_fetched: !!githubVelocity,
      tech_trends: githubVelocity?.tech_velocity.length || 0,
      duration_seconds: duration,
      api_status: apiStatus,
    };
  } catch (error) {
    console.error('[Sentinel Agent] Error during scrape:', error);
    return {
      success: false,
      jobs_scraped: 0,
      jobs_inserted: 0,
      jobs_updated: 0,
      insights_generated: false,
      matches_found: 0,
      market_shifts_detected: false,
      github_velocity_fetched: false,
      tech_trends: 0,
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
      api_status: apiStatus,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Upsert jobs to the database
 * Uses ON CONFLICT to update existing jobs
 */
async function upsertJobsToDB(
  jobs: NormalizedJob[]
): Promise<{ insertedCount: number; updatedCount: number }> {
  let insertedCount = 0;
  let updatedCount = 0;

  for (const job of jobs) {
    try {
      // Check if job exists
      const existing = await db.query.jobListings.findFirst({
        where: and(
          eq(jobListings.source, job.source),
          eq(jobListings.external_id, job.external_id)
        ),
      });

      if (existing) {
        // Update existing job
        await db
          .update(jobListings)
          .set({
            title: job.title,
            company: job.company,
            location: job.location,
            salary_range: job.salary_range,
            skills_required: job.required_skills,
            expires_at: job.expires_at,
            raw_data: {
              description: job.description,
              application_url: job.application_url,
              job_type: job.job_type ?? undefined,
              remote_type: job.remote_type ?? undefined,
              salary_min: job.salary_min ?? undefined,
              salary_max: job.salary_max ?? undefined,
            },
            updated_at: new Date(),
          })
          .where(eq(jobListings.id, existing.id));
        updatedCount++;
      } else {
        // Insert new job
        await db.insert(jobListings).values({
          external_id: job.external_id,
          source: job.source,
          title: job.title,
          company: job.company,
          location: job.location,
          salary_range: job.salary_range,
          skills_required: job.required_skills,
          scraped_at: new Date(),
          expires_at: job.expires_at,
          raw_data: {
            description: job.description,
            application_url: job.application_url,
            job_type: job.job_type ?? undefined,
            remote_type: job.remote_type ?? undefined,
            salary_min: job.salary_min ?? undefined,
            salary_max: job.salary_max ?? undefined,
            posted_date: job.posted_at.toISOString(),
          },
        });
        insertedCount++;
      }
    } catch (error) {
      console.error(`Error upserting job ${job.external_id}:`, error);
    }
  }

  return { insertedCount, updatedCount };
}

/**
 * Find job matches for all active users and publish events
 */
async function findAndPublishJobMatches(jobs: NormalizedJob[]): Promise<number> {
  let totalMatches = 0;

  // Get all users with skills
  const usersWithSkills = await db.query.users.findMany({
    with: {
      skills: {
        with: { skill: true },
      },
      profile: true,
    },
  });

  console.log(`  Matching against ${usersWithSkills.length} users...`);

  for (const user of usersWithSkills) {
    if (user.skills.length === 0) continue;

    // Build user profile for matching
    const userProfile: UserSkillProfile = {
      user_id: user.clerk_id,
      skills: user.skills.map((us) => ({
        name: us.skill?.name || 'Unknown',
        proficiency_level: us.proficiency_level,
        is_verified: !!us.verification_metadata?.is_verified,
      })),
      target_roles: user.profile?.target_roles || [],
    };

    // Find matches
    const matches = matchUserToJobs(userProfile, jobs, {
      minMatchScore: MIN_MATCH_SCORE_FOR_EVENT,
      maxResults: 10, // Limit to top 10 per user
      prioritizeVerified: true,
    });

    // Publish JOB_MATCH_FOUND events for strong matches
    for (const match of matches) {
      if (match.match_score >= MIN_MATCH_SCORE_FOR_EVENT) {
        // Publish event for agent orchestration
        await publishAgentEvent({
          type: 'JOB_MATCH_FOUND',
          payload: {
            user_id: user.clerk_id,
            job_listing_id: match.job.external_id,
            match_score: match.match_score,
            matching_skills: match.matching_skills,
            missing_skills: match.missing_skills,
          },
        });

        // Create in-app notification for the user
        await createJobMatchNotification({
          user_id: user.clerk_id,
          job_id: match.job.external_id,
          job_title: match.job.title,
          company: match.job.company,
          match_score: match.match_score,
          matching_skills: match.matching_skills,
          missing_skills: match.missing_skills,
        });

        totalMatches++;
      }
    }
  }

  return totalMatches;
}

// ============================================================================
// Cleanup Job
// ============================================================================

/**
 * Market Cleanup Job - Removes expired/stale listings
 * Runs daily at 3 AM UTC
 */
export const marketCleanup = schedules.task({
  id: 'market.cleanup.daily',
  cron: '0 3 * * *', // 3:00 AM UTC daily
  run: async () => {
    console.log('[Sentinel Agent] Starting cleanup of stale listings');

    try {
      // Mark jobs older than their expiration date as expired
      const now = new Date();

      const expiredResult = await db
        .update(jobListings)
        .set({ updated_at: new Date() })
        .where(lt(jobListings.expires_at, now))
        .returning({ id: jobListings.id });

      // Delete jobs older than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const deletedResult = await db
        .delete(jobListings)
        .where(lt(jobListings.scraped_at, thirtyDaysAgo))
        .returning({ id: jobListings.id });

      console.log(`  Expired: ${expiredResult.length} listings`);
      console.log(`  Deleted: ${deletedResult.length} old listings`);

      return {
        success: true,
        expired_count: expiredResult.length,
        deleted_count: deletedResult.length,
      };
    } catch (error) {
      console.error('[Market Cleanup] Error:', error);
      throw error;
    }
  },
});
