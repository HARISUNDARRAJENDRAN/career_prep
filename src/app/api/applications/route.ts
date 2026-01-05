import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { jobApplications, applicationDocuments, jobListings } from '@/drizzle/schema';
import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withArcjetProtection } from '@/lib/arcjet';

/**
 * GET /api/applications
 * List user's applications with pagination and filtering
 */
export async function GET(request: NextRequest) {
  // Apply Arcjet protection
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const status = searchParams.get('status'); // comma-separated statuses
    const sort = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') || 'desc';

    // Build conditions
    const conditions = [eq(jobApplications.user_id, userId)];

    if (status) {
      const statuses = status.split(',').filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(
          inArray(
            jobApplications.status,
            statuses as Array<'draft' | 'applied' | 'interviewing' | 'offered' | 'rejected' | 'ghosted'>
          )
        );
      }
    }

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobApplications)
      .where(and(...conditions));

    // Get applications with related data
    const offset = (page - 1) * limit;
    const applications = await db.query.jobApplications.findMany({
      where: and(...conditions),
      with: {
        document: true,
        jobListing: true,
      },
      orderBy: order === 'desc'
        ? [desc(jobApplications.created_at)]
        : [jobApplications.created_at],
      limit,
      offset,
    });

    // Format response
    const formattedApplications = applications.map((app) => ({
      id: app.id,
      company: app.company,
      role: app.role,
      location: app.location,
      status: app.status,
      match_score: (app.raw_data as { match_score?: number })?.match_score,
      applied_at: app.applied_at,
      created_at: app.created_at,
      last_activity_at: app.last_activity_at,
      has_cover_letter: !!app.document,
      job_listing: app.jobListing
        ? {
            id: app.jobListing.id,
            source: app.jobListing.source,
            application_url: (app.jobListing.raw_data as { application_url?: string })?.application_url,
          }
        : null,
    }));

    return NextResponse.json({
      applications: formattedApplications,
      pagination: {
        page,
        limit,
        total: count,
        total_pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error('[Applications API] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/applications
 * Create a new application (manual)
 */
const createApplicationSchema = z.object({
  job_listing_id: z.string().optional(),
  company: z.string().min(1),
  role: z.string().min(1),
  location: z.string().optional(),
  status: z.enum(['draft', 'applied']).default('draft'),
  job_description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  // Apply Arcjet protection
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validationResult = createApplicationSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Create application
    const [application] = await db
      .insert(jobApplications)
      .values({
        user_id: userId,
        job_listing_id: data.job_listing_id || null,
        company: data.company,
        role: data.role,
        location: data.location || null,
        status: data.status,
        applied_at: data.status === 'applied' ? new Date() : null,
        last_activity_at: new Date(),
        raw_data: {
          job_description: data.job_description,
        },
      })
      .returning();

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    console.error('[Applications API] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
