# Phase 6: Market Intelligence - Sentinel Agent

> **Created:** January 4, 2025
> **Status:** Planning
> **Priority:** HIGH
> **Dependencies:** Phase 3.5 (Message Bus) - COMPLETED, Phase 5.5 (Truth Loop) - COMPLETED

---

## Table of Contents

1. [Overview](#overview)
2. [Current State Analysis](#current-state-analysis)
3. [Job Board APIs](#job-board-apis)
4. [Implementation Plan](#implementation-plan)
5. [Database Schema](#database-schema)
6. [API Integration](#api-integration)
7. [Market Insights Engine](#market-insights-engine)
8. [Job Matching Algorithm](#job-matching-algorithm)
9. [File Structure](#file-structure)
10. [Environment Variables](#environment-variables)
11. [Testing Strategy](#testing-strategy)
12. [Implementation Checklist](#implementation-checklist)

---

## Overview

### What is the Sentinel Agent?

The Sentinel Agent is the **market intelligence engine** of Career Prep. It autonomously:

1. **Scrapes job listings** from Jooble and Adzuna APIs daily
2. **Analyzes skill demand trends** across the job market
3. **Matches users to relevant jobs** based on their verified skills
4. **Publishes market updates** to trigger roadmap re-pathing when demand shifts

### Why Market Intelligence?

| Problem | Solution |
|---------|----------|
| Users don't know what skills are in demand | Sentinel tracks real-time skill demand |
| Roadmaps become stale | Market shifts trigger automatic roadmap updates |
| Job hunting is manual | Automated job matching based on verified skills |
| No insight into hiring trends | Market insights dashboard shows trends |

### End Goal

After Phase 6:
- Daily job scraping from Jooble + Adzuna (500-1000 jobs/day)
- `job_listings` table populated with normalized job data
- `market_insights` table updated with skill demand trends
- Users see matched jobs on their dashboard
- `MARKET_UPDATE` events trigger roadmap re-pathing for affected users

---

## Current State Analysis

### What Already Exists

| Component | Location | Status |
|-----------|----------|--------|
| **Database Schema** | | |
| `job_listings` table | `src/drizzle/schema/jobs.ts` | ✅ Complete |
| `market_insights` table | `src/drizzle/schema/jobs.ts` | ✅ Complete |
| `job_applications` table | `src/drizzle/schema/jobs.ts` | ✅ Complete |
| **Trigger.dev Jobs** | | |
| `market-scraper.ts` stub | `src/trigger/jobs/market-scraper.ts` | ⚠️ Stub only |
| `market.cleanup` stub | `src/trigger/jobs/market-scraper.ts` | ⚠️ Stub only |
| **Message Bus** | | |
| `MARKET_UPDATE` event type | `src/lib/agents/events.ts` | ✅ Defined |
| `JOB_MATCH_FOUND` event type | `src/lib/agents/events.ts` | ✅ Defined |
| Event routing | `src/lib/agents/message-bus.ts` | ✅ Configured |

### What's Missing

| Component | Description | Priority |
|-----------|-------------|----------|
| **Jooble API Integration** | Fetch jobs from Jooble | Required |
| **Adzuna API Integration** | Fetch jobs from Adzuna | Required |
| **Job Normalizer** | Standardize job data across sources | Required |
| **Skill Extractor** | Extract required skills from job descriptions | Required |
| **Market Insights Generator** | Analyze skill demand trends | Required |
| **Job Matcher** | Match users to jobs based on skills | Required |
| **Cron Schedule** | Trigger daily scraping | Required |
| **Dashboard UI** | Display market insights and matched jobs | Nice-to-have |

---

## Job Board APIs

### Jooble API

**Endpoint:** `https://jooble.org/api/{api_key}`

**Request Format:**
```json
{
  "keywords": "software engineer",
  "location": "United States",
  "radius": "50",
  "salary": "100000",
  "page": 1
}
```

**Response Format:**
```json
{
  "totalCount": 1234,
  "jobs": [
    {
      "title": "Senior Software Engineer",
      "location": "San Francisco, CA",
      "snippet": "We are looking for...",
      "salary": "$150,000 - $200,000",
      "source": "company.com",
      "type": "Full-time",
      "link": "https://jooble.org/...",
      "company": "Tech Corp",
      "updated": "2025-01-03T12:00:00Z",
      "id": "12345678"
    }
  ]
}
```

**Rate Limits:**
- 500 requests/day for free tier
- Max 20 jobs per request

### Adzuna API

**Endpoint:** `https://api.adzuna.com/v1/api/jobs/{country}/search/{page}`

**Request Format (Query Params):**
```
?app_id={app_id}
&app_key={app_key}
&results_per_page=50
&what=software engineer
&where=united states
&salary_min=100000
```

**Response Format:**
```json
{
  "count": 5678,
  "results": [
    {
      "id": "4567890123",
      "title": "Full Stack Developer",
      "description": "We are seeking...",
      "location": {
        "display_name": "New York, NY",
        "area": ["New York"]
      },
      "salary_min": 120000,
      "salary_max": 150000,
      "company": {
        "display_name": "Startup Inc"
      },
      "redirect_url": "https://adzuna.com/...",
      "created": "2025-01-02T08:00:00Z",
      "category": {
        "tag": "it-jobs",
        "label": "IT Jobs"
      }
    }
  ]
}
```

**Rate Limits:**
- 250 requests/day for free tier
- Max 50 results per request

---

## Implementation Plan

### Step 1: Environment Variables

**File:** `src/data/env/server.ts`

```typescript
// Add to existing schema
// Jooble API
JOOBLE_API_KEY: z.string().min(1).optional(),

// Adzuna API
ADZUNA_APP_ID: z.string().min(1).optional(),
ADZUNA_APP_KEY: z.string().min(1).optional(),
```

**File:** `.env.local`

```env
# Jooble API (https://jooble.org/api/about)
JOOBLE_API_KEY=your_jooble_api_key

# Adzuna API (https://developer.adzuna.com/)
ADZUNA_APP_ID=your_adzuna_app_id
ADZUNA_APP_KEY=your_adzuna_app_key
```

---

### Step 2: Job Scraper Service

**File:** `src/services/job-scraper/jooble.ts`

```typescript
interface JoobleJob {
  id: string;
  title: string;
  location: string;
  snippet: string;
  salary: string;
  source: string;
  type: string;
  link: string;
  company: string;
  updated: string;
}

interface JoobleResponse {
  totalCount: number;
  jobs: JoobleJob[];
}

interface JoobleSearchParams {
  keywords: string[];
  location?: string;
  salary?: number;
  page?: number;
}

export async function scrapeJooble(params: JoobleSearchParams): Promise<JoobleJob[]> {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) {
    console.warn('[Jooble] API key not configured');
    return [];
  }

  const allJobs: JoobleJob[] = [];

  for (const keyword of params.keywords) {
    try {
      const response = await fetch(`https://jooble.org/api/${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: keyword,
          location: params.location || 'United States',
          salary: params.salary,
          page: params.page || 1,
        }),
      });

      if (!response.ok) {
        console.error(`[Jooble] API error: ${response.status}`);
        continue;
      }

      const data: JoobleResponse = await response.json();
      allJobs.push(...data.jobs);

      console.log(`[Jooble] Fetched ${data.jobs.length} jobs for "${keyword}"`);

      // Rate limiting: wait 200ms between requests
      await new Promise((r) => setTimeout(r, 200));
    } catch (error) {
      console.error(`[Jooble] Error fetching "${keyword}":`, error);
    }
  }

  return allJobs;
}
```

**File:** `src/services/job-scraper/adzuna.ts`

```typescript
interface AdzunaJob {
  id: string;
  title: string;
  description: string;
  location: {
    display_name: string;
    area: string[];
  };
  salary_min?: number;
  salary_max?: number;
  company: {
    display_name: string;
  };
  redirect_url: string;
  created: string;
  category: {
    tag: string;
    label: string;
  };
}

interface AdzunaResponse {
  count: number;
  results: AdzunaJob[];
}

interface AdzunaSearchParams {
  keywords: string[];
  country?: string;
  salaryMin?: number;
  resultsPerPage?: number;
  page?: number;
}

export async function scrapeAdzuna(params: AdzunaSearchParams): Promise<AdzunaJob[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    console.warn('[Adzuna] API credentials not configured');
    return [];
  }

  const allJobs: AdzunaJob[] = [];
  const country = params.country || 'us';
  const resultsPerPage = params.resultsPerPage || 50;

  for (const keyword of params.keywords) {
    try {
      const url = new URL(
        `https://api.adzuna.com/v1/api/jobs/${country}/search/${params.page || 1}`
      );
      url.searchParams.set('app_id', appId);
      url.searchParams.set('app_key', appKey);
      url.searchParams.set('results_per_page', String(resultsPerPage));
      url.searchParams.set('what', keyword);
      if (params.salaryMin) {
        url.searchParams.set('salary_min', String(params.salaryMin));
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        console.error(`[Adzuna] API error: ${response.status}`);
        continue;
      }

      const data: AdzunaResponse = await response.json();
      allJobs.push(...data.results);

      console.log(`[Adzuna] Fetched ${data.results.length} jobs for "${keyword}"`);

      // Rate limiting: wait 200ms between requests
      await new Promise((r) => setTimeout(r, 200));
    } catch (error) {
      console.error(`[Adzuna] Error fetching "${keyword}":`, error);
    }
  }

  return allJobs;
}
```

---

### Step 3: Job Normalizer

**File:** `src/services/job-scraper/normalizer.ts`

```typescript
import type { JoobleJob } from './jooble';
import type { AdzunaJob } from './adzuna';

// Normalized job structure matching job_listings table
export interface NormalizedJob {
  external_id: string;
  source: 'jooble' | 'adzuna';
  title: string;
  company: string;
  location: string;
  description: string;
  salary_min: number | null;
  salary_max: number | null;
  job_type: 'full_time' | 'part_time' | 'contract' | 'internship' | null;
  remote_type: 'remote' | 'hybrid' | 'onsite' | null;
  application_url: string;
  required_skills: string[];
  posted_at: Date;
  expires_at: Date | null;
}

/**
 * Normalize Jooble job to standard format
 */
export function normalizeJoobleJob(job: JoobleJob): NormalizedJob {
  const { salaryMin, salaryMax } = parseSalaryRange(job.salary);

  return {
    external_id: job.id,
    source: 'jooble',
    title: job.title,
    company: job.company || 'Unknown Company',
    location: job.location,
    description: job.snippet,
    salary_min: salaryMin,
    salary_max: salaryMax,
    job_type: parseJobType(job.type),
    remote_type: parseRemoteType(job.location, job.snippet),
    application_url: job.link,
    required_skills: extractSkillsFromText(job.snippet),
    posted_at: new Date(job.updated),
    expires_at: null,
  };
}

/**
 * Normalize Adzuna job to standard format
 */
export function normalizeAdzunaJob(job: AdzunaJob): NormalizedJob {
  return {
    external_id: job.id,
    source: 'adzuna',
    title: job.title,
    company: job.company?.display_name || 'Unknown Company',
    location: job.location?.display_name || 'Unknown Location',
    description: job.description,
    salary_min: job.salary_min || null,
    salary_max: job.salary_max || null,
    job_type: parseCategoryToJobType(job.category?.tag),
    remote_type: parseRemoteType(
      job.location?.display_name || '',
      job.description
    ),
    application_url: job.redirect_url,
    required_skills: extractSkillsFromText(job.description),
    posted_at: new Date(job.created),
    expires_at: null,
  };
}

/**
 * Deduplicate jobs by title + company + location
 */
export function deduplicateJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Map<string, NormalizedJob>();

  for (const job of jobs) {
    const key = `${job.title.toLowerCase()}-${job.company.toLowerCase()}-${job.location.toLowerCase()}`;

    if (!seen.has(key)) {
      seen.set(key, job);
    }
  }

  return Array.from(seen.values());
}

// Helper functions

function parseSalaryRange(salary: string): { salaryMin: number | null; salaryMax: number | null } {
  if (!salary) return { salaryMin: null, salaryMax: null };

  // Extract numbers from salary string like "$100,000 - $150,000"
  const numbers = salary.match(/\d+[,\d]*/g);
  if (!numbers || numbers.length === 0) return { salaryMin: null, salaryMax: null };

  const values = numbers.map((n) => parseInt(n.replace(/,/g, ''), 10));

  return {
    salaryMin: values[0] || null,
    salaryMax: values[1] || values[0] || null,
  };
}

function parseJobType(type: string): NormalizedJob['job_type'] {
  const lower = (type || '').toLowerCase();
  if (lower.includes('full')) return 'full_time';
  if (lower.includes('part')) return 'part_time';
  if (lower.includes('contract')) return 'contract';
  if (lower.includes('intern')) return 'internship';
  return null;
}

function parseCategoryToJobType(category: string): NormalizedJob['job_type'] {
  // Adzuna categories don't typically indicate job type
  return 'full_time';
}

function parseRemoteType(location: string, description: string): NormalizedJob['remote_type'] {
  const text = `${location} ${description}`.toLowerCase();
  if (text.includes('remote') && text.includes('hybrid')) return 'hybrid';
  if (text.includes('remote')) return 'remote';
  if (text.includes('on-site') || text.includes('onsite')) return 'onsite';
  return null;
}

/**
 * Extract skills from job description using keyword matching
 * This is a simple implementation - could be enhanced with NLP/AI
 */
function extractSkillsFromText(text: string): string[] {
  const skillKeywords = [
    // Languages
    'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin',
    // Frontend
    'react', 'vue', 'angular', 'svelte', 'next.js', 'nextjs', 'html', 'css', 'tailwind', 'sass',
    // Backend
    'node.js', 'nodejs', 'express', 'fastapi', 'django', 'flask', 'spring', 'rails', '.net',
    // Databases
    'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'sql', 'nosql', 'dynamodb',
    // Cloud/DevOps
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins', 'ci/cd', 'github actions',
    // Other
    'graphql', 'rest', 'api', 'microservices', 'machine learning', 'ai', 'data science',
    'agile', 'scrum', 'git', 'linux', 'system design',
  ];

  const lowerText = text.toLowerCase();
  const foundSkills: string[] = [];

  for (const skill of skillKeywords) {
    if (lowerText.includes(skill)) {
      // Capitalize properly
      foundSkills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
    }
  }

  return [...new Set(foundSkills)]; // Remove duplicates
}
```

---

### Step 4: Update Market Scraper Job

**File:** `src/trigger/jobs/market-scraper.ts` (REPLACE STUB)

```typescript
/**
 * Market Scraper Job - Sentinel Agent
 *
 * Triggered: Daily via cron schedule
 * Purpose: Scrape job listings from Jooble and Adzuna APIs
 */

import { task, schedules } from '@trigger.dev/sdk';
import { db } from '@/drizzle/db';
import { jobListings, marketInsights, userSkills, users } from '@/drizzle/schema';
import { eq, and, gte, sql, inArray } from 'drizzle-orm';
import { publishAgentEvent } from '@/lib/agents/message-bus';

import { scrapeJooble } from '@/services/job-scraper/jooble';
import { scrapeAdzuna } from '@/services/job-scraper/adzuna';
import {
  normalizeJoobleJob,
  normalizeAdzunaJob,
  deduplicateJobs,
  type NormalizedJob,
} from '@/services/job-scraper/normalizer';

// Keywords to search for (expand as needed)
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
];

/**
 * Daily Market Scraper - Runs at 2 AM UTC
 */
export const dailyMarketScraper = schedules.task({
  id: 'market.scrape.daily',
  cron: '0 2 * * *', // 2:00 AM UTC daily
  run: async (payload) => {
    console.log('='.repeat(60));
    console.log('[Market Scraper] Daily job started');
    console.log(`  Scheduled Time: ${payload.timestamp}`);
    console.log(`  Last Run: ${payload.lastTimestamp || 'First run'}`);
    console.log('='.repeat(60));

    return await runMarketScraper();
  },
});

/**
 * Manual Market Scraper - Can be triggered on demand
 */
export const marketScraper = task({
  id: 'market.scrape',
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
  },
  run: async () => {
    console.log('[Market Scraper] Manual trigger');
    return await runMarketScraper();
  },
});

/**
 * Core scraping logic
 */
async function runMarketScraper() {
  const startTime = Date.now();

  try {
    // =========================================================================
    // Step 1: Scrape Jooble API
    // =========================================================================
    console.log('[Market Scraper] Scraping Jooble...');

    const joobleJobs = await scrapeJooble({
      keywords: SEARCH_KEYWORDS,
      location: 'United States',
    });

    console.log(`[Market Scraper] Fetched ${joobleJobs.length} jobs from Jooble`);

    // =========================================================================
    // Step 2: Scrape Adzuna API
    // =========================================================================
    console.log('[Market Scraper] Scraping Adzuna...');

    const adzunaJobs = await scrapeAdzuna({
      keywords: SEARCH_KEYWORDS,
      country: 'us',
    });

    console.log(`[Market Scraper] Fetched ${adzunaJobs.length} jobs from Adzuna`);

    // =========================================================================
    // Step 3: Normalize and Deduplicate
    // =========================================================================
    const normalizedJooble = joobleJobs.map(normalizeJoobleJob);
    const normalizedAdzuna = adzunaJobs.map(normalizeAdzunaJob);

    const allJobs = deduplicateJobs([...normalizedJooble, ...normalizedAdzuna]);

    console.log(`[Market Scraper] ${allJobs.length} unique jobs after deduplication`);

    // =========================================================================
    // Step 4: Bulk Upsert to Database
    // =========================================================================
    console.log('[Market Scraper] Upserting to database...');

    let insertedCount = 0;
    let updatedCount = 0;

    for (const job of allJobs) {
      try {
        // Check if job exists
        const existing = await db.query.jobListings.findFirst({
          where: and(
            eq(jobListings.source, job.source),
            eq(jobListings.external_id, job.external_id)
          ),
        });

        if (existing) {
          // Update existing
          await db
            .update(jobListings)
            .set({
              title: job.title,
              description: job.description,
              salary_min: job.salary_min,
              salary_max: job.salary_max,
              required_skills: job.required_skills,
              updated_at: new Date(),
            })
            .where(eq(jobListings.id, existing.id));
          updatedCount++;
        } else {
          // Insert new
          await db.insert(jobListings).values({
            external_id: job.external_id,
            source: job.source,
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description,
            salary_min: job.salary_min,
            salary_max: job.salary_max,
            job_type: job.job_type,
            remote_type: job.remote_type,
            application_url: job.application_url,
            required_skills: job.required_skills,
            posted_at: job.posted_at,
            expires_at: job.expires_at,
            is_active: true,
          });
          insertedCount++;
        }
      } catch (error) {
        console.error(`[Market Scraper] Error upserting job ${job.external_id}:`, error);
      }
    }

    console.log(`[Market Scraper] Inserted: ${insertedCount}, Updated: ${updatedCount}`);

    // =========================================================================
    // Step 5: Generate Market Insights
    // =========================================================================
    console.log('[Market Scraper] Generating market insights...');

    const insights = await generateMarketInsights(allJobs);

    // Store insights
    await db.insert(marketInsights).values({
      category: 'daily_scrape',
      data: {
        ...insights,
        scrape_date: new Date().toISOString(),
        total_jobs: allJobs.length,
        sources: {
          jooble: joobleJobs.length,
          adzuna: adzunaJobs.length,
        },
      },
      generated_at: new Date(),
    });

    // =========================================================================
    // Step 6: Publish MARKET_UPDATE Event
    // =========================================================================
    console.log('[Market Scraper] Publishing MARKET_UPDATE event...');

    await publishAgentEvent({
      type: 'MARKET_UPDATE',
      payload: {
        skills: insights.trending_skills,
        demand_scores: insights.skill_demand,
        trending_roles: insights.trending_roles,
      },
    });

    // =========================================================================
    // Step 7: Find Job Matches for Users
    // =========================================================================
    console.log('[Market Scraper] Finding job matches for users...');

    const matchesFound = await findJobMatchesForUsers(allJobs);

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log('='.repeat(60));
    console.log('[Market Scraper] Daily scrape complete!');
    console.log(`  Duration: ${duration} seconds`);
    console.log(`  Total jobs processed: ${allJobs.length}`);
    console.log(`  New jobs: ${insertedCount}`);
    console.log(`  Updated jobs: ${updatedCount}`);
    console.log(`  User matches found: ${matchesFound}`);
    console.log('='.repeat(60));

    return {
      success: true,
      jobs_scraped: allJobs.length,
      jobs_inserted: insertedCount,
      jobs_updated: updatedCount,
      insights_generated: true,
      matches_found: matchesFound,
      duration_seconds: duration,
    };
  } catch (error) {
    console.error('[Market Scraper] Error:', error);
    throw error;
  }
}

/**
 * Generate market insights from scraped jobs
 */
interface MarketInsights {
  skill_demand: Record<string, number>;
  trending_skills: string[];
  trending_roles: string[];
  salary_ranges: Record<string, { min: number; max: number; avg: number }>;
  top_companies: string[];
  remote_percentage: number;
}

async function generateMarketInsights(jobs: NormalizedJob[]): Promise<MarketInsights> {
  // Count skill occurrences
  const skillCounts: Record<string, number> = {};
  const roleCounts: Record<string, number> = {};
  const companyCounts: Record<string, number> = {};
  const salaries: Record<string, number[]> = {};
  let remoteCount = 0;

  for (const job of jobs) {
    // Skills
    for (const skill of job.required_skills) {
      skillCounts[skill] = (skillCounts[skill] || 0) + 1;
    }

    // Roles (extract from title)
    const roleKeywords = ['engineer', 'developer', 'scientist', 'analyst', 'architect', 'lead', 'manager'];
    for (const keyword of roleKeywords) {
      if (job.title.toLowerCase().includes(keyword)) {
        const role = job.title.split(/[,-]/)[0].trim();
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      }
    }

    // Companies
    companyCounts[job.company] = (companyCounts[job.company] || 0) + 1;

    // Salaries
    if (job.salary_min || job.salary_max) {
      const avg = ((job.salary_min || 0) + (job.salary_max || job.salary_min || 0)) / 2;
      if (avg > 0) {
        const roleKey = job.title.toLowerCase().includes('senior') ? 'Senior' : 'Mid-level';
        salaries[roleKey] = salaries[roleKey] || [];
        salaries[roleKey].push(avg);
      }
    }

    // Remote
    if (job.remote_type === 'remote' || job.remote_type === 'hybrid') {
      remoteCount++;
    }
  }

  // Sort and get top items
  const sortedSkills = Object.entries(skillCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);

  const sortedRoles = Object.entries(roleCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const sortedCompanies = Object.entries(companyCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  // Calculate salary ranges
  const salaryRanges: Record<string, { min: number; max: number; avg: number }> = {};
  for (const [level, values] of Object.entries(salaries)) {
    if (values.length > 0) {
      salaryRanges[level] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      };
    }
  }

  return {
    skill_demand: Object.fromEntries(sortedSkills),
    trending_skills: sortedSkills.slice(0, 10).map(([skill]) => skill),
    trending_roles: sortedRoles.map(([role]) => role),
    salary_ranges: salaryRanges,
    top_companies: sortedCompanies.map(([company]) => company),
    remote_percentage: Math.round((remoteCount / jobs.length) * 100),
  };
}

/**
 * Find job matches for all users and publish events
 */
async function findJobMatchesForUsers(jobs: NormalizedJob[]): Promise<number> {
  // Get all users with skills
  const usersWithSkills = await db.query.users.findMany({
    with: {
      skills: {
        with: { skill: true },
      },
    },
  });

  let totalMatches = 0;

  for (const user of usersWithSkills) {
    const userSkillNames = user.skills
      .map((us) => us.skill?.name?.toLowerCase())
      .filter(Boolean) as string[];

    if (userSkillNames.length === 0) continue;

    // Find matching jobs
    for (const job of jobs) {
      const jobSkills = job.required_skills.map((s) => s.toLowerCase());
      const matchingSkills = userSkillNames.filter((s) => jobSkills.includes(s));

      if (matchingSkills.length >= 2) {
        // Calculate match score (0-100)
        const matchScore = Math.round(
          (matchingSkills.length / Math.max(jobSkills.length, 1)) * 100
        );

        if (matchScore >= 50) {
          // Publish job match event
          await publishAgentEvent({
            type: 'JOB_MATCH_FOUND',
            payload: {
              user_id: user.clerk_id,
              job_listing_id: job.external_id,
              match_score: matchScore,
              matching_skills: matchingSkills,
            },
          });
          totalMatches++;
        }
      }
    }
  }

  return totalMatches;
}

/**
 * Market Cleanup Job - Removes expired listings
 */
export const marketCleanup = schedules.task({
  id: 'market.cleanup.daily',
  cron: '0 3 * * *', // 3:00 AM UTC daily
  run: async () => {
    console.log('[Market Cleanup] Starting cleanup of old listings');

    try {
      // Mark jobs older than 30 days as inactive
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await db
        .update(jobListings)
        .set({ is_active: false, updated_at: new Date() })
        .where(
          and(
            eq(jobListings.is_active, true),
            sql`${jobListings.posted_at} < ${thirtyDaysAgo}`
          )
        )
        .returning({ id: jobListings.id });

      console.log(`[Market Cleanup] Marked ${result.length} old listings as inactive`);

      return {
        success: true,
        deactivated_count: result.length,
      };
    } catch (error) {
      console.error('[Market Cleanup] Error:', error);
      throw error;
    }
  },
});
```

---

### Step 5: Create Job Matching Handler

**File:** `src/trigger/jobs/job-matcher.ts`

```typescript
/**
 * Job Matcher Job
 *
 * Triggered when: JOB_MATCH_FOUND event is published
 * Purpose: Store job matches and optionally notify users
 */

import { task } from '@trigger.dev/sdk';
import { db } from '@/drizzle/db';
import { jobListings } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import {
  shouldSkipEvent,
  markEventCompleted,
  markEventFailed,
} from '@/lib/agents/message-bus';

interface JobMatchPayload {
  event_id: string;
  user_id: string;
  job_listing_id: string;
  match_score: number;
  matching_skills: string[];
}

export const jobMatcher = task({
  id: 'action.evaluate-match',
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: JobMatchPayload) => {
    const { event_id, user_id, job_listing_id, match_score, matching_skills } = payload;

    // Idempotency check
    const idempotencyCheck = await shouldSkipEvent(event_id);
    if (idempotencyCheck.skip) {
      return { success: true, skipped: true, reason: idempotencyCheck.reason };
    }

    try {
      console.log('[Job Matcher] Processing job match');
      console.log(`  User: ${user_id}`);
      console.log(`  Job: ${job_listing_id}`);
      console.log(`  Score: ${match_score}%`);
      console.log(`  Matching Skills: ${matching_skills.join(', ')}`);

      // Get full job details
      const job = await db.query.jobListings.findFirst({
        where: eq(jobListings.external_id, job_listing_id),
      });

      if (!job) {
        console.log('[Job Matcher] Job not found, may have been removed');
        await markEventCompleted(event_id);
        return { success: true, processed: false, reason: 'job_not_found' };
      }

      // TODO: Phase 7+ - Store match in user_job_matches table
      // TODO: Phase 7+ - Send notification to user
      // TODO: Phase 7+ - Trigger auto-apply if score > 80 and user opted in

      console.log(`[Job Matcher] Match recorded: ${job.title} at ${job.company}`);

      await markEventCompleted(event_id);

      return {
        success: true,
        processed: true,
        job_id: job.id,
        job_title: job.title,
        company: job.company,
        match_score,
      };
    } catch (error) {
      console.error('[Job Matcher] Error:', error);
      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  },
});
```

---

## Database Schema

### Existing Tables (Already Complete)

#### job_listings Table
```typescript
// src/drizzle/schema/jobs.ts (already exists)
export const jobListings = pgTable('job_listings', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  external_id: varchar('external_id', { length: 255 }),
  source: varchar('source', { length: 50 }), // 'jooble' | 'adzuna'
  title: varchar('title', { length: 255 }).notNull(),
  company: varchar('company', { length: 255 }),
  location: varchar('location', { length: 255 }),
  description: text('description'),
  salary_min: integer('salary_min'),
  salary_max: integer('salary_max'),
  job_type: jobTypeEnum('job_type'),
  remote_type: remoteTypeEnum('remote_type'),
  application_url: text('application_url'),
  required_skills: jsonb('required_skills').$type<string[]>(),
  posted_at: timestamp('posted_at'),
  expires_at: timestamp('expires_at'),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
```

#### market_insights Table
```typescript
// src/drizzle/schema/jobs.ts (already exists)
export const marketInsights = pgTable('market_insights', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  category: varchar('category', { length: 100 }).notNull(),
  data: jsonb('data').notNull(),
  generated_at: timestamp('generated_at').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
```

---

## File Structure

```
src/
├── services/
│   └── job-scraper/
│       ├── index.ts              # NEW: Barrel export
│       ├── jooble.ts             # NEW: Jooble API client
│       ├── adzuna.ts             # NEW: Adzuna API client
│       └── normalizer.ts         # NEW: Job normalization and deduplication
├── trigger/
│   └── jobs/
│       ├── market-scraper.ts     # UPDATED: Full implementation
│       └── job-matcher.ts        # NEW: Job match handler
└── app/
    └── (dashboard)/
        └── jobs/
            └── page.tsx          # FUTURE: Jobs dashboard (Phase 6.5)
```

---

## Environment Variables

### Required API Keys

```env
# Jooble API
# Get your key at: https://jooble.org/api/about
JOOBLE_API_KEY=your_jooble_api_key_here

# Adzuna API
# Register at: https://developer.adzuna.com/
ADZUNA_APP_ID=your_adzuna_app_id_here
ADZUNA_APP_KEY=your_adzuna_app_key_here
```

### Environment Validation

**File:** `src/data/env/server.ts`

```typescript
// Add to existing schema
// Job Scraper APIs (Phase 6)
JOOBLE_API_KEY: z.string().min(1).optional(),
ADZUNA_APP_ID: z.string().min(1).optional(),
ADZUNA_APP_KEY: z.string().min(1).optional(),
```

---

## Testing Strategy

### Manual Testing Checklist

1. **API Connectivity**
   - [ ] Jooble API returns valid jobs
   - [ ] Adzuna API returns valid jobs
   - [ ] Rate limiting is respected (no 429 errors)

2. **Data Processing**
   - [ ] Jobs are normalized correctly
   - [ ] Deduplication works (no duplicate jobs)
   - [ ] Skills are extracted from descriptions
   - [ ] Salary ranges are parsed correctly

3. **Database Operations**
   - [ ] New jobs are inserted
   - [ ] Existing jobs are updated
   - [ ] Market insights are generated
   - [ ] Old jobs are marked inactive

4. **Events**
   - [ ] `MARKET_UPDATE` event fires after scrape
   - [ ] `JOB_MATCH_FOUND` events fire for matching users
   - [ ] Events appear in Trigger.dev dashboard

5. **Scheduling**
   - [ ] Daily scraper runs at 2 AM UTC
   - [ ] Cleanup runs at 3 AM UTC

### Integration Test (Manual)

```bash
# Trigger manual scrape
npx trigger.dev@latest invoke market.scrape

# Check Trigger.dev dashboard for:
# - Job execution logs
# - Event publications
# - Retry behavior
```

---

## Implementation Checklist

### Phase 6.1: API Setup
- [ ] Create Jooble account and get API key
- [ ] Create Adzuna developer account and get credentials
- [ ] Add environment variables to `.env.local`
- [ ] Update `src/data/env/server.ts` with validation

### Phase 6.2: Job Scraper Service
- [ ] Create `src/services/job-scraper/jooble.ts`
- [ ] Create `src/services/job-scraper/adzuna.ts`
- [ ] Create `src/services/job-scraper/normalizer.ts`
- [ ] Create `src/services/job-scraper/index.ts` (barrel export)

### Phase 6.3: Trigger.dev Jobs
- [ ] Update `src/trigger/jobs/market-scraper.ts` with full implementation
- [ ] Create `src/trigger/jobs/job-matcher.ts`
- [ ] Update `src/trigger/jobs/index.ts` to export new jobs

### Phase 6.4: Testing
- [ ] Test Jooble API manually
- [ ] Test Adzuna API manually
- [ ] Run manual scrape via Trigger.dev
- [ ] Verify jobs appear in database
- [ ] Verify market insights are generated
- [ ] Verify MARKET_UPDATE event fires

### Phase 6.5: Dashboard (Optional)
- [ ] Create `/jobs` page to display matched jobs
- [ ] Show market insights (trending skills, salary ranges)
- [ ] Add "Apply" buttons for job listings

---

## Dependencies & Blockers

### Requires Before Phase 6
- [x] Phase 3.5: Message Bus (COMPLETED)
- [x] Phase 5: Hume AI Interviews (COMPLETED)
- [x] Phase 5.5: Truth Loop (COMPLETED)
- [x] Database schema for jobs/insights (EXISTS)

### Enables After Phase 6
- **Phase 6.5: Jobs Dashboard** - UI for viewing matched jobs
- **Phase 7: Action Agent** - Autonomous job applications
- **Roadmap Re-pathing** - Market shifts trigger roadmap updates

---

## Open Questions

1. **API Tier Selection**
   - Free tier is limited (250-500 requests/day)
   - Should we start with free tier or upgrade immediately?

2. **Scraping Frequency**
   - Daily at 2 AM seems reasonable
   - Should we add an on-demand "refresh" button for users?

3. **Job Match Threshold**
   - Currently set at 50% skill match and 2+ skills
   - Should this be configurable per user?

4. **Notification Strategy**
   - How should we notify users of job matches?
   - Email? In-app notifications? Both?

5. **Geographic Scope**
   - Starting with US only
   - When to expand to other countries?

---

*Last Updated: January 4, 2025*
*Next Phase: Phase 6.5 - Jobs Dashboard UI*
