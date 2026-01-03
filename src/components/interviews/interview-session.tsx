'use client';

import { useState, useCallback } from 'react';
import { useVoice, VoiceReadyState } from '@humeai/voice-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InterviewTranscript } from './interview-transcript';
import { EmotionIndicator } from './emotion-indicator';
import { InterviewTimer } from './interview-timer';
import { Mic, MicOff, Phone, PhoneOff, Loader2, AlertCircle, Target, AlertTriangle, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

/**
 * Main interview session component that handles the voice conversation.
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
        ? gapSkills.map(s => `- ${s.name}: Claimed ${s.claimedLevel}, Verified ${s.verifiedLevel || 'not yet'} [GAP - FOCUS ON THIS]`).join('\n')
        : 'No skill gaps identified - do a quick maintenance check on verified skills.';

      const verifiedSkillsList = verifiedSkills.length > 0
        ? verifiedSkills.map(s => `- ${s.name}: Verified ${s.verifiedLevel || s.claimedLevel}`).join('\n')
        : 'No verified skills yet.';

      return `
CANDIDATE PROFILE:
- Name: ${candidateContext.name}
- Target Roles: ${candidateContext.targetRoles.length > 0 ? candidateContext.targetRoles.join(', ') : 'Not specified'}

SKILLS TO FOCUS ON (GAP SKILLS):
${gapSkillsList}

PREVIOUSLY VERIFIED SKILLS (No focus needed):
${verifiedSkillsList}

INTERVIEW TYPE: Weekly Sprint (Progress Check) - 15 MINUTES MAX

Remember to:
1. Address the candidate by name
2. Focus ONLY on skills marked with [GAP]
3. Ask 2-3 quick questions per gap skill
4. Note improvement or continued struggles
5. End with encouragement and next week's focus
6. Keep it under 15 minutes!
`.trim();
    } else {
      // Reality Check format - Assess all skills
      const skillsList = candidateContext.skills
        .map(s => `- ${s.name}: Claimed Level = ${s.claimedLevel}${s.isVerified ? ' (verified)' : ''}`)
        .join('\n');

      return `
CANDIDATE PROFILE:
- Name: ${candidateContext.name}
- Target Roles: ${candidateContext.targetRoles.length > 0 ? candidateContext.targetRoles.join(', ') : 'Not specified'}

CLAIMED SKILLS TO ASSESS:
${skillsList || 'No skills listed - ask about their experience and interests'}

INTERVIEW TYPE: Reality Check (Initial Benchmark) - 30 MINUTES

Remember to:
1. Address the candidate by name
2. Cover at least 4-5 different skills from the list above
3. Spend no more than 3 questions per skill before moving on
4. Establish baseline levels for all claimed skills
5. Be thorough but keep pace - 30 minutes total
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

      // Debug: Log the context being sent to Hume
      console.log('[InterviewSession] Context being sent to Hume:');
      console.log(contextInjection);
      console.log('[InterviewSession] Number of skills:', candidateContext.skills.length);

      // Connect to Hume EVI with auth, configId, and session settings
      // The configId determines which EVI configuration (system prompt, voice) to use
      // Using 'context' field instead of 'systemPrompt' because:
      // - systemPrompt OVERRIDES the base prompt (loses Sebastian's instructions)
      // - context APPENDS to the conversation (Sebastian sees both his instructions AND the candidate data)
      // verboseTranscription: false makes EVI less sensitive to interruptions (waits longer)
      await connect({
        auth: { type: 'accessToken', value: accessToken },
        configId,
        verboseTranscription: false,
        sessionSettings: {
          type: 'session_settings',
          // Use context with type 'persistent' to inject candidate data throughout the session
          // This is appended to the conversation, not overriding Sebastian's base instructions
          context: {
            text: contextInjection,
            type: 'persistent',
          },
        },
      });

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

    try {
      disconnect();

      const durationSeconds = Math.round(
        (Date.now() - sessionStartTime.getTime()) / 1000
      );

      // Build transcript from messages
      const transcript = messages
        .filter(
          (m) => m.type === 'user_message' || m.type === 'assistant_message'
        )
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

      // Redirect to summary
      router.push(`/interviews/${interviewId}/summary`);
    } catch (err) {
      console.error('Failed to end interview:', err);
      setError(err instanceof Error ? err.message : 'Failed to end interview');
    } finally {
      setIsEnding(false);
    }
  }, [disconnect, messages, sessionStartTime, interviewId, router]);

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
                : 'Ready to begin your interview'}
            </p>
          </div>
          {sessionStartTime && <InterviewTimer startTime={sessionStartTime} />}
        </CardHeader>
        <CardContent className="flex gap-4">
          {!isConnected ? (
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
