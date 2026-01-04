/**
 * Job Listings API
 *
 * GET /api/jobs/listings - Fetch job listings with optional user matching
 *
 * Query params:
 * - limit: number (default 20)
 * - offset: number (default 0)
 * - search: string (optional search query)
 * - remote: 'true' | 'false' (filter remote jobs)
 * - withMatching: 'true' | 'false' (include user match scores)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { jobListings, userSkills } from '@/drizzle/schema';
import { desc, sql, and, or, ilike, eq, gt } from 'drizzle-orm';
import {
  matchUserToJobs,
  type UserSkillProfile,
  type NormalizedJob,
} from '@/services/job-scraper';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');
  const search = searchParams.get('search') || '';
  const remoteOnly = searchParams.get('remote') === 'true';
  const withMatching = searchParams.get('withMatching') === 'true';

  try {
    // Build query conditions
    const conditions = [];

    // Only show non-expired jobs
    conditions.push(gt(jobListings.expires_at, new Date()));

    // Search filter
    if (search) {
      conditions.push(
        or(
          ilike(jobListings.title, `%${search}%`),
          ilike(jobListings.company, `%${search}%`),
          sql`${jobListings.skills_required}::text ILIKE ${`%${search}%`}`
        )
      );
    }

    // Remote filter
    if (remoteOnly) {
      conditions.push(
        sql`${jobListings.raw_data}->>'remote_type' IN ('remote', 'hybrid')`
      );
    }

    // Fetch jobs
    const jobs = await db
      .select({
        id: jobListings.id,
        external_id: jobListings.external_id,
        source: jobListings.source,
        title: jobListings.title,
        company: jobListings.company,
        location: jobListings.location,
        salary_range: jobListings.salary_range,
        skills_required: jobListings.skills_required,
        scraped_at: jobListings.scraped_at,
        raw_data: jobListings.raw_data,
      })
      .from(jobListings)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(jobListings.scraped_at))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobListings)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    // If withMatching is requested and user is authenticated, calculate match scores
    let jobsWithMatching = jobs.map((job) => ({
      ...job,
      match_score: null as number | null,
      matching_skills: [] as string[],
      missing_skills: [] as string[],
    }));

    if (withMatching) {
      const { userId } = await auth();

      if (userId) {
        // Fetch user skills
        const userSkillsData = await db.query.userSkills.findMany({
          where: eq(userSkills.user_id, userId),
          with: { skill: true },
        });

        if (userSkillsData.length > 0) {
          // Build user profile for matching
          const userProfile: UserSkillProfile = {
            user_id: userId,
            skills: userSkillsData.map((us) => ({
              name: us.skill?.name || 'Unknown',
              proficiency_level: us.proficiency_level,
              is_verified: !!us.verification_metadata?.is_verified,
            })),
            target_roles: [], // Could fetch from user profile if needed
          };

          // Convert DB jobs to NormalizedJob format for matching
          const normalizedJobs: NormalizedJob[] = jobs.map((job) => ({
            external_id: job.external_id,
            source: job.source as 'jooble' | 'adzuna',
            title: job.title,
            company: job.company,
            location: job.location || '',
            description: (job.raw_data as any)?.description || '',
            salary_min: (job.raw_data as any)?.salary_min || null,
            salary_max: (job.raw_data as any)?.salary_max || null,
            salary_range: job.salary_range,
            job_type: (job.raw_data as any)?.job_type || null,
            remote_type: (job.raw_data as any)?.remote_type || null,
            application_url: (job.raw_data as any)?.application_url || '',
            required_skills: job.skills_required || [],
            posted_at: job.scraped_at,
            expires_at: new Date(),
          }));

          // Get matches
          const matches = matchUserToJobs(userProfile, normalizedJobs, {
            minMatchScore: 0,
            maxResults: limit,
          });

          // Create a map of external_id to match result
          const matchMap = new Map(
            matches.map((m) => [m.job.external_id, m])
          );

          // Merge match data with jobs
          jobsWithMatching = jobs.map((job) => {
            const match = matchMap.get(job.external_id);
            return {
              ...job,
              match_score: match?.match_score || null,
              matching_skills: match?.matching_skills || [],
              missing_skills: match?.missing_skills || [],
            };
          });

          // Sort by match score if we have matching data
          jobsWithMatching.sort((a, b) =>
            (b.match_score || 0) - (a.match_score || 0)
          );
        }
      }
    }

    return NextResponse.json({
      jobs: jobsWithMatching,
      pagination: {
        total: Number(count),
        limit,
        offset,
        hasMore: offset + limit < Number(count),
      },
    });
  } catch (error) {
    console.error('[Job Listings API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job listings' },
      { status: 500 }
    );
  }
}
