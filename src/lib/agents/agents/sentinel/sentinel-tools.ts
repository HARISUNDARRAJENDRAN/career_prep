/**
 * Sentinel Agent Tools
 *
 * Tool definitions for market intelligence and job matching.
 *
 * @see docs/agentic-improvements/07-TOOL_SELECTION.md
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { toolRegistry, type ToolDefinition, defineTool } from '../../tools/tool-registry';
import { db } from '@/drizzle/db';
import { jobListings, marketInsights, userSkills, skills as skillsTable } from '@/drizzle/schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import {
  buildSkillExtractionPrompt,
  buildMarketAnalysisPrompt,
  buildJobMatchingPrompt,
  buildGitHubCorrelationPrompt,
  SENTINEL_PROMPTS,
} from './sentinel-prompts';
import { safeJsonParse } from '../../utils/safe-json';

// ============================================================================
// Input/Output Schemas
// ============================================================================

const JobScraperInput = z.object({
  keywords: z.array(z.string()),
  location: z.string().optional(),
  max_results: z.number().optional().default(100),
  sources: z.array(z.enum(['jooble', 'adzuna', 'all'])).optional().default(['all']),
});

const JobScraperOutput = z.object({
  jobs: z.array(z.object({
    id: z.string(),
    title: z.string(),
    company: z.string(),
    location: z.string(),
    skills: z.array(z.string()),
    source: z.string(),
  })),
  total_fetched: z.number(),
  sources_used: z.array(z.string()),
});

const SkillExtractorInput = z.object({
  job_descriptions: z.array(z.object({
    id: z.string(),
    title: z.string(),
    company: z.string().optional(),
    description: z.string(),
  })),
  batch_size: z.number().optional().default(10),
});

const SkillExtractorOutput = z.object({
  extractions: z.array(z.object({
    job_id: z.string(),
    technical_skills: z.array(z.object({
      name: z.string(),
      category: z.string(),
      confidence: z.number(),
      required: z.boolean(),
    })),
    soft_skills: z.array(z.object({
      name: z.string(),
      confidence: z.number(),
    })),
  })),
  total_skills_extracted: z.number(),
});

const MarketAnalyzerInput = z.object({
  jobs: z.array(z.object({
    title: z.string(),
    company: z.string(),
    skills: z.array(z.string()),
  })),
  include_previous: z.boolean().optional().default(true),
});

const MarketAnalyzerOutput = z.object({
  trending_skills: z.array(z.string()),
  skill_demand: z.record(z.string(), z.number()),
  emerging_roles: z.array(z.string()),
  market_summary: z.string(),
  notable_shifts: z.array(z.object({
    type: z.string(),
    description: z.string(),
    impact: z.enum(['high', 'medium', 'low']),
  })),
});

const TrendDetectorInput = z.object({
  current_insights: z.record(z.string(), z.unknown()),
  historical_data: z.array(z.record(z.string(), z.unknown())).optional(),
  lookback_days: z.number().optional().default(30),
});

const TrendDetectorOutput = z.object({
  trends: z.array(z.object({
    skill: z.string(),
    direction: z.enum(['rising', 'stable', 'declining']),
    change_percentage: z.number(),
    confidence: z.number(),
  })),
  market_shifts: z.array(z.object({
    type: z.string(),
    description: z.string(),
    impact: z.enum(['high', 'medium', 'low']),
  })),
  has_significant_shift: z.boolean(),
});

const JobMatcherInput = z.object({
  user_id: z.string(),
  jobs: z.array(z.object({
    id: z.string(),
    title: z.string(),
    company: z.string(),
    skills: z.array(z.string()),
    description: z.string().optional(),
  })),
  min_match_score: z.number().optional().default(50),
  max_results: z.number().optional().default(20),
});

const JobMatcherOutput = z.object({
  matches: z.array(z.object({
    job_id: z.string(),
    match_score: z.number(),
    matching_skills: z.array(z.string()),
    missing_skills: z.array(z.string()),
    fit_assessment: z.string(),
  })),
  total_matches: z.number(),
  top_missing_skills: z.array(z.string()),
});

const InsightsPersisterInput = z.object({
  insights: z.record(z.string(), z.unknown()),
  category: z.enum(['market_summary', 'skill_trends', 'role_trends', 'github_velocity']),
});

const InsightsPersisterOutput = z.object({
  persisted: z.boolean(),
  insight_id: z.string().optional(),
});

const GitHubAnalyzerInput = z.object({
  trending_repos: z.array(z.object({
    name: z.string(),
    stars: z.number(),
    language: z.string(),
  })).optional(),
  job_demand: z.record(z.string(), z.number()).optional(),
});

const GitHubAnalyzerOutput = z.object({
  correlations: z.array(z.object({
    skill: z.string(),
    github_signal: z.number(),
    job_demand: z.number(),
    verdict: z.enum(['strong_match', 'emerging', 'established']),
  })),
  emerging_technologies: z.array(z.string()),
  recommendations: z.array(z.string()),
});

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Job Scraper Tool - Fetches jobs from configured APIs
 */
