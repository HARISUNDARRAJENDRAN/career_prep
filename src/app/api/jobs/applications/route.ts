import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { jobApplications, jobListings, applicationDocuments } from '@/drizzle/schema';
import { eq, desc, and } from 'drizzle-orm';
import { z } from 'zod';

// Schema for creating a new job application
const createApplicationSchema = z.object({
  company: z.string().min(1).max(255),
  role: z.string().min(1).max(255),
  location: z.string().max(255).optional(),
  job_listing_id: z.string().optional(), // Link to scraped job listing
  document_id: z.string().optional(), // Link to resume version used
  status: z.enum(['draft', 'applied', 'interviewing', 'offered', 'rejected', 'ghosted']).optional(),
  raw_data: z.object({
    job_description: z.string().optional(),
    match_score: z.number().optional(),
    agent_reasoning: z.string().optional(),
  }).optional(),
});

// Schema for updating an application
const updateApplicationSchema = z.object({
  status: z.enum(['draft', 'applied', 'interviewing', 'offered', 'rejected', 'ghosted']).optional(),
  raw_data: z.object({
    job_description: z.string().optional(),
    match_score: z.number().optional(),
    agent_reasoning: z.string().optional(),
    email_threads: z.array(z.object({
      date: z.string(),
      from: z.string(),
      subject: z.string(),
      body: z.string(),
    })).optional(),
    interview_notes: z.string().optional(),
  }).optional(),
});

/**
 * GET /api/jobs/applications
 * List all job applications for the current user
 * Supports filtering by status via ?status=applied
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where conditions
    const conditions = [eq(jobApplications.user_id, userId)];
    if (status) {
      conditions.push(eq(jobApplications.status, status as any));
    }

    const applications = await db.query.jobApplications.findMany({
      where: and(...conditions),
      orderBy: [desc(jobApplications.created_at)],
      with: {
        jobListing: true,
        document: true,
      },
      limit,
      offset,
    });

    // Calculate stats
    const allApplications = await db.query.jobApplications.findMany({
      where: eq(jobApplications.user_id, userId),
    });

    const stats = {
      total: allApplications.length,
      by_status: {
        draft: allApplications.filter(a => a.status === 'draft').length,
        applied: allApplications.filter(a => a.status === 'applied').length,
        interviewing: allApplications.filter(a => a.status === 'interviewing').length,
        offered: allApplications.filter(a => a.status === 'offered').length,
        rejected: allApplications.filter(a => a.status === 'rejected').length,
        ghosted: allApplications.filter(a => a.status === 'ghosted').length,
      },
      this_month: allApplications.filter(a => {
        const createdAt = new Date(a.created_at);
        const now = new Date();
        return createdAt.getMonth() === now.getMonth() && 
               createdAt.getFullYear() === now.getFullYear();
      }).length,
    };

    return NextResponse.json({
      applications,
      stats,
      pagination: {
        limit,
        offset,
        total: applications.length,
      },
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/jobs/applications
 * Create a new job application
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validationResult = createApplicationSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verify job listing exists if provided
    if (data.job_listing_id) {
      const listing = await db.query.jobListings.findFirst({
        where: eq(jobListings.id, data.job_listing_id),
      });

      if (!listing) {
        return NextResponse.json(
          { error: 'Job listing not found' },
          { status: 404 }
        );
      }
    }

    // Verify document exists if provided
    if (data.document_id) {
      const document = await db.query.applicationDocuments.findFirst({
        where: and(
          eq(applicationDocuments.id, data.document_id),
          eq(applicationDocuments.user_id, userId)
        ),
      });

      if (!document) {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        );
      }
    }

    const [newApplication] = await db.insert(jobApplications).values({
      user_id: userId,
      company: data.company,
      role: data.role,
      location: data.location,
      job_listing_id: data.job_listing_id,
      document_id: data.document_id,
      status: data.status || 'draft',
      raw_data: data.raw_data,
      applied_at: data.status === 'applied' ? new Date() : null,
    }).returning();

    return NextResponse.json({
      message: 'Application created',
      application: newApplication,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating application:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/jobs/applications
 * Update an existing job application (requires ?id=xxx query param)
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get('id');

    if (!applicationId) {
      return NextResponse.json(
        { error: 'id query parameter is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const existingApplication = await db.query.jobApplications.findFirst({
      where: and(
        eq(jobApplications.id, applicationId),
        eq(jobApplications.user_id, userId)
      ),
    });

    if (!existingApplication) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validationResult = updateApplicationSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Merge raw_data if provided
    const updatedRawData = data.raw_data
      ? { ...existingApplication.raw_data, ...data.raw_data }
      : existingApplication.raw_data;

    // Set applied_at if status changes to 'applied'
    const appliedAt = data.status === 'applied' && existingApplication.status !== 'applied'
      ? new Date()
      : existingApplication.applied_at;

    const [updatedApplication] = await db
      .update(jobApplications)
      .set({
        status: data.status || existingApplication.status,
        raw_data: updatedRawData,
        applied_at: appliedAt,
        last_activity_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(jobApplications.id, applicationId))
      .returning();

    return NextResponse.json({
      message: 'Application updated',
      application: updatedApplication,
    });
  } catch (error) {
    console.error('Error updating application:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

