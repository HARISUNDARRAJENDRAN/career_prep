/**
 * Manual Application Tracking API Route
 *
 * Allows users to record applications they completed manually.
 * This creates a tracked application record that the system will monitor
 * for rejections, ghosting, and follow-up opportunities.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { jobListings, jobApplications, applicationDocuments } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { job_listing_id, applied_at, has_confirmation, notes } = body;

  if (!job_listing_id) {
    return NextResponse.json({ error: 'job_listing_id required' }, { status: 400 });
  }

  try {
    // Fetch job listing
    const job = await db.query.jobListings.findFirst({
      where: eq(jobListings.id, job_listing_id),
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Check for existing application
    const existing = await db.query.jobApplications.findFirst({
      where: and(
        eq(jobApplications.user_id, userId),
        eq(jobApplications.job_listing_id, job_listing_id)
      ),
    });

    if (existing) {
      return NextResponse.json(
        {
          error: 'Already tracked',
          application_id: existing.id,
          message: 'This application is already being tracked',
        },
        { status: 409 }
      );
    }

    // Create a placeholder document for manual applications
    const [doc] = await db
      .insert(applicationDocuments)
      .values({
        user_id: userId,
        type: 'resume',
        version: 1,
        name: `Manual Application - ${job.company} - ${job.title}`,
        metadata: {
          target_role: job.title,
          last_modified_by: 'user',
        },
      })
      .returning();

    // Create application record
    const appliedDate = applied_at ? new Date(applied_at) : new Date();

    const [application] = await db
      .insert(jobApplications)
      .values({
        user_id: userId,
        job_listing_id,
        document_id: doc.id,
        company: job.company,
        role: job.title,
        location: job.location,
        status: 'applied',
        applied_at: appliedDate,
        last_activity_at: appliedDate,
        raw_data: {
          source: 'manual_tracking',
          created_by: 'user',
          agent_reasoning: notes || 'Manually tracked application',
          job_description: (job.raw_data as { description?: string })?.description,
          job_url: (job.raw_data as { application_url?: string })?.application_url,
        } as any, // Type assertion needed for extended fields
      })
      .returning();

    return NextResponse.json({
      success: true,
      application_id: application.id,
      message: `Application to ${job.company} is now being tracked`,
      tracking_enabled: {
        ghosting_detection: true,
        rejection_monitoring: true,
        follow_up_reminders: true,
      },
    });
  } catch (error) {
    console.error('[Manual Apply] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to record application',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
