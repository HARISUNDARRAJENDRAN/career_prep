/**
 * Job Scraper Types
 *
 * Type definitions for the Sentinel Agent's job scraping system.
 */

// ============================================================================
// Jooble API Types
// ============================================================================

export interface JoobleJob {
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

export interface JoobleResponse {
  totalCount: number;
  jobs: JoobleJob[];
}

export interface JoobleSearchParams {
  keywords: string[];
  location?: string;
  salary?: number;
  page?: number;
  maxPages?: number;
}

// ============================================================================
// Adzuna API Types
// ============================================================================

export interface AdzunaJob {
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

export interface AdzunaResponse {
  count: number;
  results: AdzunaJob[];
}

export interface AdzunaSearchParams {
  keywords: string[];
  country?: string;
  salaryMin?: number;
  resultsPerPage?: number;
  page?: number;
  maxPages?: number;
}

// ============================================================================
// Normalized Job Types
// ============================================================================

export type JobSource = 'jooble' | 'adzuna' | 'linkedin';
export type JobType = 'full_time' | 'part_time' | 'contract' | 'internship';
export type RemoteType = 'remote' | 'hybrid' | 'onsite';

export interface NormalizedJob {
  external_id: string;
  source: JobSource;
  title: string;
  company: string;
  location: string;
  description: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_range: string | null;
  job_type: JobType | null;
  remote_type: RemoteType | null;
  application_url: string;
  required_skills: string[];
  posted_at: Date;
  expires_at: Date;
}

// ============================================================================
// Market Insights Types
// ============================================================================

export interface SkillDemand {
  skill: string;
  count: number;
  percentage: number;
  trend: 'rising' | 'stable' | 'declining';
  avg_salary?: number;
}

export interface MarketInsightsData {
  skill_demand: Record<string, number>;
  trending_skills: string[];
  trending_roles: string[];
  salary_ranges: Record<string, { min: number; max: number; avg: number }>;
  top_companies: string[];
  remote_percentage: number;
  total_jobs: number;
  scrape_date: string;
  sources: Record<string, number>;
}

// ============================================================================
// Job Match Types
// ============================================================================

export interface JobMatchResult {
  job: NormalizedJob;
  match_score: number;
  matching_skills: string[];
  missing_skills: string[];
  salary_fit: 'above' | 'within' | 'below' | 'unknown';
  recommendation: 'strong_match' | 'good_match' | 'partial_match' | 'stretch';
}

export interface UserSkillProfile {
  user_id: string;
  skills: Array<{
    name: string;
    proficiency_level: string;
    is_verified: boolean;
  }>;
  target_roles: string[];
  min_salary?: number;
  preferred_remote_type?: RemoteType;
  preferred_locations?: string[];
}
