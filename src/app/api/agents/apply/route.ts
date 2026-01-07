/**
 * Manual Apply API Route
 *
 * Allows users to trigger browser automation for a specific job listing.
 * This is the API endpoint for the "Auto Apply" button in the UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { jobListings, jobApplications, applicationDocuments } from '@/drizzle/schema';
import { eq, and, sql } from 'drizzle-orm';
import { executeActionTool } from '@/lib/agents/agents/action';
import { generateCoverLetter } from '@/services/cover-letter';
import { checkDirectivesForOperation } from '@/lib/agents/utils/directive-checker';
import { broadcastApplicationProgress, broadcastToUser } from '@/services/realtime';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { job_listing_id } = body;

  if (!job_listing_id) {
    return NextResponse.json({ error: 'job_listing_id required' }, { status: 400 });
  }

  try {
    // Check for blocking directives first
    const directiveCheck = await checkDirectivesForOperation({
      userId,
      agentType: 'action',
      operation: 'apply',
    });

    if (directiveCheck.blocked && directiveCheck.directive) {
      return NextResponse.json(
        {
          error: 'Blocked by directive',
          directive_id: directiveCheck.directive.id,
          directive_title: directiveCheck.directive.title,
          reason: directiveCheck.reason,
          action_required: directiveCheck.requiredAction,
        },
        { status: 403 }
      );
    }

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
          error: 'Already applied',
          application_id: existing.id,
        },
        { status: 409 }
      );
    }

    // Broadcast that we're starting
    broadcastApplicationProgress(userId, {
      applicationId: 'pending',
      stage: 'navigating',
      progress: 5,
      message: 'Generating cover letter...',
      company: job.company,
      role: job.title,
    });

    // Generate cover letter
    const coverLetter = await generateCoverLetter({
      userId,
      jobListingId: job_listing_id,
      matchingSkills: [],
      missingSkills: [],
      matchScore: 80,
    });

    // Create cover letter document
    const [coverLetterDoc] = await db
      .insert(applicationDocuments)
      .values({
        user_id: userId,
        type: 'cover_letter',
        version: 1,
        name: `Cover Letter - ${job.company} - ${job.title}`,
        metadata: {
          target_role: job.title,
          last_modified_by: 'agent',
        },
      })
      .returning();

    // Create application record
    const [application] = await db
      .insert(jobApplications)
      .values({
        user_id: userId,
        job_listing_id,
        document_id: coverLetterDoc.id,
        company: job.company,
        role: job.title,
        location: job.location,
        status: 'draft',
        raw_data: {
          source: 'manual_auto_apply',
          job_description: (job.raw_data as { description?: string })?.description,
        },
      })
      .returning();

    // Broadcast progress
    broadcastApplicationProgress(userId, {
      applicationId: application.id,
      stage: 'navigating',
      progress: 20,
      message: 'Starting browser automation...',
      company: job.company,
      role: job.title,
    });

    // Execute browser automation
    const result = await executeActionTool<{
      status: string;
      message: string;
      screenshot_url?: string;
      fields_filled: number;
      fields_missing: string[];
    }>('submit_application', {
      user_id: userId,
      job_listing_id,
      application_id: application.id,
      cover_letter: coverLetter.coverLetter,
      dry_run: false,
    });

    // Update application based on result
    if (result.status === 'success') {
      await db
        .update(jobApplications)
        .set({
          status: 'applied',
          applied_at: new Date(),
          last_activity_at: new Date(),
          raw_data: sql`COALESCE(raw_data, '{}'::jsonb) || ${JSON.stringify({
            automation: {
              status: 'success',
              screenshot_url: result.screenshot_url,
              fields_filled: result.fields_filled,
              submitted_at: new Date().toISOString(),
            },
          })}::jsonb`,
        })
        .where(eq(jobApplications.id, application.id));

      // Broadcast success
      broadcastToUser({
        type: 'application_submitted',
        user_id: userId,
        data: {
          status: 'success',
          application_id: application.id,
          screenshot_url: result.screenshot_url,
          company: job.company,
          role: job.title,
        },
      });
    } else {
      // Update as draft with automation data
      await db
        .update(jobApplications)
        .set({
          status: 'draft',
          last_activity_at: new Date(),
          raw_data: sql`COALESCE(raw_data, '{}'::jsonb) || ${JSON.stringify({
            automation: {
              status: result.status,
              message: result.message,
              screenshot_url: result.screenshot_url,
              fields_filled: result.fields_filled,
              fields_missing: result.fields_missing,
              attempted_at: new Date().toISOString(),
            },
          })}::jsonb`,
        })
        .where(eq(jobApplications.id, application.id));

      // Broadcast draft created
      broadcastToUser({
        type: 'application_draft_created',
        user_id: userId,
        data: {
          status: 'draft',
          application_id: application.id,
          reason: result.message,
          company: job.company,
          role: job.title,
        },
      });
    }

    return NextResponse.json({
      status: result.status,
      application_id: application.id,
      screenshot_url: result.screenshot_url,
      message: result.message,
      fields_filled: result.fields_filled,
      fields_missing: result.fields_missing,
    });
  } catch (error) {
    console.error('[Manual Apply] Error:', error);
    return NextResponse.json(
      {
        error: 'Application failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
