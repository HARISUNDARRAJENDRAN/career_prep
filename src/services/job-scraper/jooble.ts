/**
 * Jooble API Client
 *
 * Fetches job listings from Jooble's API for the Sentinel Agent.
 * https://jooble.org/api/about
 */

import type { JoobleJob, JoobleResponse, JoobleSearchParams } from './types';

const JOOBLE_API_BASE = 'https://jooble.org/api';
const RATE_LIMIT_DELAY_MS = 250; // 250ms between requests

/**
 * Scrape jobs from Jooble API
 *
 * @param params - Search parameters
 * @returns Array of Jooble jobs
 */
export async function scrapeJooble(
  params: JoobleSearchParams
): Promise<JoobleJob[]> {
  const apiKey = process.env.JOOBLE_API_KEY;

  if (!apiKey) {
    console.warn('[Jooble] API key not configured - skipping');
    return [];
  }

  const allJobs: JoobleJob[] = [];
  const maxPages = params.maxPages || 1;

  console.log(`[Jooble] Starting scrape with ${params.keywords.length} keywords`);

  for (const keyword of params.keywords) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const jobs = await fetchJooblePage(apiKey, {
          keyword,
          location: params.location || 'United States',
          salary: params.salary,
          page,
        });

        allJobs.push(...jobs);

        console.log(
          `[Jooble] Fetched ${jobs.length} jobs for "${keyword}" (page ${page})`
        );

        // Stop if we got fewer jobs than expected (no more pages)
        if (jobs.length < 20) break;

        // Rate limiting
        await sleep(RATE_LIMIT_DELAY_MS);
      } catch (error) {
        console.error(
          `[Jooble] Error fetching "${keyword}" page ${page}:`,
          error
        );
        // Continue with next keyword on error
        break;
      }
    }
  }

  console.log(`[Jooble] Total jobs fetched: ${allJobs.length}`);
  return allJobs;
}

/**
 * Fetch a single page from Jooble API
 */
async function fetchJooblePage(
  apiKey: string,
  params: {
    keyword: string;
    location: string;
    salary?: number;
    page: number;
  }
): Promise<JoobleJob[]> {
  const response = await fetch(`${JOOBLE_API_BASE}/${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      keywords: params.keyword,
      location: params.location,
      salary: params.salary,
      page: params.page,
    }),
  });

  if (!response.ok) {
    throw new Error(`Jooble API error: ${response.status} ${response.statusText}`);
  }

  const data: JoobleResponse = await response.json();
  return data.jobs || [];
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get Jooble API status
 */
export function isJoobleConfigured(): boolean {
  return !!process.env.JOOBLE_API_KEY;
}
