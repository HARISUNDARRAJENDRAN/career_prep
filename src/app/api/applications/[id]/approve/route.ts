/**
 * Approve Application API
 *
 * Approves a draft application and submits it.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { jobApplications } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { publishAgentEvent } from '@/lib/agents/message-bus';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const coverLetter = body.cover_letter;

    // First get the current application to preserve raw_data
    const current = await db.query.jobApplications.findFirst({
      where: and(
        eq(jobApplications.id, id),
        eq(jobApplications.user_id, userId),
        eq(jobApplications.status, 'draft')
      ),
    });

    if (!current) {
      return NextResponse.json(
        { error: 'Application not found or already processed' },
        { status: 404 }
      );
    }

    // Merge existing raw_data with approval metadata
    const updatedRawData = {
      ...current.raw_data,
      agent_reasoning: coverLetter 
        ? `${current.raw_data?.agent_reasoning || ''}\n\nCover Letter:\n${coverLetter}`
        : current.raw_data?.agent_reasoning,
    };

    // Update application status
    const [updated] = await db
      .update(jobApplications)
      .set({
        status: 'applied',
        applied_at: new Date(),
        updated_at: new Date(),
        raw_data: updatedRawData,
      })
      .where(
        and(
          eq(jobApplications.id, id),
          eq(jobApplications.user_id, userId)
        )
      )
      .returning();

    // Publish event for Action Agent - application was approved and submitted
    await publishAgentEvent({
      type: 'APPLICATION_SUBMITTED',
      payload: {
        application_id: id,
        user_id: userId,
        job_listing_id: updated.job_listing_id,
        method: 'manual' as const,
        match_score: updated.raw_data?.match_score,
      },
    });

    return NextResponse.json({
      success: true,
      application_id: id,
      status: 'applied',
    });
  } catch (error) {
    console.error('[Approve Application] Error:', error);
    return NextResponse.json(
      { error: 'Failed to approve application' },
      { status: 500 }
    );
  }
}
