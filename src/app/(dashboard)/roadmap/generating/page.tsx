import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/drizzle/db';
import { roadmaps } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { GeneratingClient } from './generating-client';

/**
 * Roadmap Generating Page
 *
 * Shows a loading screen while the Architect Agent generates the roadmap.
 * Polls for completion and redirects to roadmap when done.
 */
export default async function RoadmapGeneratingPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Check if roadmap already exists
  const existingRoadmap = await db.query.roadmaps.findFirst({
    where: eq(roadmaps.user_id, userId),
  });

  // If roadmap exists, redirect to it
  if (existingRoadmap) {
    redirect('/roadmap');
  }

  return (
    <div className="container max-w-3xl py-12">
      <GeneratingClient />
    </div>
  );
}
