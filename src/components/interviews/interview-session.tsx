'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useVoice, VoiceReadyState } from '@humeai/voice-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InterviewTranscript } from './interview-transcript';
import { EmotionIndicator } from './emotion-indicator';
import { InterviewTimer } from './interview-timer';
import { Mic, MicOff, Phone, PhoneOff, Loader2, AlertCircle, Target, AlertTriangle, TrendingUp, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Constants for transcript persistence
const AUTOSAVE_INTERVAL_MS = 2 * 60 * 1000; // Auto-save every 2 minutes
const LOCALSTORAGE_KEY_PREFIX = 'interview-transcript-';

interface TranscriptEntry {
  speaker: 'user' | 'agent';
  text: string;
  timestamp: string;
  emotions?: Record<string, number>;
}

interface CandidateContext {
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

interface InterviewSessionProps {
  interviewId: string;
  accessToken: string;
  configId: string;
  interviewType: 'reality_check' | 'weekly_sprint';
  candidateContext: CandidateContext;
}

// Helper to get localStorage key for an interview
function getLocalStorageKey(interviewId: string): string {
  return `${LOCALSTORAGE_KEY_PREFIX}${interviewId}`;
}

// Helper to safely get transcript from localStorage
function getStoredTranscript(interviewId: string): TranscriptEntry[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(getLocalStorageKey(interviewId));
    if (stored) {
      const data = JSON.parse(stored);
      return data.transcript || null;
    }
  } catch (e) {
    console.error('[InterviewSession] Failed to parse stored transcript:', e);
  }
  return null;
}

// Helper to save transcript to localStorage
function saveTranscriptToStorage(interviewId: string, transcript: TranscriptEntry[], startTime: Date): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getLocalStorageKey(interviewId), JSON.stringify({
      transcript,
      startTime: startTime.toISOString(),
      savedAt: new Date().toISOString(),
    }));
  } catch (e) {
    console.error('[InterviewSession] Failed to save transcript to localStorage:', e);
  }
}

// Helper to clear transcript from localStorage
function clearStoredTranscript(interviewId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getLocalStorageKey(interviewId));
  } catch (e) {
    console.error('[InterviewSession] Failed to clear stored transcript:', e);
  }
}

/**
 * Main interview session component that handles the voice conversation.
 * Includes robust transcript persistence to prevent data loss on disconnects.
 */
