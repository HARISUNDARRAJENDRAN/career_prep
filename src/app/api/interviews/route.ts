import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { withArcjetProtection } from '@/lib/arcjet';

/**
 * GET /api/interviews
 * List all interviews for the authenticated user
 */
export async function GET(request: NextRequest) {
  // Apply Arcjet protection (rate limiting, bot detection, shield)
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userInterviews = await db.query.interviews.findMany({
      where: eq(interviews.user_id, userId),
      orderBy: [desc(interviews.created_at)],
    });

    return NextResponse.json({ interviews: userInterviews });
  } catch (error) {
    console.error('[Interviews API] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/interviews
 * Create a new interview
 */
const createInterviewSchema = z.object({
  type: z.enum(['reality_check', 'weekly_sprint']),
  scheduled_at: z.string().datetime().optional(),
});

export async function POST(request: NextRequest) {
  // Apply Arcjet protection (rate limiting, bot detection, shield)
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validationResult = createInterviewSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { type, scheduled_at } = validationResult.data;

    const [newInterview] = await db
      .insert(interviews)
      .values({
        user_id: userId,
        type,
        status: 'scheduled',
        scheduled_at: scheduled_at ? new Date(scheduled_at) : new Date(),
      })
      .returning();

    return NextResponse.json({ interview: newInterview }, { status: 201 });
  } catch (error) {
    console.error('[Interviews API] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
