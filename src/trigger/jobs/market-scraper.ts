/**
 * Market Scraper Job
 *
 * Triggered: Daily via cron schedule (2 AM)
 * Purpose: Scrape job listings from Jooble and Adzuna APIs
 *
 * This is a long-running job that can take 10+ minutes.
 * It runs at low priority to avoid blocking user-facing events.
 *
 * Flow:
 * 1. Scrape Jooble API for job listings
 * 2. Scrape Adzuna API for job listings
 * 3. Deduplicate and normalize listings
 * 4. Bulk upsert to job_listings table
 * 5. Generate market insights (skill demand trends)
 * 6. Publish MARKET_UPDATE event
 *
 * NOTE: This file uses a local stub until Trigger.dev is installed.
 * Run `npx trigger.dev@latest init` to enable real background job execution.
 */

import { task } from '@trigger.dev/sdk';

export const marketScraper = task({
  id: 'market.scrape',
  // This job is scheduled via Trigger.dev cron, not triggered by events
  run: async () => {
    console.log('='.repeat(60));
    console.log('[Market Scraper] Daily job started');
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    try {
      // =========================================================================
      // TODO: Implement in Phase 6 (Market Intelligence)
      // =========================================================================

      // Step 1: Scrape Jooble API
      // const joobleJobs = await scrapeJooble({
      //   keywords: ['software engineer', 'frontend', 'backend', 'fullstack'],
      //   locations: ['remote', 'san francisco', 'new york'],
      //   limit: 500,
      // });
      // console.log(`[Market Scraper] Scraped ${joobleJobs.length} jobs from Jooble`);

      // Step 2: Scrape Adzuna API
      // const adzunaJobs = await scrapeAdzuna({
      //   keywords: ['software engineer', 'developer'],
      //   locations: ['us'],
      //   limit: 500,
      // });
      // console.log(`[Market Scraper] Scraped ${adzunaJobs.length} jobs from Adzuna`);

      // Step 3: Deduplicate and normalize
      // const allJobs = deduplicateJobs([...joobleJobs, ...adzunaJobs]);
      // console.log(`[Market Scraper] ${allJobs.length} unique jobs after dedup`);

      // Step 4: Bulk upsert to job_listings
      // await db.insert(jobListings).values(allJobs)
      //   .onConflictDoUpdate({
      //     target: [jobListings.source, jobListings.external_id],
      //     set: { updated_at: new Date() },
      //   });

      // Step 5: Generate market insights
      // const insights = await generateMarketInsights(allJobs);
      // await db.insert(marketInsights).values(insights);

      // Step 6: Publish MARKET_UPDATE event
      // await publishAgentEvent({
      //   type: 'MARKET_UPDATE',
      //   payload: {
      //     skills: insights.trending_skills,
      //     demand_scores: insights.skill_demand,
      //     trending_roles: insights.trending_roles,
      //     job_count: allJobs.length,
      //   },
      // });

      console.log('[Market Scraper] Job completed (stub implementation)');

      return {
        success: true,
        jobs_scraped: 0, // Will have actual count when implemented
        insights_generated: false,
      };
    } catch (error) {
      console.error('[Market Scraper] Error:', error);
      throw error;
    }
  },
});

/**
 * Market Cleanup Job
 *
 * Triggered: Daily via cron schedule (3 AM)
 * Purpose: Clean up expired job listings
 */
export const marketCleanup = task({
  id: 'market.cleanup',
  run: async () => {
    console.log('[Market Cleanup] Starting cleanup of expired listings');

    try {
      // TODO: Implement in Phase 6
      // const deleted = await db.delete(jobListings)
      //   .where(lt(jobListings.expires_at, new Date()))
      //   .returning({ id: jobListings.id });
      //
      // console.log(`[Market Cleanup] Deleted ${deleted.length} expired listings`);

      return {
        success: true,
        deleted_count: 0,
      };
    } catch (error) {
      console.error('[Market Cleanup] Error:', error);
      throw error;
    }
  },
});
