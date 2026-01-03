# Phase 5: Hume AI Integration - Interviewer Agent

> **Created:** January 1, 2025
> **Status:** Planning
> **Priority:** HIGH
> **Dependencies:** Phase 3.5 (Message Bus) - COMPLETED

---

## Table of Contents

1. [Overview](#overview)
2. [Current State Analysis](#current-state-analysis)
3. [Hume AI Architecture](#hume-ai-architecture)
4. [Implementation Plan](#implementation-plan)
5. [Database Schema (Already Exists)](#database-schema-already-exists)
6. [Environment Variables](#environment-variables)
7. [API Routes](#api-routes)
8. [React Components](#react-components)
9. [Interview Flow](#interview-flow)
10. [System Prompts](#system-prompts)
11. [Security Considerations](#security-considerations)
12. [Testing Strategy](#testing-strategy)
13. [Implementation Checklist](#implementation-checklist)

---

## Overview

### What is the Interviewer Agent?

The Interviewer Agent is the **core differentiator** of Career Prep. It conducts voice-to-voice interviews using Hume AI's Empathic Voice Interface (EVI 3) to:

1. **Reality Check Interview**: Initial 30-60 minute assessment after onboarding to verify claimed skills
2. **Weekly Sprint Interviews**: Short 10-15 minute check-ins to verify learning progress

### Why Hume AI?

| Feature | Benefit |
|---------|---------|
| **Empathic AI** | Detects emotions via prosody (voice tone, pitch, rhythm) |
| **Real-time Voice** | Natural conversation, not text-based Q&A |
| **Emotion Scores** | Confidence indicators for skill verification |
| **Transcript + Emotions** | Rich data for Truth Loop analysis (Phase 5.5) |
| **Claude Integration** | Uses Claude Sonnet 4 as the underlying LLM |

### End Goal

After Phase 5:
- Users can start a Reality Check Interview from `/interviews`
- Voice conversation is recorded with real-time transcription
- Emotion data is captured for each utterance
- Interview data is stored in PostgreSQL
- `INTERVIEW_COMPLETED` event triggers post-interview analysis (Phase 5.5)

---

## Current State Analysis

### What Already Exists

| Component | Location | Status |
|-----------|----------|--------|
| **Database Schema** | | |
| `interviews` table | `src/drizzle/schema/interviews.ts` | ✅ Complete with Hume fields |
| `skill_verifications` table | `src/drizzle/schema/skills.ts` | ✅ Complete |
| `user_skills.verification_metadata` | `src/drizzle/schema/skills.ts` | ✅ Complete |
| **Relations** | `src/drizzle/relations.ts` | ✅ Complete |
| **Message Bus** | | |
| `INTERVIEW_COMPLETED` event | `src/lib/agents/events.ts` | ✅ Defined |
| `SKILL_VERIFIED` event | `src/lib/agents/events.ts` | ✅ Defined |
| Event routing to `interview.analyze` | `src/lib/agents/message-bus.ts` | ✅ Configured |
| **Trigger.dev Job** | | |
| `interview-analyzer.ts` stub | `src/trigger/jobs/interview-analyzer.ts` | ⚠️ Stub only (Phase 5.5) |
| **UI** | | |
| Interviews page placeholder | `src/app/(dashboard)/interviews/page.tsx` | ⚠️ Placeholder only |

### What's Missing

| Component | Description | Priority |
|-----------|-------------|----------|
| **Packages** | `hume`, `@humeai/voice-react` | Required |
| **Environment Variables** | `HUME_API_KEY`, `HUME_SECRET_KEY`, `NEXT_PUBLIC_HUME_CONFIG_ID` | Required |
| **API Routes** | Access token, interview CRUD, complete endpoint | Required |
| **React Components** | VoiceProvider wrapper, interview session, transcript display | Required |
| **EVI Configuration** | Hume dashboard config for Interviewer persona | Required |

---

## Hume AI Architecture

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATION FLOW                              │
│                                                                          │
│  ┌──────────┐    ┌──────────────────┐    ┌──────────────────────────┐   │
│  │  Client  │───►│  /api/hume/      │───►│  Hume OAuth2 API         │   │
│  │  (React) │    │  access-token    │    │  /oauth2-cc/token        │   │
│  └──────────┘    └──────────────────┘    └──────────────────────────┘   │
│       │                   │                          │                   │
│       │                   │ Uses HUME_API_KEY        │                   │
│       │                   │ + HUME_SECRET_KEY        │                   │
│       │                   │ (server-side)            │                   │
│       │                   │                          │                   │
│       │          ┌────────▼────────┐        ┌────────▼────────┐         │
│       │          │  Access Token   │        │  Token expires  │         │
│       │          │  (30 min TTL)   │        │  in 30 minutes  │         │
│       │          └────────┬────────┘        └─────────────────┘         │
│       │                   │                                              │
│       ▼                   ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    VoiceProvider                                 │    │
│  │  connect({ auth: { type: "accessToken", value: token } })       │    │
│  │                                                                  │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │              WebSocket Connection                        │    │    │
│  │  │  wss://api.hume.ai/v0/evi/chat?access_token={token}     │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Interview Session Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         INTERVIEW SESSION                                │
│                                                                          │
│  User clicks "Start Interview"                                           │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. Create interview record in DB (status: 'scheduled')         │    │
│  │  2. Fetch access token from /api/hume/access-token              │    │
│  │  3. Initialize VoiceProvider with configId                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  VOICE CONVERSATION (Real-time)                                  │    │
│  │                                                                  │    │
│  │  User speaks ──► Hume transcribes ──► EVI responds              │    │
│  │       │              │                    │                      │    │
│  │       ▼              ▼                    ▼                      │    │
│  │  [Audio Input]  [user_message]     [assistant_message]          │    │
│  │                 [emotion scores]   [audio_output]               │    │
│  │                                                                  │    │
│  │  All messages stored in React state via useVoice()              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                  │
│       ▼                                                                  │
│  User clicks "End Interview" OR inactivity timeout                       │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. Disconnect WebSocket                                         │    │
│  │  2. POST /api/interviews/[id]/complete                          │    │
│  │     - Save transcript + emotions to DB                          │    │
│  │     - Update status to 'completed'                              │    │
│  │  3. Publish INTERVIEW_COMPLETED event                           │    │
│  │  4. Redirect to interview summary page                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Trigger.dev: interview.analyze (Phase 5.5)                      │    │
│  │  - Analyze transcript for skill demonstrations                  │    │
│  │  - Update user_skills.verification_metadata                     │    │
│  │  - Trigger roadmap repath if gaps found                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Step 1: Install Dependencies

```bash
npm install hume @humeai/voice-react
```

**Packages:**
- `hume` - Server-side SDK for access token generation and API calls
- `@humeai/voice-react` - React hooks (`useVoice`, `VoiceProvider`) for voice UI

---

### Step 2: Create Hume EVI Configuration

Before writing code, create an EVI configuration in the [Hume Dashboard](https://platform.hume.ai):

1. Go to **EVI** → **Configurations** → **Create New**
2. Configure the Interviewer Agent:

```json
{
  "evi_version": "3",
  "name": "Career Prep Interviewer",
  "voice": {
    "provider": "HUME_AI",
    "name": "Professional Interviewer"
  },
  "language_model": {
    "model_provider": "ANTHROPIC",
    "model_resource": "claude-sonnet-4-20250514"
  },
  "event_messages": {
    "on_new_chat": {
      "enabled": true
    }
  },
  "nudges": {
    "enabled": true,
    "interval_secs": 15
  },
  "timeouts": {
    "inactivity": {
      "enabled": true,
      "duration_secs": 300
    }
  },
  "ellm_model": {
    "allow_short_responses": false
  },
  "prompt": {
    "text": "<<SYSTEM_PROMPT>>"
  }
}
```

3. Copy the **Config ID** → Save as `NEXT_PUBLIC_HUME_CONFIG_ID`

---

### Step 3: Environment Variables

**File:** `src/data/env/server.ts`

```typescript
// Add to existing schema
HUME_API_KEY: z.string().min(1, 'HUME_API_KEY is required'),
HUME_SECRET_KEY: z.string().min(1, 'HUME_SECRET_KEY is required'),
```

**File:** `src/data/env/client.ts`

```typescript
// Add to existing schema
NEXT_PUBLIC_HUME_CONFIG_ID: z.string().min(1, 'HUME_CONFIG_ID is required'),
```

**File:** `.env.local`

```env
# Hume AI Configuration
HUME_API_KEY=your_api_key_here
HUME_SECRET_KEY=your_secret_key_here
NEXT_PUBLIC_HUME_CONFIG_ID=your_config_id_here
```

---

## Database Schema (Already Exists)

The database schema is already complete. Here's a reference:

### interviews Table

```typescript
// src/drizzle/schema/interviews.ts

export const interviews = pgTable('interviews', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: varchar('user_id', { length: 255 }).notNull().references(() => users.clerk_id),

  // Hume AI session tracking
  hume_session_id: varchar('hume_session_id', { length: 255 }).unique(),

  // Interview type
  type: interviewTypeEnum('type').notNull(), // 'reality_check' | 'weekly_sprint'

  // Status tracking
  status: interviewStatusEnum('status').default('scheduled').notNull(),
  // 'scheduled' | 'in_progress' | 'completed' | 'interrupted'

  // Metrics
  duration_seconds: integer('duration_seconds'),
  overall_score: decimal('overall_score', { precision: 5, scale: 2 }),

  // Rich data from Hume
  raw_data: jsonb('raw_data').$type<{
    transcript?: Array<{
      speaker: 'user' | 'agent';
      text: string;
      timestamp: string;
      emotions?: Record<string, number>;
    }>;
    emotion_summary?: Record<string, number>;
    confidence_scores?: Record<string, number>;
    hume_response?: Record<string, unknown>;
  }>(),

  // Timestamps
  scheduled_at: timestamp('scheduled_at'),
  started_at: timestamp('started_at'),
  completed_at: timestamp('completed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
```

### skill_verifications Table

```typescript
// Already in src/drizzle/schema/skills.ts

export const skillVerifications = pgTable('skill_verifications', {
  id: varchar('id', { length: 36 }).primaryKey(),
  user_skill_id: varchar('user_skill_id').references(() => userSkills.id),
  interview_id: varchar('interview_id').references(() => interviews.id),
  verification_type: verificationTypeEnum('verification_type').notNull(),
  summary: text('summary'),
  raw_data: jsonb('raw_data').$type<{
    transcript_snippet?: string;
    evaluator_notes?: string;
    confidence_score?: number;
    duration_seconds?: number;
  }>(),
  verified_at: timestamp('verified_at').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
```

---

## API Routes

### 1. Access Token Endpoint

**File:** `src/app/api/hume/access-token/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { fetchAccessToken } from 'hume';
import { env } from '@/data/env/server';

/**
 * Generate a temporary Hume access token for client-side use.
 * Tokens expire after 30 minutes.
 */
export async function GET() {
  try {
    // Ensure user is authenticated
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch access token from Hume
    const accessToken = await fetchAccessToken({
      apiKey: env.HUME_API_KEY,
      secretKey: env.HUME_SECRET_KEY,
    });

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Failed to fetch access token' },
        { status: 500 }
      );
    }

    return NextResponse.json({ accessToken });
  } catch (error) {
    console.error('[Hume Access Token] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2. Interviews CRUD

**File:** `src/app/api/interviews/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';

// GET: List user's interviews
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userInterviews = await db.query.interviews.findMany({
    where: eq(interviews.user_id, userId),
    orderBy: [desc(interviews.created_at)],
  });

  return NextResponse.json({ interviews: userInterviews });
}

// POST: Create new interview
const createInterviewSchema = z.object({
  type: z.enum(['reality_check', 'weekly_sprint']),
  scheduled_at: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { type, scheduled_at } = createInterviewSchema.parse(body);

    const [newInterview] = await db
      .insert(interviews)
      .values({
        user_id: userId,
        type,
        status: 'scheduled',
        scheduled_at: scheduled_at ? new Date(scheduled_at) : new Date(),
      })
      .returning();

    return NextResponse.json({ interview: newInterview }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    throw error;
  }
}
```

### 3. Start Interview Session

**File:** `src/app/api/interviews/[id]/start/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { hume_session_id } = await req.json();

  // Verify interview belongs to user
  const interview = await db.query.interviews.findFirst({
    where: and(
      eq(interviews.id, id),
      eq(interviews.user_id, userId)
    ),
  });

  if (!interview) {
    return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
  }

  if (interview.status !== 'scheduled') {
    return NextResponse.json(
      { error: 'Interview already started or completed' },
      { status: 400 }
    );
  }

  // Update interview status
  const [updated] = await db
    .update(interviews)
    .set({
      status: 'in_progress',
      hume_session_id,
      started_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(interviews.id, id))
    .returning();

  return NextResponse.json({ interview: updated });
}
```

### 4. Complete Interview

**File:** `src/app/api/interviews/[id]/complete/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { publishAgentEvent } from '@/lib/agents/message-bus';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const completeInterviewSchema = z.object({
  transcript: z.array(z.object({
    speaker: z.enum(['user', 'agent']),
    text: z.string(),
    timestamp: z.string(),
    emotions: z.record(z.number()).optional(),
  })),
  emotion_summary: z.record(z.number()).optional(),
  duration_seconds: z.number(),
});

export async function POST(req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const data = completeInterviewSchema.parse(body);

    // Verify interview belongs to user and is in progress
    const interview = await db.query.interviews.findFirst({
      where: and(
        eq(interviews.id, id),
        eq(interviews.user_id, userId)
      ),
    });

    if (!interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    }

    if (interview.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Interview is not in progress' },
        { status: 400 }
      );
    }

    // Update interview with transcript and mark as completed
    const [updated] = await db
      .update(interviews)
      .set({
        status: 'completed',
        duration_seconds: data.duration_seconds,
        raw_data: {
          transcript: data.transcript,
          emotion_summary: data.emotion_summary,
        },
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(interviews.id, id))
      .returning();

    // Publish event for post-interview analysis (Phase 5.5)
    await publishAgentEvent({
      type: 'INTERVIEW_COMPLETED',
      payload: {
        interview_id: id,
        user_id: userId,
        duration_minutes: Math.round(data.duration_seconds / 60),
        interview_type: interview.type,
      },
    });

    return NextResponse.json({ interview: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    throw error;
  }
}
```

---

## React Components

### File Structure

```
src/components/interviews/
├── voice-provider-wrapper.tsx  # VoiceProvider with config
├── interview-session.tsx       # Main interview UI
├── interview-controls.tsx      # Start/End buttons
├── interview-transcript.tsx    # Real-time transcript display
├── emotion-indicator.tsx       # Emotion visualization
├── interview-timer.tsx         # Duration timer
└── interview-summary.tsx       # Post-interview summary card
```

### 1. VoiceProvider Wrapper

**File:** `src/components/interviews/voice-provider-wrapper.tsx`

```tsx
'use client';

import { VoiceProvider } from '@humeai/voice-react';
import { ReactNode } from 'react';
import { env } from '@/data/env/client';

interface VoiceProviderWrapperProps {
  children: ReactNode;
  sessionSettings?: {
    userName?: string;
    targetRoles?: string[];
    skills?: string[];
  };
}

export function VoiceProviderWrapper({
  children,
  sessionSettings,
}: VoiceProviderWrapperProps) {
  return (
    <VoiceProvider
      configId={env.NEXT_PUBLIC_HUME_CONFIG_ID}
      sessionSettings={
        sessionSettings
          ? {
              variables: {
                userName: sessionSettings.userName || 'Candidate',
                targetRoles: sessionSettings.targetRoles?.join(', ') || '',
                skills: sessionSettings.skills?.join(', ') || '',
              },
            }
          : undefined
      }
    >
      {children}
    </VoiceProvider>
  );
}
```

### 2. Interview Session Component

**File:** `src/components/interviews/interview-session.tsx`

```tsx
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useVoice, VoiceReadyState } from '@humeai/voice-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InterviewTranscript } from './interview-transcript';
import { EmotionIndicator } from './emotion-indicator';
import { InterviewTimer } from './interview-timer';
import { Mic, MicOff, Phone, PhoneOff, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface InterviewSessionProps {
  interviewId: string;
  accessToken: string;
  interviewType: 'reality_check' | 'weekly_sprint';
}

export function InterviewSession({
  interviewId,
  accessToken,
  interviewType,
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
    micFft,
  } = useVoice();

  const [isConnecting, setIsConnecting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [humeSessionId, setHumeSessionId] = useState<string | null>(null);

  // Start the interview
  const handleStart = useCallback(async () => {
    setIsConnecting(true);
    try {
      await connect({
        auth: { type: 'accessToken', value: accessToken },
      });
      setSessionStartTime(new Date());

      // Mark interview as started in DB
      const response = await fetch(`/api/interviews/${interviewId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hume_session_id: 'session_' + Date.now() }),
      });

      if (!response.ok) {
        throw new Error('Failed to start interview');
      }
    } catch (error) {
      console.error('Failed to connect:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [connect, accessToken, interviewId]);

  // End the interview
  const handleEnd = useCallback(async () => {
    if (!sessionStartTime) return;

    setIsEnding(true);
    try {
      disconnect();

      const durationSeconds = Math.round(
        (Date.now() - sessionStartTime.getTime()) / 1000
      );

      // Build transcript from messages
      const transcript = messages
        .filter((m) => m.type === 'user_message' || m.type === 'assistant_message')
        .map((m) => {
          const isUser = m.type === 'user_message';
          const msg = m as any;
          return {
            speaker: isUser ? 'user' : 'agent' as const,
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
        throw new Error('Failed to save interview');
      }

      // Redirect to summary
      router.push(`/interviews/${interviewId}/summary`);
    } catch (error) {
      console.error('Failed to end interview:', error);
    } finally {
      setIsEnding(false);
    }
  }, [disconnect, messages, sessionStartTime, interviewId, router]);

  const isConnected = readyState === VoiceReadyState.OPEN;

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>
              {interviewType === 'reality_check'
                ? 'Reality Check Interview'
                : 'Weekly Sprint Interview'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {isConnected
                ? 'Interview in progress...'
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

      {/* Main Content */}
      {isConnected && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Transcript - Main Area */}
          <div className="lg:col-span-2">
            <InterviewTranscript messages={messages} />
          </div>

          {/* Emotion Sidebar */}
          <div>
            <EmotionIndicator messages={messages} micFft={micFft} />
          </div>
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
```

### 3. Interview Transcript Component

**File:** `src/components/interviews/interview-transcript.tsx`

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { User, Bot } from 'lucide-react';

interface Message {
  type: string;
  message?: {
    role?: string;
    content?: string;
  };
  models?: {
    prosody?: {
      scores?: Record<string, number>;
    };
  };
}

interface InterviewTranscriptProps {
  messages: Message[];
}

export function InterviewTranscript({ messages }: InterviewTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const filteredMessages = messages.filter(
    (m) => m.type === 'user_message' || m.type === 'assistant_message'
  );

  return (
    <Card className="h-[500px]">
      <CardHeader>
        <CardTitle className="text-lg">Transcript</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[420px] px-6" ref={scrollRef}>
          <div className="space-y-4 pb-4">
            {filteredMessages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                The conversation will appear here...
              </p>
            ) : (
              filteredMessages.map((msg, index) => {
                const isUser = msg.type === 'user_message';
                const content = msg.message?.content || '';
                const topEmotion = isUser
                  ? getTopEmotion(msg.models?.prosody?.scores)
                  : null;

                return (
                  <div
                    key={index}
                    className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        isUser ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      {isUser ? (
                        <User className="h-4 w-4 text-primary-foreground" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>
                    <div
                      className={`flex-1 space-y-1 ${
                        isUser ? 'text-right' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {isUser ? 'You' : 'Interviewer'}
                        </span>
                        {topEmotion && (
                          <Badge variant="outline" className="text-xs">
                            {topEmotion}
                          </Badge>
                        )}
                      </div>
                      <p
                        className={`rounded-lg p-3 text-sm ${
                          isUser
                            ? 'bg-primary text-primary-foreground ml-8'
                            : 'bg-muted mr-8'
                        }`}
                      >
                        {content}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function getTopEmotion(scores?: Record<string, number>): string | null {
  if (!scores) return null;

  const entries = Object.entries(scores);
  if (entries.length === 0) return null;

  const [topEmotion] = entries.sort(([, a], [, b]) => b - a)[0];
  return topEmotion;
}
```

### 4. Emotion Indicator Component

**File:** `src/components/interviews/emotion-indicator.tsx`

```tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface Message {
  type: string;
  models?: {
    prosody?: {
      scores?: Record<string, number>;
    };
  };
}

interface EmotionIndicatorProps {
  messages: Message[];
  micFft: Float32Array | null;
}

// Top emotions we care about for interviews
const TRACKED_EMOTIONS = [
  'Confidence',
  'Concentration',
  'Interest',
  'Excitement',
  'Anxiety',
  'Confusion',
] as const;

export function EmotionIndicator({ messages, micFft }: EmotionIndicatorProps) {
  // Get the latest user message with emotions
  const latestUserMessage = [...messages]
    .reverse()
    .find((m) => m.type === 'user_message' && m.models?.prosody?.scores);

  const emotions = latestUserMessage?.models?.prosody?.scores || {};

  // Calculate audio level from FFT
  const audioLevel = micFft
    ? Math.min(100, (Array.from(micFft).reduce((a, b) => a + b, 0) / micFft.length) * 500)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Emotional Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Audio Level Indicator */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Voice Activity</span>
            <span>{Math.round(audioLevel)}%</span>
          </div>
          <Progress value={audioLevel} className="h-2" />
        </div>

        <div className="h-px bg-border my-4" />

        {/* Tracked Emotions */}
        <div className="space-y-3">
          {TRACKED_EMOTIONS.map((emotion) => {
            const score = emotions[emotion] || 0;
            const percentage = Math.round(score * 100);

            return (
              <div key={emotion} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{emotion}</span>
                  <span className="text-muted-foreground">{percentage}%</span>
                </div>
                <Progress
                  value={percentage}
                  className={`h-1.5 ${getEmotionColor(emotion)}`}
                />
              </div>
            );
          })}
        </div>

        {Object.keys(emotions).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Start speaking to see emotional analysis...
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function getEmotionColor(emotion: string): string {
  switch (emotion) {
    case 'Confidence':
    case 'Interest':
    case 'Excitement':
      return '[&>div]:bg-green-500';
    case 'Anxiety':
    case 'Confusion':
      return '[&>div]:bg-amber-500';
    default:
      return '';
  }
}
```

### 5. Interview Timer

**File:** `src/components/interviews/interview-timer.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface InterviewTimerProps {
  startTime: Date;
}

export function InterviewTimer({ startTime }: InterviewTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <div className="flex items-center gap-2 text-lg font-mono">
      <Clock className="h-5 w-5 text-muted-foreground" />
      <span>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}
```

---

## Interview Flow

### Updated Interviews Page

**File:** `src/app/(dashboard)/interviews/page.tsx`

```tsx
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { interviews, users, userProfiles } from '@/drizzle/schema';
import { eq, desc } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, Calendar, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default async function InterviewsPage() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  // Fetch user's interviews
  const userInterviews = await db.query.interviews.findMany({
    where: eq(interviews.user_id, userId),
    orderBy: [desc(interviews.created_at)],
  });

  // Check if user has completed Reality Check
  const completedRealityCheck = userInterviews.some(
    (i) => i.type === 'reality_check' && i.status === 'completed'
  );

  // Get pending/scheduled interviews
  const pendingInterviews = userInterviews.filter(
    (i) => i.status === 'scheduled' || i.status === 'in_progress'
  );

  // Get completed interviews
  const completedInterviews = userInterviews.filter(
    (i) => i.status === 'completed'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Interviews
        </h1>
        <p className="text-muted-foreground">
          Complete voice interviews to verify your skills and unlock opportunities.
        </p>
      </div>

      {/* Reality Check Card */}
      {!completedRealityCheck && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              <CardTitle>Reality Check Interview</CardTitle>
            </div>
            <CardDescription>
              Your first interview establishes a baseline of your skills. This 30-60
              minute conversation helps us understand your true capabilities and
              create a personalized learning path.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/interviews/new?type=reality_check">
                Schedule Reality Check
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Weekly Sprint Card */}
      {completedRealityCheck && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Weekly Sprint Interview</CardTitle>
            </div>
            <CardDescription>
              Short 10-15 minute check-ins to verify your learning progress and
              update your skill verifications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/interviews/new?type=weekly_sprint">
                Schedule Sprint
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending Interviews */}
      {pendingInterviews.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Upcoming Interviews</h2>
          <div className="grid gap-4">
            {pendingInterviews.map((interview) => (
              <Card key={interview.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                      <Clock className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {interview.type === 'reality_check'
                          ? 'Reality Check Interview'
                          : 'Weekly Sprint Interview'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {interview.status === 'in_progress'
                          ? 'In progress...'
                          : interview.scheduled_at
                            ? new Date(interview.scheduled_at).toLocaleString()
                            : 'Ready to start'}
                      </p>
                    </div>
                  </div>
                  <Button asChild>
                    <Link href={`/interviews/${interview.id}`}>
                      {interview.status === 'in_progress' ? 'Resume' : 'Start'}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Interview History */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Interview History</h2>
        {completedInterviews.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                No completed interviews yet. Start your Reality Check to begin.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {completedInterviews.map((interview) => (
              <Card key={interview.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {interview.type === 'reality_check'
                          ? 'Reality Check Interview'
                          : 'Weekly Sprint Interview'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {interview.completed_at
                          ? new Date(interview.completed_at).toLocaleDateString()
                          : 'Completed'}{' '}
                        • {Math.round((interview.duration_seconds || 0) / 60)} min
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {interview.overall_score && (
                      <Badge variant="secondary">
                        Score: {Number(interview.overall_score).toFixed(0)}%
                      </Badge>
                    )}
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/interviews/${interview.id}/summary`}>
                        View Details
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

### Interview Session Page

**File:** `src/app/(dashboard)/interviews/[id]/page.tsx`

```tsx
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { interviews, users, userProfiles, userSkills, skills } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import { fetchAccessToken } from 'hume';
import { env } from '@/data/env/server';
import { VoiceProviderWrapper } from '@/components/interviews/voice-provider-wrapper';
import { InterviewSession } from '@/components/interviews/interview-session';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InterviewSessionPage({ params }: PageProps) {
  const { userId } = await auth();
  const { id } = await params;

  if (!userId) {
    redirect('/sign-in');
  }

  // Fetch interview
  const interview = await db.query.interviews.findFirst({
    where: and(
      eq(interviews.id, id),
      eq(interviews.user_id, userId)
    ),
  });

  if (!interview) {
    notFound();
  }

  // If already completed, redirect to summary
  if (interview.status === 'completed') {
    redirect(`/interviews/${id}/summary`);
  }

  // Fetch user profile and skills for context
  const user = await db.query.users.findFirst({
    where: eq(users.clerk_id, userId),
    with: {
      profile: true,
      skills: {
        with: {
          skill: true,
        },
      },
    },
  });

  // Generate Hume access token
  const accessToken = await fetchAccessToken({
    apiKey: env.HUME_API_KEY,
    secretKey: env.HUME_SECRET_KEY,
  });

  if (!accessToken) {
    throw new Error('Failed to fetch Hume access token');
  }

  // Prepare session settings
  const sessionSettings = {
    userName: user?.first_name || 'Candidate',
    targetRoles: user?.profile?.target_roles || [],
    skills: user?.skills.map((us) => us.skill?.name).filter(Boolean) as string[],
  };

  return (
    <VoiceProviderWrapper sessionSettings={sessionSettings}>
      <InterviewSession
        interviewId={id}
        accessToken={accessToken}
        interviewType={interview.type}
      />
    </VoiceProviderWrapper>
  );
}
```

### New Interview Page

**File:** `src/app/(dashboard)/interviews/new/page.tsx`

```tsx
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { redirect } from 'next/navigation';

interface PageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function NewInterviewPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  const { type } = await searchParams;

  if (!userId) {
    redirect('/sign-in');
  }

  const interviewType = type === 'weekly_sprint' ? 'weekly_sprint' : 'reality_check';

  // Create new interview
  const [newInterview] = await db
    .insert(interviews)
    .values({
      user_id: userId,
      type: interviewType,
      status: 'scheduled',
      scheduled_at: new Date(),
    })
    .returning();

  // Redirect to interview session
  redirect(`/interviews/${newInterview.id}`);
}
```

---

## System Prompts

### Reality Check Interview Prompt

```text
You are an empathetic but thorough technical interviewer for Career Prep, an AI-powered career development platform.

## YOUR ROLE
You are conducting a "Reality Check Interview" - an initial assessment to understand the candidate's true skill level and career goals. This is NOT a job interview; it's a supportive assessment to help create a personalized learning roadmap.

## CANDIDATE CONTEXT
- Name: {{userName}}
- Target Roles: {{targetRoles}}
- Self-Reported Skills: {{skills}}

## INTERVIEW STRUCTURE (30-60 minutes)

### Phase 1: Warm-Up (5 minutes)
- Greet the candidate warmly
- Explain the purpose: "This isn't a job interview. I'm here to understand your current skills and goals so we can create the perfect learning path for you."
- Ask about their career aspirations and what excites them about their target role

### Phase 2: Skill Verification (20-40 minutes)
For each self-reported skill:
1. Ask conceptual questions to verify understanding
2. Probe deeper with "Can you explain how..." or "What happens when..."
3. Request examples from their experience
4. Note their confidence level (voice tone, hesitation, clarity)

Use these verification types:
- **Concept Explanation**: "Explain [concept] as if teaching a junior developer"
- **Problem Solving**: "How would you approach [scenario]?"
- **Experience Sharing**: "Tell me about a time you used [skill] in a project"

### Phase 3: Gap Discovery (10 minutes)
- Identify skills they may be overestimating
- Discover hidden strengths they didn't mention
- Understand their learning style and preferences

### Phase 4: Wrap-Up (5 minutes)
- Summarize key observations
- Express encouragement about their potential
- Explain next steps (roadmap generation, learning modules)

## IMPORTANT GUIDELINES

1. **Be Supportive, Not Harsh**: This is an assessment, not a gatekeeping interview. Encourage honest self-reflection.

2. **Detect Overconfidence vs. Competence**:
   - Overconfident: Quick answers but shallow understanding
   - Competent: May pause to think but gives thorough answers

3. **Note Emotional Cues**: Pay attention to when the candidate seems confident, nervous, or uncertain. This data helps calibrate skill assessments.

4. **Adaptive Questioning**:
   - If they struggle, make questions easier
   - If they excel, probe deeper

5. **Time Management**: Don't spend too long on one skill. Move on if you've gathered enough signal.

6. **Capture Verification Evidence**: When a candidate demonstrates a skill well, note the specific example or explanation they gave.

## WHAT TO AVOID
- Don't make the candidate feel judged or inadequate
- Don't use trick questions or gotchas
- Don't rush through skills without proper verification
- Don't be robotic - maintain natural conversation flow
```

### Weekly Sprint Interview Prompt

```text
You are a supportive learning coach for Career Prep, conducting a brief "Weekly Sprint Interview" to verify learning progress.

## YOUR ROLE
This is a quick 10-15 minute check-in to verify what the candidate learned this week and update their skill verifications.

## CANDIDATE CONTEXT
- Name: {{userName}}
- This Week's Learning Focus: {{currentModuleTitle}}
- Skills Being Developed: {{moduleSkills}}

## INTERVIEW STRUCTURE (10-15 minutes)

### Quick Check-In (2 minutes)
- Greet warmly
- Ask how their learning week went
- Inquire about any challenges or wins

### Skill Verification (8-10 minutes)
Focus on the skills they practiced this week:
- Ask them to explain a concept they learned
- Request a brief walkthrough of any projects they built
- Probe understanding with "Why does X work that way?" questions

### Wrap-Up (2 minutes)
- Acknowledge their progress
- Provide encouragement
- Mention what's next in their roadmap

## GUIDELINES
- Keep it conversational and light
- Focus on growth, not perfection
- Celebrate small wins
- Note any skills that need more practice
```

---

## Security Considerations

### 1. Access Token Protection

- Access tokens are generated server-side only
- Tokens expire after 30 minutes
- Never expose `HUME_API_KEY` or `HUME_SECRET_KEY` to client

### 2. Interview Authorization

- All API routes verify user owns the interview
- Clerk authentication required for all interview operations
- Session data is user-scoped

### 3. Rate Limiting

Consider adding Arcjet rate limiting to interview endpoints:

```typescript
// In API routes
import { arcjet, slidingWindow } from '@arcjet/next';

const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  rules: [
    slidingWindow({
      mode: 'LIVE',
      interval: '1h',
      max: 5, // Max 5 interview starts per hour
    }),
  ],
});
```

### 4. Data Privacy

- Interview transcripts contain sensitive career information
- Consider encryption at rest for `raw_data` column
- Implement data retention policies (GDPR compliance)

---

## Testing Strategy

### Manual Testing Checklist

1. **Access Token Flow**
   - [ ] Token generates successfully
   - [ ] Token works with Hume WebSocket
   - [ ] Expired token is rejected

2. **Interview CRUD**
   - [ ] Create interview works
   - [ ] List interviews shows correct data
   - [ ] Start interview updates status
   - [ ] Complete interview saves transcript

3. **Voice Session**
   - [ ] VoiceProvider connects successfully
   - [ ] Audio input is captured
   - [ ] Transcription appears in real-time
   - [ ] Emotion scores display correctly
   - [ ] Mute/unmute works

4. **End-to-End Flow**
   - [ ] Full Reality Check interview (30+ minutes)
   - [ ] Interview data persists correctly
   - [ ] `INTERVIEW_COMPLETED` event fires
   - [ ] Redirect to summary works

### Integration Tests

```typescript
// Example test structure
describe('Interview API', () => {
  it('should create a new interview', async () => {
    const response = await fetch('/api/interviews', {
      method: 'POST',
      body: JSON.stringify({ type: 'reality_check' }),
    });
    expect(response.status).toBe(201);
  });

  it('should complete an interview with transcript', async () => {
    // Create interview, start it, then complete
  });
});
```

---

## Implementation Checklist

### Phase 5.1: Setup & Configuration
- [ ] Install packages: `npm install hume @humeai/voice-react`
- [ ] Create Hume account and EVI configuration
- [ ] Add environment variables to `server.ts` and `client.ts`
- [ ] Add `.env.local` values

### Phase 5.2: API Routes
- [ ] Create `/api/hume/access-token/route.ts`
- [ ] Create `/api/interviews/route.ts` (GET, POST)
- [ ] Create `/api/interviews/[id]/start/route.ts`
- [ ] Create `/api/interviews/[id]/complete/route.ts`

### Phase 5.3: React Components
- [ ] Create `voice-provider-wrapper.tsx`
- [ ] Create `interview-session.tsx`
- [ ] Create `interview-transcript.tsx`
- [ ] Create `emotion-indicator.tsx`
- [ ] Create `interview-timer.tsx`

### Phase 5.4: Pages
- [ ] Update `/interviews/page.tsx` with real functionality
- [ ] Create `/interviews/new/page.tsx`
- [ ] Create `/interviews/[id]/page.tsx` (session)
- [ ] Create `/interviews/[id]/summary/page.tsx`

### Phase 5.5: Integration & Testing
- [ ] Test access token generation
- [ ] Test full interview flow
- [ ] Verify `INTERVIEW_COMPLETED` event fires
- [ ] Verify transcript saves correctly
- [ ] Test error handling (disconnection, timeout)

### Phase 5.6: Polish
- [ ] Add loading states and skeletons
- [ ] Add error boundaries
- [ ] Add interview preparation tips UI
- [ ] Add microphone permission handling

---

## Dependencies & Blockers

### Requires Before Phase 5
- [x] Phase 3.5: Message Bus (COMPLETED)
- [x] Database schema for interviews (EXISTS)
- [x] Event types defined (EXISTS)

### Enables After Phase 5
- **Phase 5.5: Truth Loop** - Implements `interview-analyzer.ts` job to:
  - Analyze transcripts for skill demonstrations
  - Update `user_skills.verification_metadata`
  - Trigger roadmap re-pathing if gaps found

---

## Open Questions

1. **Interview Duration Limits**
   - Should Reality Check have a max duration (e.g., 90 minutes)?
   - Should we warn users at certain time thresholds?

2. **Reconnection Handling**
   - If connection drops, should we allow resume?
   - How to handle partial transcripts?

3. **Scheduling vs. Instant Start**
   - Should users schedule interviews for later?
   - Or always start immediately?

4. **Audio Recording**
   - Should we save audio alongside transcript?
   - Storage implications vs. verification value?

5. **Interview Retakes**
   - Can users retake Reality Check?
   - How many Weekly Sprints per week?

---

*Last Updated: January 1, 2025*
*Next Phase: 5.5 - Truth Loop (Post-Interview Analysis)*
