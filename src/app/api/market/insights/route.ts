/**
 * Market Insights API
 *
 * GET /api/market/insights - Fetch latest market insights from Sentinel Agent
 */

import { NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { marketInsights, jobListings } from '@/drizzle/schema';
import { desc, eq, sql, gt } from 'drizzle-orm';

export async function GET() {
  try {
    // Get the latest market summary
    const latestInsight = await db.query.marketInsights.findFirst({
      where: eq(marketInsights.skill_name, 'market_summary'),
      orderBy: [desc(marketInsights.analyzed_at)],
    });

    // Get total active job count
    const [{ count: totalJobs }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobListings)
      .where(gt(jobListings.expires_at, new Date()));

    // Get job count by source
    const sourceBreakdown = await db
      .select({
        source: jobListings.source,
        count: sql<number>`count(*)`,
      })
      .from(jobListings)
      .where(gt(jobListings.expires_at, new Date()))
      .groupBy(jobListings.source);

    // Get remote job count
    const [{ count: remoteCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobListings)
      .where(
        sql`${jobListings.raw_data}->>'remote_type' IN ('remote', 'hybrid')
            AND ${jobListings.expires_at} > NOW()`
      );

    // Get top skills from job listings
    const skillsQuery = await db.execute(sql`
      SELECT skill, COUNT(*) as count
      FROM job_listings, unnest(skills_required) as skill
      WHERE expires_at > NOW()
      GROUP BY skill
      ORDER BY count DESC
      LIMIT 15
    `);

    const topSkills = (skillsQuery.rows as Array<{ skill: string; count: string }>).map(
      (row) => ({
        name: row.skill,
        count: parseInt(row.count),
      })
    );

    // Get top companies
    const companiesQuery = await db
      .select({
        company: jobListings.company,
        count: sql<number>`count(*)`,
      })
      .from(jobListings)
      .where(gt(jobListings.expires_at, new Date()))
      .groupBy(jobListings.company)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    // Parse raw_data from the latest insight
    const rawData = latestInsight?.raw_data as {
      trending_skills?: string[];
      trending_roles?: string[];
      salary_ranges?: Record<string, { min: number; max: number; avg: number }>;
      market_shifts?: Array<{ type: string; description: string; impact: string }>;
      remote_percentage?: number;
      scrape_date?: string;
    } | null;

    // Get latest GitHub velocity data
    const githubVelocityInsight = await db.query.marketInsights.findFirst({
      where: eq(marketInsights.skill_name, 'github_velocity'),
      orderBy: [desc(marketInsights.analyzed_at)],
    });

    const githubData = githubVelocityInsight?.raw_data as {
      trending_repos?: Array<{
        name: string;
        full_name: string;
        description: string | null;
        url: string;
        stars: number;
        language: string | null;
      }>;
      language_trends?: Array<{
        language: string;
        repos_count: number;
        total_stars: number;
      }>;
      tech_velocity?: Array<{
        name: string;
        category: string;
        velocity_score: number;
        trend: string;
      }>;
      tech_correlations?: Array<{
        skill: string;
        job_demand: number;
        github_velocity: number;
        correlation: string;
        recommendation: string;
      }>;
      scraped_at?: string;
    } | null;

    return NextResponse.json({
      summary: {
        total_jobs: Number(totalJobs),
        remote_jobs: Number(remoteCount),
        remote_percentage: totalJobs > 0
          ? Math.round((Number(remoteCount) / Number(totalJobs)) * 100)
          : 0,
        last_updated: latestInsight?.analyzed_at || null,
        sources: Object.fromEntries(
          sourceBreakdown.map((s) => [s.source, Number(s.count)])
        ),
      },
      trending_skills: rawData?.trending_skills || topSkills.map((s) => s.name),
      skill_demand: topSkills,
      trending_roles: rawData?.trending_roles || [],
      salary_ranges: rawData?.salary_ranges || {},
      top_companies: companiesQuery.map((c) => ({
        name: c.company,
        jobs: Number(c.count),
      })),
      market_shifts: rawData?.market_shifts || [],
      // GitHub Velocity Data
      github_velocity: githubData ? {
        trending_repos: githubData.trending_repos?.slice(0, 5) || [],
        language_trends: githubData.language_trends?.slice(0, 10) || [],
        tech_velocity: githubData.tech_velocity?.slice(0, 15) || [],
        tech_correlations: githubData.tech_correlations?.slice(0, 10) || [],
        last_updated: githubVelocityInsight?.analyzed_at || null,
      } : null,
    });
  } catch (error) {
    console.error('[Market Insights API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market insights' },
      { status: 500 }
    );
  }
}
