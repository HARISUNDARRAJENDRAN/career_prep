import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { serverEnv } from '@/data/env/server';

interface NewInterviewPageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function NewInterviewPage({
  searchParams,
}: NewInterviewPageProps) {
  const { userId } = await auth();
  const params = await searchParams;

  if (!userId) {
    redirect('/sign-in');
  }

  // Validate interview type
  const interviewType = params.type;
  if (interviewType !== 'reality_check' && interviewType !== 'weekly_sprint') {
    redirect('/interviews');
  }

  // Check if Hume is configured
  if (!serverEnv.HUME_API_KEY || !serverEnv.HUME_SECRET_KEY) {
    redirect('/interviews?error=hume_not_configured');
  }

  // Reality Check is ONE-TIME ONLY - check if already completed
  if (interviewType === 'reality_check') {
    const existingRealityCheck = await db.query.interviews.findFirst({
      where: (interviews, { and, eq }) =>
        and(
          eq(interviews.user_id, userId),
          eq(interviews.type, 'reality_check'),
          eq(interviews.status, 'completed')
        ),
    });

    if (existingRealityCheck) {
      // Reality Check already completed - redirect to summary of the completed one
      redirect(`/interviews/${existingRealityCheck.id}/summary?info=already_completed`);
    }
  }

  // For weekly sprint, check if reality check is completed
  if (interviewType === 'weekly_sprint') {
    const completedRealityCheck = await db.query.interviews.findFirst({
      where: (interviews, { and, eq }) =>
        and(
          eq(interviews.user_id, userId),
          eq(interviews.type, 'reality_check'),
          eq(interviews.status, 'completed')
        ),
    });

    if (!completedRealityCheck) {
      redirect('/interviews?error=reality_check_required');
    }
  }

  // Create new interview
  const [newInterview] = await db
    .insert(interviews)
    .values({
      user_id: userId,
      type: interviewType,
      status: 'scheduled',
      scheduled_at: new Date(),
    })
    .returning({ id: interviews.id });

  // Redirect to interview session
  redirect(`/interviews/${newInterview.id}`);
}