const jobScraperTool: ToolDefinition<
  z.infer<typeof JobScraperInput>,
  z.infer<typeof JobScraperOutput>
> = {
  id: 'job_scraper',
  name: 'Job Scraper',
  description: 'Scrape job listings from Jooble and Adzuna APIs',
  version: '1.0.0',
  category: 'data_collection',
  tags: ['jobs', 'scraping', 'market'],
  input_schema: JobScraperInput,
  output_schema: JobScraperOutput,
  handler: async (input) => {
    // Import job scraper service
    const { scrapeJooble, scrapeAdzuna, normalizeJoobleJob, normalizeAdzunaJob, deduplicateJobs } = 
      await import('@/services/job-scraper');

    const jobs: Array<{
      id: string;
      title: string;
      company: string;
      location: string;
      skills: string[];
      source: string;
    }> = [];
    const sourcesUsed: string[] = [];

    // Scrape Jooble if configured
    if (input.sources.includes('all') || input.sources.includes('jooble')) {
      try {
        const joobleJobs = await scrapeJooble({
          keywords: input.keywords,
          location: input.location || 'United States',
          maxPages: 2,
        });
        const normalized = joobleJobs.map(normalizeJoobleJob);
        jobs.push(...normalized.map((j) => ({
          id: j.external_id,
          title: j.title,
          company: j.company,
          location: j.location,
          skills: j.required_skills,
          source: 'jooble',
        })));
        sourcesUsed.push('jooble');
      } catch (error) {
        console.warn('[JobScraper] Jooble scrape failed:', error);
      }
    }

    // Scrape Adzuna if configured
    if (input.sources.includes('all') || input.sources.includes('adzuna')) {
      try {
        const adzunaJobs = await scrapeAdzuna({
          keywords: input.keywords,
          country: 'us',
          maxPages: 2,
        });
        const normalized = adzunaJobs.map(normalizeAdzunaJob);
        jobs.push(...normalized.map((j) => ({
          id: j.external_id,
          title: j.title,
          company: j.company,
          location: j.location,
          skills: j.required_skills,
          source: 'adzuna',
        })));
        sourcesUsed.push('adzuna');
      } catch (error) {
        console.warn('[JobScraper] Adzuna scrape failed:', error);
      }
    }

    // Deduplicate
    const uniqueJobs = jobs.filter((job, index, self) =>
      index === self.findIndex((j) => j.title === job.title && j.company === job.company)
    );

    return {
      jobs: uniqueJobs.slice(0, input.max_results),
      total_fetched: uniqueJobs.length,
      sources_used: sourcesUsed,
    };
  },
  cost: { latency_ms: 10000, tokens: 0 },
  requires: [],
  best_for: [
    'Fetching fresh job listings from job boards',
    'Building job inventory for analysis',
  ],
  not_suitable_for: [
    'Analyzing job content',
    'Matching users to jobs',
  ],
  examples: [
    {
      goal: 'Scrape software engineering jobs',
      input: { keywords: ['software engineer'], location: 'San Francisco', max_results: 50 },
      output: { jobs: [], total_fetched: 50, sources_used: ['jooble', 'adzuna'] },
    },
  ],
  enabled: true,
};

