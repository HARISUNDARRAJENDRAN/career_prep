/**
 * Market Insights Analyzer
 *
 * Analyzes scraped job listings to generate market intelligence.
 * This is a key part of making the Sentinel Agent more "agentic" -
 * it doesn't just collect data, it understands trends and patterns.
 */

import type { NormalizedJob, MarketInsightsData, SkillDemand } from './types';
import OpenAI from 'openai';

// ============================================================================
// Market Insights Generation
// ============================================================================

/**
 * Generate comprehensive market insights from scraped jobs
 */
export function generateMarketInsights(
  jobs: NormalizedJob[],
  previousInsights?: MarketInsightsData
): MarketInsightsData {
  const skillCounts: Record<string, number> = {};
  const roleCounts: Record<string, number> = {};
  const companyCounts: Record<string, number> = {};
  const salaryByLevel: Record<string, number[]> = {
    Junior: [],
    'Mid-level': [],
    Senior: [],
    Lead: [],
  };
  let remoteCount = 0;
  let totalWithSalary = 0;

  // Process each job
  for (const job of jobs) {
    // Count skills
    for (const skill of job.required_skills) {
      skillCounts[skill] = (skillCounts[skill] || 0) + 1;
    }

    // Count roles (extract from title)
    const roleCategory = extractRoleCategory(job.title);
    if (roleCategory) {
      roleCounts[roleCategory] = (roleCounts[roleCategory] || 0) + 1;
    }

    // Count companies
    if (job.company !== 'Unknown Company') {
      companyCounts[job.company] = (companyCounts[job.company] || 0) + 1;
    }

    // Aggregate salaries by level
    if (job.salary_min || job.salary_max) {
      const avgSalary =
        ((job.salary_min || 0) + (job.salary_max || job.salary_min || 0)) / 2;
      if (avgSalary > 0) {
        const level = extractExperienceLevel(job.title);
        salaryByLevel[level] = salaryByLevel[level] || [];
        salaryByLevel[level].push(avgSalary);
        totalWithSalary++;
      }
    }

    // Count remote jobs
    if (job.remote_type === 'remote' || job.remote_type === 'hybrid') {
      remoteCount++;
    }
  }

  // Calculate salary ranges
  const salaryRanges: Record<string, { min: number; max: number; avg: number }> = {};
  for (const [level, salaries] of Object.entries(salaryByLevel)) {
    if (salaries.length > 0) {
      salaryRanges[level] = {
        min: Math.min(...salaries),
        max: Math.max(...salaries),
        avg: Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length),
      };
    }
  }

  // Sort and extract top items
  const sortedSkills = Object.entries(skillCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30);

  const sortedRoles = Object.entries(roleCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);

  const sortedCompanies = Object.entries(companyCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);

  // Determine trends (compare with previous insights if available)
  const trendingSkills = determineTrendingSkills(
    sortedSkills,
    previousInsights?.skill_demand
  );

  return {
    skill_demand: Object.fromEntries(sortedSkills),
    trending_skills: trendingSkills,
    trending_roles: sortedRoles.map(([role]) => role),
    salary_ranges: salaryRanges,
    top_companies: sortedCompanies.map(([company]) => company),
    remote_percentage: jobs.length > 0 ? Math.round((remoteCount / jobs.length) * 100) : 0,
    total_jobs: jobs.length,
    scrape_date: new Date().toISOString(),
    sources: countJobsBySources(jobs),
  };
}

/**
 * Extract role category from job title
 */
function extractRoleCategory(title: string): string | null {
  const lower = title.toLowerCase();

  // Match specific roles
  const rolePatterns: [RegExp, string][] = [
    [/\b(frontend|front-end|front end)\b/i, 'Frontend Developer'],
    [/\b(backend|back-end|back end)\b/i, 'Backend Developer'],
    [/\b(fullstack|full-stack|full stack)\b/i, 'Full Stack Developer'],
    [/\bdevops\b/i, 'DevOps Engineer'],
    [/\b(data scientist|data science)\b/i, 'Data Scientist'],
    [/\b(data engineer|data engineering)\b/i, 'Data Engineer'],
    [/\b(ml engineer|machine learning)\b/i, 'ML Engineer'],
    [/\b(cloud|aws|azure|gcp)\s*(architect|engineer)/i, 'Cloud Engineer'],
    [/\b(software|swe)\s*(engineer|developer)/i, 'Software Engineer'],
    [/\b(mobile|ios|android)\s*(engineer|developer)/i, 'Mobile Developer'],
    [/\b(qa|quality|test)\s*(engineer|automation)/i, 'QA Engineer'],
    [/\b(security|cybersecurity)\s*(engineer|analyst)/i, 'Security Engineer'],
    [/\b(product\s*manager|pm)\b/i, 'Product Manager'],
    [/\b(engineering\s*manager|tech\s*lead)\b/i, 'Engineering Manager'],
    [/\b(solutions?\s*architect)\b/i, 'Solutions Architect'],
  ];

  for (const [pattern, role] of rolePatterns) {
    if (pattern.test(lower)) {
      return role;
    }
  }

  // Default to generic if "engineer" or "developer" is mentioned
  if (/\bengineer\b/i.test(lower)) return 'Software Engineer';
  if (/\bdeveloper\b/i.test(lower)) return 'Software Developer';

  return null;
}

/**
 * Extract experience level from job title
 */