export function InterviewSession({
  interviewId,
  accessToken,
  configId,
  interviewType,
  candidateContext,
}: InterviewSessionProps) {
  const router = useRouter();
  const {
    connect,
    disconnect,
    readyState,
    messages,
    isMuted,
    mute,
    unmute,
    fft,
  } = useVoice();

  const [isConnecting, setIsConnecting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnectedUnexpectedly, setDisconnectedUnexpectedly] = useState(false);
  const [hasRecoverableTranscript, setHasRecoverableTranscript] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);

  // Track if we initiated the disconnect (to distinguish from unexpected disconnects)
  const userInitiatedDisconnect = useRef(false);
  // Track previous ready state to detect transitions
  const prevReadyState = useRef<VoiceReadyState | null>(null);
  // Keep a ref to messages for use in the disconnect handler
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Keep a ref to session start time for use in handlers
  const sessionStartTimeRef = useRef<Date | null>(null);
  sessionStartTimeRef.current = sessionStartTime;
  // Ref for autosave interval
  const autosaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to build transcript from messages
  const buildTranscriptFromMessages = useCallback((msgs: typeof messages): TranscriptEntry[] => {
    return msgs
      .filter((m) => m.type === 'user_message' || m.type === 'assistant_message')
      .map((m) => {
        const isUser = m.type === 'user_message';
        const msg = m as {
          type: string;
          message?: { content?: string };
          models?: { prosody?: { scores?: Record<string, number> } };
        };
        return {
          speaker: isUser ? ('user' as const) : ('agent' as const),
          text: msg.message?.content || '',
          timestamp: new Date().toISOString(),
          emotions: isUser ? msg.models?.prosody?.scores : undefined,
        };
      });
  }, []);

  // Helper function to perform autosave to server
  const performAutosave = useCallback(async (transcript: TranscriptEntry[], durationSeconds: number) => {
    try {
      const userEmotions = transcript
        .filter((t) => t.speaker === 'user' && t.emotions)
        .map((t) => t.emotions!);
      const emotionSummary = calculateEmotionSummary(userEmotions);

      const response = await fetch(`/api/interviews/${interviewId}/autosave`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          emotion_summary: emotionSummary,
          duration_seconds: durationSeconds,
        }),
      });

      if (response.ok) {
        console.log(`[InterviewSession] Auto-saved ${transcript.length} messages to server`);
        setLastAutoSaveTime(new Date());
        return true;
      } else {
        console.error('[InterviewSession] Server autosave failed');
        return false;
      }
    } catch (err) {
      console.error('[InterviewSession] Error during autosave:', err);
      return false;
    }
  }, [interviewId]);

  // Check for recoverable transcript on mount
  useEffect(() => {
    const storedTranscript = getStoredTranscript(interviewId);
    if (storedTranscript && storedTranscript.length > 0) {
      console.log(`[InterviewSession] Found ${storedTranscript.length} recoverable messages in localStorage`);
      setHasRecoverableTranscript(true);
    }
  }, [interviewId]);

  // Buffer messages to localStorage on each new message - CRITICAL for disconnect recovery
  // This runs on EVERY messages change to ensure we never lose data
  useEffect(() => {
    // Only save if we're in an active session
    if (readyState === VoiceReadyState.OPEN && sessionStartTime) {
      const transcript = buildTranscriptFromMessages(messages);
      // Save even if transcript is empty - this ensures we have a record
      saveTranscriptToStorage(interviewId, transcript, sessionStartTime);
      console.log(`[InterviewSession] Buffered ${transcript.length} messages to localStorage`);
    }
  }, [messages, interviewId, sessionStartTime, readyState, buildTranscriptFromMessages]);

  // Handle visibility change - save immediately when tab loses focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && readyState === VoiceReadyState.OPEN && sessionStartTimeRef.current) {
        const transcript = buildTranscriptFromMessages(messagesRef.current);
        if (transcript.length > 0) {
          // Save to localStorage immediately
          saveTranscriptToStorage(interviewId, transcript, sessionStartTimeRef.current);

          // Also try to send to server using sendBeacon
          const durationSeconds = Math.round(
            (Date.now() - sessionStartTimeRef.current.getTime()) / 1000
          );
          const userEmotions = transcript
            .filter((t) => t.speaker === 'user' && t.emotions)
            .map((t) => t.emotions!);
          const emotionSummary = calculateEmotionSummary(userEmotions);

          const payload = JSON.stringify({
            transcript,
            emotion_summary: emotionSummary,
            duration_seconds: durationSeconds,
          });

          navigator.sendBeacon(
            `/api/interviews/${interviewId}/autosave`,
            new Blob([payload], { type: 'application/json' })
          );
          console.log('[InterviewSession] Saved transcript on visibility change (tab hidden)');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [readyState, interviewId, buildTranscriptFromMessages]);

  // Periodic auto-save to server (every 2 minutes)
  useEffect(() => {
    if (readyState === VoiceReadyState.OPEN && sessionStartTime) {
      // Clear any existing interval
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current);
      }

      // Set up new interval
      autosaveIntervalRef.current = setInterval(() => {
        const transcript = buildTranscriptFromMessages(messagesRef.current);
        if (transcript.length > 0 && sessionStartTimeRef.current) {
          const durationSeconds = Math.round(
            (Date.now() - sessionStartTimeRef.current.getTime()) / 1000
          );
          performAutosave(transcript, durationSeconds);
        }
      }, AUTOSAVE_INTERVAL_MS);

      console.log('[InterviewSession] Started periodic autosave (every 2 minutes)');
    }

    return () => {
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current);
        autosaveIntervalRef.current = null;
      }
    };
  }, [readyState, sessionStartTime, buildTranscriptFromMessages, performAutosave]);

  // Handle beforeunload event for browser close/refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (readyState === VoiceReadyState.OPEN && sessionStartTimeRef.current) {
        // Attempt to save using sendBeacon for reliability
        const transcript = buildTranscriptFromMessages(messagesRef.current);
        if (transcript.length > 0) {
          const durationSeconds = Math.round(
            (Date.now() - sessionStartTimeRef.current.getTime()) / 1000
          );
          const userEmotions = transcript
            .filter((t) => t.speaker === 'user' && t.emotions)
            .map((t) => t.emotions!);
          const emotionSummary = calculateEmotionSummary(userEmotions);

          // Use sendBeacon for reliable delivery during page unload
          const payload = JSON.stringify({
            transcript,
            emotion_summary: emotionSummary,
            duration_seconds: durationSeconds,
          });

          navigator.sendBeacon(`/api/interviews/${interviewId}/autosave`, new Blob([payload], { type: 'application/json' }));
          console.log('[InterviewSession] Sent beacon autosave on beforeunload');
        }

        // Show browser confirmation dialog
        e.preventDefault();
        e.returnValue = 'You have an interview in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [readyState, interviewId, buildTranscriptFromMessages]);

  // Handle unexpected disconnections - auto-save transcript when connection drops
  useEffect(() => {
    const wasConnected = prevReadyState.current === VoiceReadyState.OPEN;
    const isNowClosed = readyState === VoiceReadyState.CLOSED;

    // Detect unexpected disconnect: was connected, now closed, but user didn't initiate
    if (wasConnected && isNowClosed && !userInitiatedDisconnect.current && sessionStartTime) {
      console.warn('[InterviewSession] Unexpected disconnect detected, auto-saving transcript...');
      setDisconnectedUnexpectedly(true);
      setError('Connection lost unexpectedly. Your interview progress has been saved.');

      // Clear autosave interval
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current);
        autosaveIntervalRef.current = null;
      }

      // Auto-save the transcript - try localStorage first, then complete the interview
      const autoSaveTranscript = async () => {
        try {
          const durationSeconds = Math.round(
            (Date.now() - sessionStartTime.getTime()) / 1000
          );

          // First, try to get transcript from localStorage (most reliable)
          let transcript = getStoredTranscript(interviewId);
          console.log(`[InterviewSession] localStorage transcript: ${transcript?.length || 0} messages`);

          // If localStorage is empty, try the current messages ref
          if (!transcript || transcript.length === 0) {
            transcript = buildTranscriptFromMessages(messagesRef.current);
            console.log(`[InterviewSession] messagesRef transcript: ${transcript.length} messages`);
          }

          // If still empty, log a warning but still complete the interview
          if (transcript.length === 0) {
            console.warn('[InterviewSession] No transcript available to save - messages may have been cleared before we could capture them');
          }

          // Calculate emotion summary
          const userEmotions = transcript
            .filter((t) => t.speaker === 'user' && t.emotions)
            .map((t) => t.emotions!);
          const emotionSummary = calculateEmotionSummary(userEmotions);

          // Save to database with a flag indicating it was interrupted
          const response = await fetch(`/api/interviews/${interviewId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript,
              emotion_summary: emotionSummary,
              duration_seconds: durationSeconds,
              interrupted: true, // Flag that this was an unexpected disconnect
            }),
          });

          if (response.ok) {
            console.log(`[InterviewSession] Auto-saved ${transcript.length} messages successfully`);
            // Clear localStorage after successful save
            clearStoredTranscript(interviewId);
          } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('[InterviewSession] Failed to auto-save transcript to server:', errorData);
          }
        } catch (err) {
          console.error('[InterviewSession] Error auto-saving transcript:', err);
        }
      };

      autoSaveTranscript();
    }

    // Update previous state for next comparison
    prevReadyState.current = readyState;
  }, [readyState, sessionStartTime, interviewId, buildTranscriptFromMessages]);

  // Handler to recover transcript from localStorage
  const handleRecoverTranscript = useCallback(async () => {
    const storedTranscript = getStoredTranscript(interviewId);
    if (storedTranscript && storedTranscript.length > 0) {
      try {
        // Calculate a rough duration (we don't know exact start time)
        const durationSeconds = storedTranscript.length * 10; // Estimate ~10s per message

        const userEmotions = storedTranscript
          .filter((t) => t.speaker === 'user' && t.emotions)
          .map((t) => t.emotions!);
        const emotionSummary = calculateEmotionSummary(userEmotions);

        const response = await fetch(`/api/interviews/${interviewId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: storedTranscript,
            emotion_summary: emotionSummary,
            duration_seconds: durationSeconds,
            interrupted: true,
          }),
        });

        if (response.ok) {
          console.log('[InterviewSession] Recovered transcript successfully');
          clearStoredTranscript(interviewId);
          setHasRecoverableTranscript(false);
          router.push(`/interviews/${interviewId}/processing`);
        } else {
          setError('Failed to recover transcript. Please try again.');
        }
      } catch (err) {
        console.error('[InterviewSession] Error recovering transcript:', err);
        setError('Failed to recover transcript. Please try again.');
      }
    }
  }, [interviewId, router]);

  // Handler to discard recoverable transcript
  const handleDiscardRecovery = useCallback(() => {
    clearStoredTranscript(interviewId);
    setHasRecoverableTranscript(false);
  }, [interviewId]);

  // Build the dynamic context injection for Hume
  // This supplements the static system prompt with user-specific data
  const buildContextInjection = useCallback(() => {
    // For Weekly Sprint: Separate gap skills from verified skills
    // For Reality Check: Show all skills
    const gapSkills = candidateContext.skills.filter(s => s.hasGap);
    const verifiedSkills = candidateContext.skills.filter(s => s.isVerified && !s.hasGap);

    if (interviewType === 'weekly_sprint') {
      // Weekly Sprint format - Focus on gaps
      const gapSkillsList = gapSkills.length > 0
        ? gapSkills.map((s, i) => `${i + 1}. ${s.name}: Claimed ${s.claimedLevel}, Verified ${s.verifiedLevel || 'not yet'} [GAP]`).join('\n')
        : 'No skill gaps identified - do a quick maintenance check on verified skills.';

      const verifiedSkillsList = verifiedSkills.length > 0
        ? verifiedSkills.map(s => `- ${s.name}: Verified ${s.verifiedLevel || s.claimedLevel}`).join('\n')
        : 'No verified skills yet.';

      return `
CANDIDATE PROFILE:
- Name: ${candidateContext.name}
- Target Roles: ${candidateContext.targetRoles.length > 0 ? candidateContext.targetRoles.join(', ') : 'Not specified'}

═══════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: DO NOT REPEAT TOPICS - TRACK WHAT YOU'VE DISCUSSED ⚠️
═══════════════════════════════════════════════════════════════════════

GAP SKILLS TO CHECK (go through this list ONCE):
${gapSkillsList}

ALREADY VERIFIED SKILLS (DO NOT re-assess these):
${verifiedSkillsList}

INTERVIEW TYPE: Weekly Sprint - 15 MINUTES MAX

RULES:
1. Address ${candidateContext.name} by name
2. Cover each gap skill ONCE with 1-2 questions
3. Mark each skill as "discussed" mentally - NEVER return to it
4. If candidate says "we talked about that" - apologize and move on
5. When all gaps are covered, wrap up - don't pad the time
6. Keep it under 15 minutes!

This is a BRIEF check-in, not a full assessment.
`.trim();
    } else {
      // Reality Check format - Assess all skills
      // Group skills by category/type for better organization
      const unverifiedSkills = candidateContext.skills.filter(s => !s.isVerified);
      const totalSkillCount = candidateContext.skills.length;

      // Create a prioritized list - skills the user claims higher proficiency in should be assessed first
      const priorityOrder = ['expert', 'proficient', 'practicing', 'learning', 'beginner'];
      const sortedSkills = [...candidateContext.skills].sort((a, b) => {
        return priorityOrder.indexOf(a.claimedLevel) - priorityOrder.indexOf(b.claimedLevel);
      });

      const skillsList = sortedSkills
        .map((s, i) => `${i + 1}. ${s.name}: Claimed Level = ${s.claimedLevel}${s.isVerified ? ' (already verified)' : ''}`)
        .join('\n');

      // Calculate recommended coverage
      const minSkillsToVerify = Math.min(totalSkillCount, Math.max(10, Math.ceil(totalSkillCount * 0.6)));

      return `
CANDIDATE PROFILE:
- Name: ${candidateContext.name}
- Target Roles: ${candidateContext.targetRoles.length > 0 ? candidateContext.targetRoles.join(', ') : 'Not specified'}

TOTAL SKILLS TO ASSESS: ${totalSkillCount} skills

═══════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: CONVERSATION TRACKING - READ THIS CAREFULLY ⚠️
═══════════════════════════════════════════════════════════════════════

YOU MUST MAINTAIN A MENTAL CHECKLIST AS YOU GO:

SKILLS NOT YET DISCUSSED (start here - go through this list):
${skillsList || 'No skills listed - ask about their experience and interests'}

AS YOU DISCUSS EACH SKILL:
1. Mentally move it from "NOT YET DISCUSSED" to "ALREADY COVERED"
2. NEVER return to a skill you've already covered
3. NEVER rephrase and re-ask about the same skill
4. If candidate declines to discuss a skill, mark it as SKIPPED and move on

IF CANDIDATE SAYS "WE ALREADY TALKED ABOUT THAT":
- Apologize briefly: "You're right, my apologies"
- Immediately move to the NEXT uncovered skill
- Do NOT try to justify or explain

WHEN YOU'VE COVERED ALL SKILLS (this is the goal!):
Instead of repeating topics, do ONE of these:
1. Ask deeper questions about their STRONGEST demonstrated skill
2. Explore how they combine multiple skills in projects
3. Discuss their career vision and learning goals
4. Ask about challenging problems they've solved
5. WRAP UP THE INTERVIEW - it's OK to end early if thorough!

═══════════════════════════════════════════════════════════════════════

INTERVIEW TYPE: Reality Check (Initial Benchmark) - 30-60 MINUTES (OK to end early)

INTERVIEW APPROACH:
1. Address ${candidateContext.name} by name
2. Go through skills ONE BY ONE - ask 1-2 questions max per skill
3. Mark each skill as "covered" in your mental checklist
4. Keep momentum - don't linger on any single topic
5. When all skills are covered, transition to wrap-up or deeper exploration
6. Quality over quantity - a focused 25-min interview beats a repetitive 60-min one

QUESTION VARIETY (use different formats):
- "Walk me through how you'd use [skill]..."
- "What's a common pitfall with [skill]?"
- "Tell me about a project using [skill]..."
- "How does [skill] compare to [related skill]?"

Remember: Once a skill is discussed, it's DONE. Move forward, never backward.
`.trim();
    }
  }, [candidateContext, interviewType]);

  // Start the interview
  const handleStart = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // Build the context injection with user's skills
      const contextInjection = buildContextInjection();

      // Debug: Log the FULL context being sent to Hume
      console.log('[InterviewSession] Starting interview...');
      console.log('[InterviewSession] Interview type:', interviewType);
      console.log('[InterviewSession] Config ID:', configId);
      console.log('[InterviewSession] Number of skills:', candidateContext.skills.length);
      console.log('[InterviewSession] Skills list:', candidateContext.skills.map(s => `${s.name} (${s.claimedLevel})`).join(', '));
      console.log('[InterviewSession] Candidate name:', candidateContext.name);
      console.log('[InterviewSession] Target roles:', candidateContext.targetRoles);
      console.log('[InterviewSession] Access token present:', !!accessToken);

      if (candidateContext.skills.length === 0) {
        console.warn('[InterviewSession] ⚠️ WARNING: No skills found! The interview agent will not know what to ask about.');
        console.warn('[InterviewSession] This could mean:');
        console.warn('[InterviewSession]   1. Resume was not parsed during onboarding');
        console.warn('[InterviewSession]   2. Skills were not extracted from resume');
        console.warn('[InterviewSession]   3. Database query is not finding the skills');
      }

      console.log('[InterviewSession] ========== FULL CONTEXT INJECTION ==========');
      console.log(contextInjection);
      console.log('[InterviewSession] ========== END CONTEXT INJECTION ==========');

      // Validate inputs before connecting
      if (!accessToken) {
        throw new Error('No access token available. Please refresh the page and try again.');
      }
      if (!configId) {
        throw new Error('Hume configuration is missing. Please contact support.');
      }

      // Connect to Hume EVI with auth, configId, and session settings
      // The configId determines which EVI configuration (system prompt, voice) to use
      // Using 'context' field instead of 'systemPrompt' because:
      // - systemPrompt OVERRIDES the base prompt (loses Sebastian's instructions)
      // - context APPENDS to the conversation (Sebastian sees both his instructions AND the candidate data)
      // verboseTranscription: false makes EVI less sensitive to interruptions (waits longer)
      //
      // We also pass 'variables' to fill any {{template}} placeholders in the Hume config's system prompt
      await connect({
        auth: { type: 'accessToken', value: accessToken },
        configId,
        verboseTranscription: false,
        sessionSettings: {
          type: 'session_settings',
          // Variables to fill {{placeholders}} in the Hume system prompt
          variables: {
            userName: candidateContext.name,
            targetRoles: candidateContext.targetRoles.length > 0
              ? candidateContext.targetRoles.join(', ')
              : 'Not specified',
            skills: candidateContext.skills.length > 0
              ? candidateContext.skills.map(s => `${s.name} (${s.claimedLevel})`).join(', ')
              : 'No skills specified',
          },
          // Use context with type 'persistent' to inject candidate data throughout the session
          // This is appended to the conversation, not overriding Sebastian's base instructions
          context: {
            text: contextInjection,
            type: 'persistent',
          },
        },
      });

      console.log('[InterviewSession] Connected to Hume successfully');
      setSessionStartTime(new Date());

      // Mark interview as started in DB
      const response = await fetch(`/api/interviews/${interviewId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hume_session_id: `session_${Date.now()}` }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start interview');
      }
    } catch (err) {
      console.error('Failed to connect:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  }, [connect, accessToken, configId, interviewId]);

  // End the interview
  const handleEnd = useCallback(async () => {
    if (!sessionStartTime) return;

    setIsEnding(true);
    setError(null);
    // Mark that we're intentionally disconnecting
    userInitiatedDisconnect.current = true;

    // Clear autosave interval
    if (autosaveIntervalRef.current) {
      clearInterval(autosaveIntervalRef.current);
      autosaveIntervalRef.current = null;
    }

    try {
      disconnect();

      const durationSeconds = Math.round(
        (Date.now() - sessionStartTime.getTime()) / 1000
      );

      // Build transcript from messages
      const transcript = buildTranscriptFromMessages(messages);

      // Calculate emotion summary (average of user emotions)
      const userEmotions = transcript
        .filter((t) => t.speaker === 'user' && t.emotions)
        .map((t) => t.emotions!);

      const emotionSummary = calculateEmotionSummary(userEmotions);

      // Save to database
      const response = await fetch(`/api/interviews/${interviewId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          emotion_summary: emotionSummary,
          duration_seconds: durationSeconds,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save interview');
      }

      // Clear localStorage after successful save
      clearStoredTranscript(interviewId);

      // Redirect to processing page (agents will analyze and generate results)
      router.push(`/interviews/${interviewId}/processing`);
    } catch (err) {
      console.error('Failed to end interview:', err);
      setError(err instanceof Error ? err.message : 'Failed to end interview');
    } finally {
      setIsEnding(false);
    }
  }, [disconnect, messages, sessionStartTime, interviewId, router, buildTranscriptFromMessages]);

  const isConnected = readyState === VoiceReadyState.OPEN;

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Recovery Alert - Show when there's unsaved transcript from a previous session */}
      {hasRecoverableTranscript && !isConnected && !disconnectedUnexpectedly && (
        <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <RotateCcw className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">
            Unsaved Interview Found
          </AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            <p className="mb-3">
              We found an unsaved interview transcript from a previous session.
              Would you like to recover it?
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleRecoverTranscript}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Recover Transcript
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDiscardRecovery}
              >
                Discard & Start Fresh
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Auto-save indicator */}
      {isConnected && lastAutoSaveTime && (
        <div className="text-xs text-muted-foreground text-right">
          Last saved: {lastAutoSaveTime.toLocaleTimeString()}
        </div>
      )}

      {/* Status Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>
              {interviewType === 'reality_check'
                ? 'Reality Check Interview'
                : 'Weekly Sprint Interview'}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {isConnected
                ? 'Interview in progress - speak naturally with the interviewer'
                : disconnectedUnexpectedly
                ? 'Interview ended unexpectedly - your progress was saved'
                : 'Ready to begin your interview'}
            </p>
          </div>
          {sessionStartTime && <InterviewTimer startTime={sessionStartTime} />}
        </CardHeader>
        <CardContent className="flex gap-4">
          {!isConnected ? (
            disconnectedUnexpectedly ? (
              <Button
                onClick={() => router.push(`/interviews/${interviewId}/summary`)}
                size="lg"
                className="gap-2"
              >
                View Summary
              </Button>
            ) : (
              <Button
                onClick={handleStart}
                disabled={isConnecting}
                size="lg"
                className="gap-2"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Phone className="h-4 w-4" />
                    Start Interview
                  </>
                )}
              </Button>
            )
          ) : (
            <>
              <Button
                onClick={() => (isMuted ? unmute() : mute())}
                variant="outline"
                size="lg"
                className="gap-2"
              >
                {isMuted ? (
                  <>
                    <MicOff className="h-4 w-4" />
                    Unmute
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Mute
                  </>
                )}
              </Button>
              <Button
                onClick={handleEnd}
                disabled={isEnding}
                variant="destructive"
                size="lg"
                className="gap-2"
              >
                {isEnding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <PhoneOff className="h-4 w-4" />
                    End Interview
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Main Content - Only show when connected */}
      {isConnected && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Transcript - Main Area */}
          <div className="lg:col-span-2">
            <InterviewTranscript messages={messages} />
          </div>

          {/* Emotion Sidebar */}
          <div>
            <EmotionIndicator messages={messages} micFft={fft} />
          </div>
        </div>
      )}

      {/* Pre-interview Tips */}
      {!isConnected && !isConnecting && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Skills to Verify / Focus */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {interviewType === 'weekly_sprint' ? (
                  <>
                    <TrendingUp className="h-5 w-5" />
                    Progress Check
                  </>
                ) : (
                  <>
                    <Target className="h-5 w-5" />
                    Skills to Verify
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {interviewType === 'weekly_sprint' ? (
                // Weekly Sprint - Show skills with gaps that need focus
                <>
                  {candidateContext.skills.filter(s => s.hasGap).length > 0 ? (
                    <>
                      <p className="text-sm text-muted-foreground mb-2">
                        Skills with gaps to focus on:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {candidateContext.skills.filter(s => s.hasGap).map((skill) => (
                          <Badge
                            key={skill.name}
                            variant="default"
                            className="text-sm bg-orange-500 hover:bg-orange-600"
                          >
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {skill.name}
                            <span className="ml-1 text-xs opacity-70">
                              ({skill.verifiedLevel} → {skill.claimedLevel})
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No skill gaps identified. This sprint will focus on maintaining and advancing your current skills.
                    </p>
                  )}
                </>
              ) : (
                // Reality Check - Show all skills to verify
                <>
                  {candidateContext.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {candidateContext.skills.map((skill) => (
                        <Badge
                          key={skill.name}
                          variant={skill.isVerified ? 'default' : 'outline'}
                          className="text-sm"
                        >
                          {skill.name}
                          <span className="ml-1 text-xs opacity-70">
                            ({skill.claimedLevel})
                          </span>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No skills listed. Add skills in your profile to have them verified.
                    </p>
                  )}
                </>
              )}
              {candidateContext.targetRoles.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    <strong>Target Roles:</strong> {candidateContext.targetRoles.join(', ')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Before You Start</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                <strong>1. Check your microphone:</strong> Make sure your
                microphone is working and you&apos;re in a quiet environment.
              </p>
              <p>
                <strong>2. Speak naturally:</strong> This is a conversation, not a
                test. Be yourself and explain your experience clearly.
              </p>
              {interviewType === 'weekly_sprint' ? (
                <>
                  <p>
                    <strong>3. Share your progress:</strong> Talk about what you&apos;ve
                    learned and practiced since your last interview.
                  </p>
                  <p>
                    <strong>4. Be specific:</strong> Give examples of projects or
                    exercises you&apos;ve worked on to improve your skills.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong>3. Take your time:</strong> It&apos;s okay to pause and
                    think before answering. Quality matters more than speed.
                  </p>
                  <p>
                    <strong>4. Be honest:</strong> The goal is to understand your true
                    skill level so we can create the best learning path for you.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Helper: Calculate average emotions across messages
function calculateEmotionSummary(
  emotionsList: Record<string, number>[]
): Record<string, number> {
  if (emotionsList.length === 0) return {};

  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};

  for (const emotions of emotionsList) {
    for (const [key, value] of Object.entries(emotions)) {
      sums[key] = (sums[key] || 0) + value;
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  const averages: Record<string, number> = {};
  for (const key of Object.keys(sums)) {
    averages[key] = sums[key] / counts[key];
  }

  // Return top 5 emotions
  return Object.fromEntries(
    Object.entries(averages)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
  );
}