/**
 * AI Skill Extractor Tool - Uses GPT to extract skills from descriptions
 */
const skillExtractorTool: ToolDefinition<
  z.infer<typeof SkillExtractorInput>,
  z.infer<typeof SkillExtractorOutput>
> = {
  id: 'skill_extractor_ai',
  name: 'AI Skill Extractor',
  description: 'Extract skills from job descriptions using GPT-4',
  version: '1.0.0',
  category: 'analysis',
  tags: ['skills', 'ai', 'extraction'],
  input_schema: SkillExtractorInput,
  output_schema: SkillExtractorOutput,
  handler: async (input) => {
    const openai = new OpenAI();
    const extractions: z.infer<typeof SkillExtractorOutput>['extractions'] = [];
    let totalSkills = 0;

    // Process in batches
    for (let i = 0; i < input.job_descriptions.length; i += input.batch_size) {
      const batch = input.job_descriptions.slice(i, i + input.batch_size);

      for (const job of batch) {
        try {
          const prompt = buildSkillExtractionPrompt(
            job.description,
            job.title,
            job.company
          );

          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: SENTINEL_PROMPTS.SKILL_EXTRACTOR },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
          });

          const content = response.choices[0]?.message?.content;
          if (content) {
            const parsed = safeJsonParse<{
              technical_skills?: Array<{ name: string; category: string; confidence: number; required: boolean }>;
              soft_skills?: Array<{ name: string; confidence: number }>;
            }>(content, 'skill extraction');
            extractions.push({
              job_id: job.id,
              technical_skills: parsed.technical_skills || [],
              soft_skills: parsed.soft_skills || [],
            });
            totalSkills += (parsed.technical_skills?.length || 0) + (parsed.soft_skills?.length || 0);
          }
        } catch (error) {
          console.warn(`[SkillExtractor] Failed for job ${job.id}:`, error);
        }
      }
    }

    return {
      extractions,
      total_skills_extracted: totalSkills,
    };
  },
  cost: { latency_ms: 2000, tokens: 500 },
  requires: [],
  best_for: [
    'Extracting detailed skills from job descriptions',
    'Building skill taxonomy',
  ],
  not_suitable_for: [
    'Simple keyword matching',
    'Real-time extraction',
  ],
  examples: [],
  enabled: true,
};

/**
 * Market Analyzer Tool - Analyzes job data for trends
 */
const marketAnalyzerTool: ToolDefinition<
  z.infer<typeof MarketAnalyzerInput>,
  z.infer<typeof MarketAnalyzerOutput>