function extractExperienceLevel(title: string): string {
  const lower = title.toLowerCase();

  if (/\b(junior|jr\.?|entry|intern)\b/i.test(lower)) return 'Junior';
  if (/\b(senior|sr\.?|staff|principal)\b/i.test(lower)) return 'Senior';
  if (/\b(lead|manager|director|head)\b/i.test(lower)) return 'Lead';

  return 'Mid-level';
}

/**
 * Determine which skills are trending (increasing in demand)
 */
function determineTrendingSkills(
  currentSkills: [string, number][],
  previousDemand?: Record<string, number>
): string[] {
  if (!previousDemand) {
    // No previous data - return top 10 skills as "trending"
    return currentSkills.slice(0, 10).map(([skill]) => skill);
  }

  // Calculate growth rate for each skill
  const growth: [string, number][] = currentSkills.map(([skill, count]) => {
    const prevCount = previousDemand[skill] || 0;
    const growthRate = prevCount > 0 ? (count - prevCount) / prevCount : count > 5 ? 1 : 0;
    return [skill, growthRate];
  });

  // Sort by growth rate and return top growers
  return growth
    .filter(([, rate]) => rate > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([skill]) => skill);
}

/**
 * Count jobs by source
 */
function countJobsBySources(jobs: NormalizedJob[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const job of jobs) {
    counts[job.source] = (counts[job.source] || 0) + 1;
  }
  return counts;
}

// ============================================================================
// AI-Powered Market Analysis (More Agentic)
// ============================================================================

/**
 * Generate AI-powered market analysis summary
 * This provides human-readable insights for the dashboard
 */
export async function generateMarketAnalysisWithAI(
  insights: MarketInsightsData
): Promise<{
  summary: string;
  opportunities: string[];
  recommendations: string[];
}> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return {
      summary: `Analyzed ${insights.total_jobs} jobs. Top skills: ${insights.trending_skills.slice(0, 5).join(', ')}.`,
      opportunities: insights.trending_roles.slice(0, 3),
      recommendations: ['Focus on trending skills', 'Consider remote opportunities'],
    };
  }

  try {
    const openai = new OpenAI({ apiKey: openaiKey });

    const prompt = `Analyze this job market data and provide actionable insights:

Total Jobs Analyzed: ${insights.total_jobs}
Remote Jobs: ${insights.remote_percentage}%

Top Skills in Demand:
${Object.entries(insights.skill_demand)
  .slice(0, 15)
  .map(([skill, count]) => `- ${skill}: ${count} jobs`)
  .join('\n')}

Trending Roles:
${insights.trending_roles.slice(0, 10).join(', ')}

Salary Ranges:
${Object.entries(insights.salary_ranges)
  .map(([level, range]) => `- ${level}: $${Math.round(range.avg / 1000)}k avg`)
  .join('\n')}

Provide:
1. A 2-3 sentence market summary
2. 3 specific opportunities for job seekers
3. 3 actionable recommendations for skill development

Respond in JSON format:
{
  "summary": "...",
  "opportunities": ["...", "...", "..."],
  "recommendations": ["...", "...", "..."]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a career coach analyzing job market trends. Be specific and actionable.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response');

    return JSON.parse(content);
  } catch (error) {
    console.error('[Market Analyzer] AI analysis failed:', error);
    return {
      summary: `Analyzed ${insights.total_jobs} jobs. Top skills: ${insights.trending_skills.slice(0, 5).join(', ')}.`,
      opportunities: insights.trending_roles.slice(0, 3),
      recommendations: ['Focus on trending skills', 'Consider remote opportunities'],
    };
  }
}

/**
 * Detect significant market shifts that should trigger roadmap re-pathing
 */
export function detectMarketShifts(
  current: MarketInsightsData,
  previous: MarketInsightsData
): {
  hasSignificantShift: boolean;
  shifts: Array<{
    type: 'skill_surge' | 'skill_decline' | 'new_role' | 'salary_change';
    description: string;
    impact: 'high' | 'medium' | 'low';
  }>;
} {
  const shifts: Array<{
    type: 'skill_surge' | 'skill_decline' | 'new_role' | 'salary_change';
    description: string;
    impact: 'high' | 'medium' | 'low';
  }> = [];

  // Check for skill surges (>50% increase)
  for (const [skill, count] of Object.entries(current.skill_demand)) {
    const prevCount = previous.skill_demand[skill] || 0;
    if (prevCount > 0 && count > prevCount * 1.5) {
      shifts.push({
        type: 'skill_surge',
        description: `${skill} demand increased by ${Math.round(((count - prevCount) / prevCount) * 100)}%`,
        impact: count > 50 ? 'high' : 'medium',
      });
    }
  }

  // Check for skill declines (>30% decrease)
  for (const [skill, prevCount] of Object.entries(previous.skill_demand)) {
    const currentCount = current.skill_demand[skill] || 0;
    if (prevCount > 10 && currentCount < prevCount * 0.7) {
      shifts.push({
        type: 'skill_decline',
        description: `${skill} demand decreased by ${Math.round(((prevCount - currentCount) / prevCount) * 100)}%`,
        impact: prevCount > 50 ? 'high' : 'low',
      });
    }
  }

  // Check for new trending roles
  for (const role of current.trending_roles) {
    if (!previous.trending_roles.includes(role)) {
      shifts.push({
        type: 'new_role',
        description: `${role} emerged as a trending role`,
        impact: 'medium',
      });
    }
  }

  return {
    hasSignificantShift: shifts.some((s) => s.impact === 'high'),
    shifts,
  };
}
