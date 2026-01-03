import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { publishAgentEvent } from '@/lib/agents/message-bus';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const transcriptEntrySchema = z.object({
  speaker: z.enum(['user', 'agent']),
  text: z.string(),
  timestamp: z.string(),
  emotions: z.record(z.string(), z.number()).optional(),
});

const completeInterviewSchema = z.object({
  transcript: z.array(transcriptEntrySchema),
  emotion_summary: z.record(z.string(), z.number()).optional(),
  duration_seconds: z.number().int().positive(),
});

/**
 * POST /api/interviews/[id]/complete
 * Complete an interview, save the transcript, and trigger analysis
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const validationResult = completeInterviewSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verify interview belongs to user and is in progress
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

    if (interview.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Interview is not in progress' },
        { status: 400 }
      );
    }

    // Update interview with transcript and mark as completed
    const [updated] = await db
      .update(interviews)
      .set({
        status: 'completed',
        duration_seconds: data.duration_seconds,
        raw_data: {
          transcript: data.transcript,
          emotion_summary: data.emotion_summary,
        },
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(interviews.id, id))
      .returning();

    // Publish event for post-interview analysis (Phase 5.5)
    try {
      await publishAgentEvent({
        type: 'INTERVIEW_COMPLETED',
        payload: {
          interview_id: id,
          user_id: userId,
          duration_minutes: Math.round(data.duration_seconds / 60),
          interview_type: interview.type,
        },
      });
      console.log(`[Interviews Complete API] Published INTERVIEW_COMPLETED event for ${id}`);
    } catch (eventError) {
      // Log but don't fail the request if event publishing fails
      console.error('[Interviews Complete API] Failed to publish event:', eventError);
    }

    return NextResponse.json({ interview: updated });
  } catch (error) {
    console.error('[Interviews Complete API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
