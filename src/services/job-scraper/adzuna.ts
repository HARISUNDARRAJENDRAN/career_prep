/**
 * Adzuna API Client
 *
 * Fetches job listings from Adzuna's API for the Sentinel Agent.
 * https://developer.adzuna.com/
 */

import type { AdzunaJob, AdzunaResponse, AdzunaSearchParams } from './types';

const ADZUNA_API_BASE = 'https://api.adzuna.com/v1/api/jobs';
const RATE_LIMIT_DELAY_MS = 250; // 250ms between requests

/**
 * Scrape jobs from Adzuna API
 *
 * @param params - Search parameters
 * @returns Array of Adzuna jobs
 */
export async function scrapeAdzuna(
  params: AdzunaSearchParams
): Promise<AdzunaJob[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    console.warn('[Adzuna] API credentials not configured - skipping');
    return [];
  }

  const allJobs: AdzunaJob[] = [];
  const country = params.country || 'us';
  const resultsPerPage = params.resultsPerPage || 50;
  const maxPages = params.maxPages || 1;

  console.log(`[Adzuna] Starting scrape with ${params.keywords.length} keywords`);

  for (const keyword of params.keywords) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const jobs = await fetchAdzunaPage(appId, appKey, {
          keyword,
          country,
          resultsPerPage,
          salaryMin: params.salaryMin,
          page,
        });

        allJobs.push(...jobs);

        console.log(
          `[Adzuna] Fetched ${jobs.length} jobs for "${keyword}" (page ${page})`
        );

        // Stop if we got fewer jobs than expected (no more pages)
        if (jobs.length < resultsPerPage) break;

        // Rate limiting
        await sleep(RATE_LIMIT_DELAY_MS);
      } catch (error) {
        console.error(
          `[Adzuna] Error fetching "${keyword}" page ${page}:`,
          error
        );
        // Continue with next keyword on error
        break;
      }
    }
  }

  console.log(`[Adzuna] Total jobs fetched: ${allJobs.length}`);
  return allJobs;
}

/**
 * Fetch a single page from Adzuna API
 */
async function fetchAdzunaPage(
  appId: string,
  appKey: string,
  params: {
    keyword: string;
    country: string;
    resultsPerPage: number;
    salaryMin?: number;
    page: number;
  }
): Promise<AdzunaJob[]> {
  const url = new URL(
    `${ADZUNA_API_BASE}/${params.country}/search/${params.page}`
  );

  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('results_per_page', String(params.resultsPerPage));
  url.searchParams.set('what', params.keyword);
  url.searchParams.set('content-type', 'application/json');

  if (params.salaryMin) {
    url.searchParams.set('salary_min', String(params.salaryMin));
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Adzuna API error: ${response.status} ${response.statusText}`);
  }

  const data: AdzunaResponse = await response.json();
  return data.results || [];
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get Adzuna API status
 */
export function isAdzunaConfigured(): boolean {
  return !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}