> = {
  id: 'market_analyzer',
  name: 'Market Analyzer',
  description: 'Analyze job listings to identify market trends and skill demand',
  version: '1.0.0',
  category: 'analysis',
  tags: ['market', 'trends', 'analysis'],
  input_schema: MarketAnalyzerInput,
  output_schema: MarketAnalyzerOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    // Fetch previous insights if requested
    let previousInsights: { trending_skills: string[]; skill_demand: Record<string, number> } | undefined;
    if (input.include_previous) {
      const prev = await db.query.marketInsights.findFirst({
        where: eq(marketInsights.skill_name, 'market_summary'),
        orderBy: [desc(marketInsights.analyzed_at)],
      });
      if (prev?.raw_data) {
        previousInsights = prev.raw_data as typeof previousInsights;
      }
    }

    const prompt = buildMarketAnalysisPrompt(input.jobs, previousInsights);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SENTINEL_PROMPTS.SYSTEM_MARKET_ANALYST },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from market analyzer');
    }

    const parsed = safeJsonParse<{
      trending_skills?: string[];
      skill_demand?: Record<string, number>;
      emerging_roles?: string[];
      market_summary?: string;
      notable_shifts?: Array<{ type: string; description: string; impact: 'high' | 'medium' | 'low' }>;
    }>(content, 'market analysis');

    return {
      trending_skills: parsed.trending_skills || [],
      skill_demand: parsed.skill_demand || {},
      emerging_roles: parsed.emerging_roles || [],
      market_summary: parsed.market_summary || '',
      notable_shifts: parsed.notable_shifts || [],
    };
  },
  cost: { latency_ms: 3000, tokens: 1000 },
  requires: [],
  best_for: [
    'Generating market intelligence reports',
    'Identifying trending skills',
  ],
  not_suitable_for: [
    'Individual job analysis',
    'Real-time updates',
  ],
  examples: [],
  enabled: true,
};

/**
 * Trend Detector Tool - Compares current vs historical data
 */
const trendDetectorTool: ToolDefinition<
  z.infer<typeof TrendDetectorInput>,
  z.infer<typeof TrendDetectorOutput>
> = {
  id: 'trend_detector',
  name: 'Trend Detector',
  description: 'Detect market trends by comparing current and historical data',
  version: '1.0.0',
  category: 'analysis',
  tags: ['trends', 'detection', 'comparison'],
  input_schema: TrendDetectorInput,
  output_schema: TrendDetectorOutput,
  handler: async (input) => {
    // Fetch historical data from database
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - input.lookback_days);

    const historicalInsights = await db.query.marketInsights.findMany({
      where: and(
        eq(marketInsights.skill_name, 'market_summary'),
        gte(marketInsights.analyzed_at, lookbackDate)
      ),
      orderBy: [desc(marketInsights.analyzed_at)],
      limit: 30,
    });

    // Calculate trends
    const trends: z.infer<typeof TrendDetectorOutput>['trends'] = [];
    const currentDemand = (input.current_insights.skill_demand as Record<string, number>) || {};
    const shifts: z.infer<typeof TrendDetectorOutput>['market_shifts'] = [];

    // Compare with oldest historical data
    if (historicalInsights.length > 0) {
      const oldestData = historicalInsights[historicalInsights.length - 1]?.raw_data as {
        skill_demand?: Record<string, number>;
      } | null;
      const oldDemand = oldestData?.skill_demand || {};

      for (const [skill, currentScore] of Object.entries(currentDemand)) {
        const oldScore = oldDemand[skill] || 0;
        const changePercentage = oldScore > 0 
          ? ((currentScore - oldScore) / oldScore) * 100 
          : currentScore > 0 ? 100 : 0;

        let direction: 'rising' | 'stable' | 'declining' = 'stable';
        if (changePercentage > 10) direction = 'rising';
        else if (changePercentage < -10) direction = 'declining';

        trends.push({
          skill,
          direction,
          change_percentage: Math.round(changePercentage),
          confidence: Math.min(0.9, 0.5 + (historicalInsights.length / 60)),
        });

        // Detect significant shifts
        if (Math.abs(changePercentage) > 25) {
          shifts.push({
            type: direction === 'rising' ? 'skill_rise' : 'skill_decline',
            description: `${skill} ${direction === 'rising' ? 'increased' : 'decreased'} by ${Math.abs(Math.round(changePercentage))}%`,
            impact: Math.abs(changePercentage) > 50 ? 'high' : 'medium',
          });
        }
      }
    }

    return {
      trends,
      market_shifts: shifts,
      has_significant_shift: shifts.some((s) => s.impact === 'high'),
    };
  },
  cost: { latency_ms: 500, tokens: 0 },
  requires: [],
  best_for: [
    'Detecting market changes over time',
    'Identifying skill demand shifts',
  ],
  not_suitable_for: [
    'Real-time analysis',
    'Individual job assessment',
  ],
  examples: [],
  enabled: true,
};

