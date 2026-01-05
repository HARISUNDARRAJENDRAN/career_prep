import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/interviews/[id]/status
 * Check if interview analysis is complete
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Fetch the interview
    const interview = await db.query.interviews.findFirst({
      where: and(eq(interviews.id, id), eq(interviews.user_id, userId)),
    });

    if (!interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    }

    // Check if analysis is present
    const rawData = interview.raw_data as {
      analysis?: Record<string, unknown>;
      transcript?: unknown[];
    } | null;

    const hasAnalysis = !!(rawData?.analysis && Object.keys(rawData.analysis).length > 0);
    const hasTranscript = !!(rawData?.transcript && rawData.transcript.length > 0);

    return NextResponse.json({
      status: interview.status,
      has_analysis: hasAnalysis,
      has_transcript: hasTranscript,
      overall_score: interview.overall_score,
      completed_at: interview.completed_at?.toISOString(),
    });
  } catch (error) {
    console.error('[Interviews Status API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
