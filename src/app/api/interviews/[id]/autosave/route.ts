import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
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

const autosaveInterviewSchema = z.object({
  transcript: z.array(transcriptEntrySchema),
  emotion_summary: z.record(z.string(), z.number()).optional(),
  duration_seconds: z.number().int().nonnegative(),
});

/**
 * PATCH /api/interviews/[id]/autosave
 * Auto-save interview transcript without completing the interview.
 * Used for periodic saves during the session to prevent data loss.
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const validationResult = autosaveInterviewSchema.safeParse(body);
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

    // Only allow autosave for in_progress interviews
    if (interview.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Interview is not in progress' },
        { status: 400 }
      );
    }

    // Get existing raw_data and merge with new transcript
    const existingRawData = (interview.raw_data as Record<string, unknown>) || {};

    // Update interview with latest transcript (auto-save, not complete)
    const [updated] = await db
      .update(interviews)
      .set({
        duration_seconds: data.duration_seconds,
        raw_data: {
          ...existingRawData,
          transcript: data.transcript,
          emotion_summary: data.emotion_summary,
          last_autosave_at: new Date().toISOString(),
        },
        updated_at: new Date(),
      })
      .where(eq(interviews.id, id))
      .returning();

    console.log(`[Interviews Autosave API] Auto-saved transcript for interview ${id} (${data.transcript.length} messages)`);

    return NextResponse.json({
      success: true,
      interview: {
        id: updated.id,
        status: updated.status,
        duration_seconds: updated.duration_seconds,
      }
    });
  } catch (error) {
    console.error('[Interviews Autosave API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
