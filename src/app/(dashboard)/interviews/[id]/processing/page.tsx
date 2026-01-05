import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { ProcessingClient } from './processing-client';

interface ProcessingPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Interview Processing Page
 *
 * Shows a loading screen while the AI agents analyze the interview.
 * Polls for completion and redirects to summary when done.
 */
export default async function InterviewProcessingPage({ params }: ProcessingPageProps) {
  const { userId } = await auth();
  const { id } = await params;

  if (!userId) {
    redirect('/sign-in');
  }

  // Fetch the interview
  const interview = await db.query.interviews.findFirst({
    where: and(eq(interviews.id, id), eq(interviews.user_id, userId)),
  });

  if (!interview) {
    notFound();
  }

  // If already has analysis, redirect to summary
  const rawData = interview.raw_data as { analysis?: Record<string, unknown> } | null;
  if (interview.status === 'completed' && rawData?.analysis) {
    redirect(`/interviews/${id}/summary`);
  }

  // If not completed yet, redirect back to interview
  if (interview.status !== 'completed') {
    redirect(`/interviews/${id}`);
  }

  return (
    <div className="container max-w-3xl py-12">
      <ProcessingClient
        interviewId={id}
        interviewType={interview.type as 'reality_check' | 'weekly_sprint'}
      />
    </div>
  );
}
