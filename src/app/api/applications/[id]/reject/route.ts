/**
 * Reject Application API
 *
 * Rejects/deletes a draft application.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { jobApplications } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';

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

    // Delete the draft application
    const [deleted] = await db
      .delete(jobApplications)
      .where(
        and(
          eq(jobApplications.id, id),
          eq(jobApplications.user_id, userId),
          eq(jobApplications.status, 'draft')
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: 'Application not found or already processed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      application_id: id,
      deleted: true,
    });
  } catch (error) {
    console.error('[Reject Application] Error:', error);
    return NextResponse.json(
      { error: 'Failed to reject application' },
      { status: 500 }
    );
  }
}