/**
 * Job Matcher Tool - Matches users to jobs
 */
const jobMatcherTool: ToolDefinition<
  z.infer<typeof JobMatcherInput>,
  z.infer<typeof JobMatcherOutput>
> = {
  id: 'job_matcher',
  name: 'Job Matcher',
  description: 'Match users to jobs based on skill alignment',
  version: '1.0.0',
  category: 'matching',
  tags: ['matching', 'jobs', 'users'],
  input_schema: JobMatcherInput,
  output_schema: JobMatcherOutput,
  handler: async (input) => {
    // Fetch user skills
    const userSkillRecords = await db.query.userSkills.findMany({
      where: eq(userSkills.user_id, input.user_id),
      with: { skill: true },
    });

    const userSkillSet = new Set(
      userSkillRecords.map((us) => us.skill?.name?.toLowerCase()).filter(Boolean)
    );
    const userSkillMap = new Map(
      userSkillRecords.map((us) => [
        us.skill?.name?.toLowerCase() || '',
        us.proficiency_level,
      ])
    );

    // Calculate matches
    const matches: z.infer<typeof JobMatcherOutput>['matches'] = [];
    const allMissingSkills: string[] = [];

    for (const job of input.jobs) {
      const jobSkillsLower = job.skills.map((s) => s.toLowerCase());
      const matchingSkills = jobSkillsLower.filter((s) => userSkillSet.has(s));
      const missingSkills = jobSkillsLower.filter((s) => !userSkillSet.has(s));

      // Calculate score
      const skillMatchRatio = job.skills.length > 0 
        ? matchingSkills.length / job.skills.length 
        : 0;

      // Weight by proficiency
      let proficiencyBonus = 0;
      const proficiencyLevels: Record<string, number> = {
        learning: 2,
        practicing: 4,
        proficient: 6,
        expert: 8,
      };
      for (const skill of matchingSkills) {
        const level = userSkillMap.get(skill) || 'learning';
        const levelScore = proficiencyLevels[level] || 2;
        proficiencyBonus += (levelScore - 5) * 2; // Bonus for above-average skills
      }

      const matchScore = Math.round(
        Math.min(100, skillMatchRatio * 80 + Math.max(0, proficiencyBonus))
      );

      if (matchScore >= input.min_match_score) {
        matches.push({
          job_id: job.id,
          match_score: matchScore,
          matching_skills: matchingSkills,
          missing_skills: missingSkills.slice(0, 5),
          fit_assessment: matchScore >= 80 
            ? 'Strong match - you have most required skills'
            : matchScore >= 60
              ? 'Good potential - some skill gaps to address'
              : 'Stretch role - significant upskilling needed',
        });
        allMissingSkills.push(...missingSkills);
      }
    }

    // Sort by score and limit
    matches.sort((a, b) => b.match_score - a.match_score);

    // Calculate top missing skills
    const missingSkillCounts = new Map<string, number>();
    for (const skill of allMissingSkills) {
      missingSkillCounts.set(skill, (missingSkillCounts.get(skill) || 0) + 1);
    }
    const topMissingSkills = Array.from(missingSkillCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skill]) => skill);

    return {
      matches: matches.slice(0, input.max_results),
      total_matches: matches.length,
      top_missing_skills: topMissingSkills,
    };
  },
  cost: { latency_ms: 500, tokens: 0 },
  requires: [],
  best_for: [
    'Finding relevant job opportunities for users',
    'Identifying skill gaps',
  ],
  not_suitable_for: [
    'Deep job analysis',
    'Application decisions',
  ],
  examples: [],
  enabled: true,
};

/**
 * Insights Persister Tool - Saves insights to database
 */
const insightsPersisterTool: ToolDefinition<
  z.infer<typeof InsightsPersisterInput>,
  z.infer<typeof InsightsPersisterOutput>
