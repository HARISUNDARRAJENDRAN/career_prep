import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const startInterviewSchema = z.object({
  hume_session_id: z.string().min(1).optional(),
});

/**
 * POST /api/interviews/[id]/start
 * Mark an interview as started and record the Hume session ID
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Parse request body
    let humeSessionId: string | undefined;
    try {
      const body = await req.json();
      const validationResult = startInterviewSchema.safeParse(body);
      if (validationResult.success) {
        humeSessionId = validationResult.data.hume_session_id;
      }
    } catch {
      // Body parsing failed, continue without session ID
    }

    // Verify interview belongs to user
    const interview = await db.query.interviews.findFirst({
      where: and(eq(interviews.id, id), eq(interviews.user_id, userId)),
    });

    if (!interview) {
      return NextResponse.json(
        { error: 'Interview not found' },
        { status: 404 }
      );
    }

    if (interview.status === 'completed') {
      return NextResponse.json(
        { error: 'Interview already completed' },
        { status: 400 }
      );
    }

    // If already in progress, just return the interview
    if (interview.status === 'in_progress') {
      return NextResponse.json({ interview });
    }

    // Update interview status
    const [updated] = await db
      .update(interviews)
      .set({
        status: 'in_progress',
        hume_session_id: humeSessionId || `session_${Date.now()}`,
        started_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(interviews.id, id))
      .returning();

    return NextResponse.json({ interview: updated });
  } catch (error) {
    console.error('[Interviews Start API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
