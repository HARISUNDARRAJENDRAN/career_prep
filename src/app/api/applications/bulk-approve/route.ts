/**
 * Bulk Approve Applications API
 *
 * Approves multiple draft applications at once.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { jobApplications } from '@/drizzle/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { publishAgentEvent } from '@/lib/agents/message-bus';

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const applicationIds = body.application_ids as string[];

    if (!applicationIds || applicationIds.length === 0) {
      return NextResponse.json(
        { error: 'No application IDs provided' },
        { status: 400 }
      );
    }

    // Update all draft applications to applied
    const updated = await db
      .update(jobApplications)
      .set({
        status: 'applied',
        applied_at: new Date(),
        updated_at: new Date(),
      })
      .where(
        and(
          inArray(jobApplications.id, applicationIds),
          eq(jobApplications.user_id, userId),
          eq(jobApplications.status, 'draft')
        )
      )
      .returning();

    // Publish events for each approved application
    for (const app of updated) {
      await publishAgentEvent({
        type: 'APPLICATION_SUBMITTED',
        payload: {
          application_id: app.id,
          user_id: userId,
          job_listing_id: app.job_listing_id,
          method: 'manual' as const,
          match_score: app.raw_data?.match_score,
        },
      });
    }

    return NextResponse.json({
      success: true,
      approved_count: updated.length,
      approved_ids: updated.map((a) => a.id),
    });
  } catch (error) {
    console.error('[Bulk Approve] Error:', error);
    return NextResponse.json(
      { error: 'Failed to bulk approve applications' },
      { status: 500 }
    );
  }
}