> = {
  id: 'insights_persister',
  name: 'Insights Persister',
  description: 'Persist market insights to the database',
  version: '1.0.0',
  category: 'persistence',
  tags: ['database', 'storage', 'insights'],
  input_schema: InsightsPersisterInput,
  output_schema: InsightsPersisterOutput,
  handler: async (input) => {
    const [inserted] = await db.insert(marketInsights).values({
      skill_name: input.category,
      role_category: 'all',
      demand_score: String(input.insights.demand_score || 0),
      trend_direction: (input.insights.trend_direction as 'rising' | 'stable' | 'declining') || 'stable',
      job_count: String(input.insights.job_count || 0),
      raw_data: input.insights,
      analyzed_at: new Date(),
    }).returning({ id: marketInsights.id });

    return {
      persisted: true,
      insight_id: inserted.id,
    };
  },
  cost: { latency_ms: 100, tokens: 0 },
  requires: [],
  best_for: ['Storing analysis results'],
  not_suitable_for: ['Analysis'],
  examples: [],
  enabled: true,
};

/**
 * GitHub Analyzer Tool - Correlates GitHub trends with job market
 */
const githubAnalyzerTool: ToolDefinition<
  z.infer<typeof GitHubAnalyzerInput>,
  z.infer<typeof GitHubAnalyzerOutput>
> = {
  id: 'github_analyzer',
  name: 'GitHub Analyzer',
  description: 'Analyze GitHub trends and correlate with job market demand',
  version: '1.0.0',
  category: 'analysis',
  tags: ['github', 'trends', 'correlation'],
  input_schema: GitHubAnalyzerInput,
  output_schema: GitHubAnalyzerOutput,
  handler: async (input) => {
    if (!input.trending_repos?.length || !input.job_demand) {
      return {
        correlations: [],
        emerging_technologies: [],
        recommendations: ['Insufficient data for GitHub correlation'],
      };
    }

    const openai = new OpenAI();
    const prompt = buildGitHubCorrelationPrompt(input.trending_repos, input.job_demand);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SENTINEL_PROMPTS.GITHUB_ANALYZER },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from GitHub analyzer');
    }

    const parsed = safeJsonParse<{
      correlations?: Array<{
        skill: string;
        github_signal: number;
        job_demand: number;
        verdict: 'strong_match' | 'emerging' | 'established';
      }>;
      emerging_technologies?: string[];
      recommendations?: string[];
    }>(content, 'GitHub analysis');

    return {
      correlations: parsed.correlations || [],
      emerging_technologies: parsed.emerging_technologies || [],
      recommendations: parsed.recommendations || [],
    };
  },
  cost: { latency_ms: 2000, tokens: 500 },
  requires: [],
  best_for: [
    'Correlating GitHub activity with job demand',
    'Identifying emerging technologies',
  ],
  not_suitable_for: [
    'Job matching',
    'Individual skill assessment',
  ],
  examples: [],
  enabled: true,
};

// ============================================================================
// Registration
// ============================================================================

/**
 * Register all Sentinel agent tools
 */
export function registerSentinelTools(): void {
  const tools = [
    jobScraperTool,
    skillExtractorTool,
    marketAnalyzerTool,
    trendDetectorTool,
    jobMatcherTool,
    insightsPersisterTool,
    githubAnalyzerTool,
  ] as const;

  for (const tool of tools) {
    if (!toolRegistry.has(tool.id)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toolRegistry.register(tool as any);
    }
  }

  console.log(`[Sentinel] Registered ${tools.length} tools`);
}

/**
 * Get IDs of all Sentinel tools
 */
export function getSentinelToolIds(): string[] {
  return [
    'job_scraper',
    'skill_extractor_ai',
    'market_analyzer',
    'trend_detector',
    'job_matcher',
    'insights_persister',
    'github_analyzer',
  ];
}

export default {
  registerSentinelTools,
  getSentinelToolIds,
};
