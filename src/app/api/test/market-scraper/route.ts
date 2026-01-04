/**
 * Test endpoint for the Market Scraper (Sentinel Agent)
 *
 * GET /api/test/market-scraper - Check API status (including GitHub)
 * POST /api/test/market-scraper - Trigger the market scraper
 *
 * NOTE: This endpoint is for development/testing only.
 * Remove or protect in production.
 */

import { NextResponse } from 'next/server';
import {
  isJobScrapingConfigured,
  getAPIStatus,
  scrapeJooble,
  scrapeAdzuna,
} from '@/services/job-scraper';
import {
  isGitHubConfigured,
  fetchTrendingRepos,
} from '@/services/github-velocity';

// GET: Check API configuration status
export async function GET() {
  const apiStatus = getAPIStatus();
  const isConfigured = isJobScrapingConfigured();
  const githubConfigured = isGitHubConfigured();

  // Quick test of GitHub API if configured
  let githubTest = null;
  if (githubConfigured) {
    try {
      const repos = await fetchTrendingRepos({ limit: 3, since: 'weekly' });
      githubTest = {
        success: true,
        repoCount: repos.length,
        sample: repos.slice(0, 2).map(r => ({
          name: r.name,
          stars: r.stars,
          language: r.language,
        })),
      };
    } catch (error) {
      githubTest = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  return NextResponse.json({
    configured: isConfigured,
    apis: {
      ...apiStatus,
      github: githubConfigured,
    },
    github_test: githubTest,
    message: isConfigured
      ? 'Job scraping APIs are configured. POST to this endpoint to trigger a test scrape.'
      : 'No job scraping APIs configured. Add JOOBLE_API_KEY or ADZUNA_APP_ID/ADZUNA_APP_KEY to .env',
    github_message: githubConfigured
      ? 'GitHub API configured for velocity tracking.'
      : 'Add GITHUB_TOKEN to .env to enable GitHub velocity tracking.',
  });
}

// POST: Trigger a test scrape (limited to 1 keyword for testing)
export async function POST() {
  const apiStatus = getAPIStatus();
  const githubConfigured = isGitHubConfigured();

  if (!isJobScrapingConfigured()) {
    return NextResponse.json(
      { error: 'No job scraping APIs configured' },
      { status: 400 }
    );
  }

  const results: {
    jooble?: { success: boolean; jobCount?: number; error?: string };
    adzuna?: { success: boolean; jobCount?: number; error?: string };
    github?: { success: boolean; repoCount?: number; error?: string };
    triggerJob?: { success: boolean; taskId?: string; error?: string };
  } = {};

  // Test Jooble API
  if (apiStatus.jooble) {
    try {
      console.log('[Test] Testing Jooble API...');
      const joobleJobs = await scrapeJooble({
        keywords: ['software engineer'],
        location: 'United States',
        maxPages: 1,
      });
      results.jooble = { success: true, jobCount: joobleJobs.length };
      console.log(`[Test] Jooble returned ${joobleJobs.length} jobs`);
    } catch (error) {
      results.jooble = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      console.error('[Test] Jooble error:', error);
    }
  }

  // Test Adzuna API
  if (apiStatus.adzuna) {
    try {
      console.log('[Test] Testing Adzuna API...');
      const adzunaJobs = await scrapeAdzuna({
        keywords: ['software engineer'],
        country: 'us',
        maxPages: 1,
      });
      results.adzuna = { success: true, jobCount: adzunaJobs.length };
      console.log(`[Test] Adzuna returned ${adzunaJobs.length} jobs`);
    } catch (error) {
      results.adzuna = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      console.error('[Test] Adzuna error:', error);
    }
  }

  // Test GitHub API
  if (githubConfigured) {
    try {
      console.log('[Test] Testing GitHub API...');
      const repos = await fetchTrendingRepos({ limit: 5, since: 'weekly' });
      results.github = { success: true, repoCount: repos.length };
      console.log(`[Test] GitHub returned ${repos.length} trending repos`);
    } catch (error) {
      results.github = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      console.error('[Test] GitHub error:', error);
    }
  }

  // Trigger the full market scraper job via Trigger.dev
  try {
    console.log('[Test] Triggering market.scrape task...');
    const { tasks, configure } = await import('@trigger.dev/sdk');

    configure({
      secretKey: process.env.TRIGGER_SECRET_KEY,
    });

    const handle = await tasks.trigger('market.scrape', { force: true });
    results.triggerJob = { success: true, taskId: handle.id };
    console.log(`[Test] Task triggered: ${handle.id}`);
  } catch (error) {
    results.triggerJob = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    console.error('[Test] Trigger.dev error:', error);
  }

  return NextResponse.json({
    message: 'Test completed',
    apiStatus: {
      ...apiStatus,
      github: githubConfigured,
    },
    results,
    dashboard: 'Check Trigger.dev dashboard for task execution details',
  });
}
