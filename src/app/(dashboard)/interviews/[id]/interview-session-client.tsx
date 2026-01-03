'use client';

import { VoiceProviderWrapper, InterviewSession } from '@/components/interviews';

export interface CandidateContext {
  name: string;
  targetRoles: string[];
  skills: Array<{
    name: string;
    claimedLevel: string;
    isVerified: boolean;
    hasGap?: boolean;
    verifiedLevel?: string;
  }>;
}

interface InterviewSessionClientProps {
  interviewId: string;
  accessToken: string;
  configId: string;
  interviewType: 'reality_check' | 'weekly_sprint';
  candidateContext: CandidateContext;
}

/**
 * Client component that wraps the interview session with VoiceProvider.
 * Separated from the server component to handle client-side voice functionality.
 */
export function InterviewSessionClient({
  interviewId,
  accessToken,
  configId,
  interviewType,
  candidateContext,
}: InterviewSessionClientProps) {
  return (
    <VoiceProviderWrapper>
      <InterviewSession
        interviewId={interviewId}
        accessToken={accessToken}
        configId={configId}
        interviewType={interviewType}
        candidateContext={candidateContext}
      />
    </VoiceProviderWrapper>
  );
}
