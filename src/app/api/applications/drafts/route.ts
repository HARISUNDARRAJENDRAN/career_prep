/**
 * Draft Applications API
 *
 * Returns draft applications awaiting user approval.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { jobApplications, jobListings } from '@/drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const drafts = await db
      .select({
        id: jobApplications.id,
        company: jobApplications.company,
        role: jobApplications.role,
        location: jobApplications.location,
        created_at: jobApplications.created_at,
        raw_data: jobApplications.raw_data,
        job_listing_id: jobApplications.job_listing_id,
      })
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.user_id, userId),
          eq(jobApplications.status, 'draft')
        )
      )
      .orderBy(desc(jobApplications.created_at));

    // Enrich with job listing data
    const enrichedDrafts = await Promise.all(
      drafts.map(async (draft) => {
        let jobUrl: string | undefined;
        
        if (draft.job_listing_id) {
          const [listing] = await db
            .select({ raw_data: jobListings.raw_data })
            .from(jobListings)
            .where(eq(jobListings.id, draft.job_listing_id))
            .limit(1);
          jobUrl = listing?.raw_data?.application_url || undefined;
        }

        const rawData = draft.raw_data as Record<string, unknown> | null;

        return {
          id: draft.id,
          company: draft.company,
          role: draft.role,
          location: draft.location,
          match_score: rawData?.match_score as number | undefined,
          created_at: draft.created_at.toISOString(),
          job_url: jobUrl || (rawData?.job_url as string | undefined),
          agent_reasoning: rawData?.agent_reasoning as string | undefined,
          resume_version: rawData?.resume_version as string | undefined,
          cover_letter_preview: rawData?.cover_letter as string | undefined,
        };
      })
    );

    return NextResponse.json({ drafts: enrichedDrafts });
  } catch (error) {
    console.error('[Draft Applications] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch draft applications' },
      { status: 500 }
    );
  }
}
