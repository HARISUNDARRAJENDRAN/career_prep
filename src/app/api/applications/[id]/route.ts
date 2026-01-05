import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { jobApplications, applicationDocuments } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withArcjetProtection } from '@/lib/arcjet';
import { publishAgentEvent } from '@/lib/agents/message-bus';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/applications/[id]
 * Get a single application with full details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  // Apply Arcjet protection
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const application = await db.query.jobApplications.findFirst({
      where: and(
        eq(jobApplications.id, id),
        eq(jobApplications.user_id, userId)
      ),
      with: {
        document: true,
        jobListing: true,
      },
    });

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    return NextResponse.json({
      application: {
        id: application.id,
        company: application.company,
        role: application.role,
        location: application.location,
        status: application.status,
        applied_at: application.applied_at,
        created_at: application.created_at,
        last_activity_at: application.last_activity_at,
        raw_data: application.raw_data,
        document: application.document
          ? {
              id: application.document.id,
              type: application.document.type,
              name: application.document.name,
              version: application.document.version,
              metadata: application.document.metadata,
            }
          : null,
        job_listing: application.jobListing
          ? {
              id: application.jobListing.id,
              title: application.jobListing.title,
              company: application.jobListing.company,
              location: application.jobListing.location,
              source: application.jobListing.source,
              skills_required: application.jobListing.skills_required,
              application_url: (application.jobListing.raw_data as { application_url?: string })?.application_url,
              description: (application.jobListing.raw_data as { description?: string })?.description,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('[Application API] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/applications/[id]
 * Update application status or details
 */
const updateApplicationSchema = z.object({
  status: z.enum(['draft', 'applied', 'interviewing', 'offered', 'rejected', 'ghosted']).optional(),
  notes: z.string().optional(),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  // Apply Arcjet protection
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if application exists
    const existing = await db.query.jobApplications.findFirst({
      where: and(
        eq(jobApplications.id, id),
        eq(jobApplications.user_id, userId)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const body = await request.json();
    const validationResult = updateApplicationSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;
    const updates: Record<string, unknown> = {
      updated_at: new Date(),
      last_activity_at: new Date(),
    };

    // Handle status change
    if (data.status) {
      updates.status = data.status;

      // If changing to 'applied', set applied_at
      if (data.status === 'applied' && existing.status === 'draft') {
        updates.applied_at = new Date();

        // Publish APPLICATION_SUBMITTED event
        await publishAgentEvent({
          type: 'APPLICATION_SUBMITTED',
          payload: {
            application_id: id,
            user_id: userId,
            job_listing_id: existing.job_listing_id,
            method: 'manual',
            match_score: (existing.raw_data as { match_score?: number })?.match_score || 0,
          },
        });
      }

      // If changing to 'rejected', publish event for Strategist
      if (data.status === 'rejected') {
        await publishAgentEvent({
          type: 'REJECTION_PARSED',
          payload: {
            application_id: id,
            user_id: userId,
            gaps: [],
            recommended_skills: [],
            rejection_reason: data.notes,
          },
        });
      }
    }

    // Handle notes
    if (data.notes) {
      const existingRawData = (existing.raw_data || {}) as Record<string, unknown>;
      updates.raw_data = {
        ...existingRawData,
        interview_notes: data.notes,
      };
    }

    // Update application
    const [updated] = await db
      .update(jobApplications)
      .set(updates)
      .where(eq(jobApplications.id, id))
      .returning();

    return NextResponse.json({
      message: 'Application updated',
      application: updated,
    });
  } catch (error) {
    console.error('[Application API] PATCH Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/applications/[id]
 * Delete an application
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  // Apply Arcjet protection
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if application exists
    const existing = await db.query.jobApplications.findFirst({
      where: and(
        eq(jobApplications.id, id),
        eq(jobApplications.user_id, userId)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    // Delete associated document if exists
    if (existing.document_id) {
      await db
        .delete(applicationDocuments)
        .where(eq(applicationDocuments.id, existing.document_id));
    }

    // Delete application
    await db.delete(jobApplications).where(eq(jobApplications.id, id));

    return NextResponse.json({ message: 'Application deleted' });
  } catch (error) {
    console.error('[Application API] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
