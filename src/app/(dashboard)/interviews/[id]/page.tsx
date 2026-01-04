import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/drizzle/db';
import { interviews, users, userProfiles, userSkills } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { serverEnv } from '@/data/env/server';
import { fetchAccessToken } from 'hume';
import { InterviewSessionClient } from './interview-session-client';

interface InterviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function InterviewPage({ params }: InterviewPageProps) {
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

  // If already completed, redirect to summary
  if (interview.status === 'completed') {
    redirect(`/interviews/${id}/summary`);
  }

  // Check Hume configuration
  // Different configs for different interview types:
  // - Reality Check uses Sebastian (NEXT_PUBLIC_HUME_CONFIG_ID)
  // - Weekly Sprint uses Marcus Chen (NEXT_PUBLIC_HUME_WEEKLY_SPRINT_CONFIG_ID)
  const realityCheckConfigId = process.env.NEXT_PUBLIC_HUME_CONFIG_ID;
  const weeklySprintConfigId = process.env.NEXT_PUBLIC_HUME_WEEKLY_SPRINT_CONFIG_ID;

  // Select the appropriate config based on interview type
  const configId = interview.type === 'weekly_sprint'
    ? weeklySprintConfigId
    : realityCheckConfigId;

  console.log('[Interview] Config check:', {
    interviewType: interview.type,
    hasApiKey: !!serverEnv.HUME_API_KEY,
    hasSecretKey: !!serverEnv.HUME_SECRET_KEY,
    realityCheckConfigId: realityCheckConfigId ? 'set' : 'missing',
    weeklySprintConfigId: weeklySprintConfigId ? 'set' : 'missing',
    selectedConfigId: configId ? 'set' : 'missing',
  });

  if (!serverEnv.HUME_API_KEY || !serverEnv.HUME_SECRET_KEY || !configId) {
    console.error('[Interview] Missing Hume configuration:', {
      hasApiKey: !!serverEnv.HUME_API_KEY,
      hasSecretKey: !!serverEnv.HUME_SECRET_KEY,
      hasConfigId: !!configId,
      interviewType: interview.type,
    });
    redirect('/interviews?error=hume_not_configured');
  }

  // Get access token
  let accessToken: string;
  try {
    accessToken = await fetchAccessToken({
      apiKey: serverEnv.HUME_API_KEY,
      secretKey: serverEnv.HUME_SECRET_KEY,
    });
  } catch (error) {
    console.error('Failed to get Hume access token:', error);
    redirect('/interviews?error=hume_auth_failed');
  }

  // Fetch user data for personalization
  const user = await db.query.users.findFirst({
    where: eq(users.clerk_id, userId),
  });

  // Fetch user profile for target roles
  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.user_id, userId),
  });

  // Fetch user skills with skill details
  const skills = await db.query.userSkills.findMany({
    where: eq(userSkills.user_id, userId),
    with: {
      skill: true,
    },
  });

  // Debug: Log skills being fetched from database
  console.log('[Interview Page] Skills fetched from DB:', skills.length);
  console.log('[Interview Page] Skills:', skills.map(s => ({
    name: s.skill?.name,
    level: s.proficiency_level,
    verified: s.verification_metadata?.is_verified,
  })));

  // Build candidate context for Marcus
  // For weekly sprints, include gap information so Marcus knows what to focus on
  const candidateContext = {
    name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Candidate' : 'Candidate',
    targetRoles: profile?.target_roles || [],
    skills: skills.map((s) => ({
      name: s.skill?.name || 'Unknown',
      claimedLevel: s.proficiency_level,
      isVerified: s.verification_metadata?.is_verified || false,
      hasGap: s.verification_metadata?.gap_identified || false,
      verifiedLevel: s.verification_metadata?.verified_level,
    })),
  };

  return (
    <div className="container max-w-5xl py-6">
      <InterviewSessionClient
        interviewId={id}
        accessToken={accessToken}
        configId={configId}
        interviewType={interview.type as 'reality_check' | 'weekly_sprint'}
        candidateContext={candidateContext}
      />
    </div>
  );
}
