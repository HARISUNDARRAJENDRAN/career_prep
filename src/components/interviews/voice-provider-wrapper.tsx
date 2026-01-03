'use client';

import { VoiceProvider } from '@humeai/voice-react';
import { ReactNode } from 'react';

interface VoiceProviderWrapperProps {
  children: ReactNode;
}

/**
 * Wrapper component that provides Hume AI Voice context to children.
 * This must be used at the top level of any interview session.
 *
 * Note: Auth, configId, and sessionSettings are passed via connect() in InterviewSession.
 */
export function VoiceProviderWrapper({ children }: VoiceProviderWrapperProps) {
  return <VoiceProvider>{children}</VoiceProvider>;
}
