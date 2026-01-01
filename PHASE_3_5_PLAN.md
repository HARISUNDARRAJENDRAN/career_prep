# Phase 3.5: Agentic Orchestrator - Message Bus Implementation Plan

> **Created:** December 31, 2024
> **Status:** Planning
> **Priority:** CRITICAL
> **Estimated Complexity:** Medium-High

---

## Table of Contents

1. [Current Project State](#current-project-state)
2. [The Problem](#the-problem)
3. [The Solution](#the-solution)
4. [Technical Architecture](#technical-architecture)
5. [Senior Engineer Refinements](#senior-engineer-refinements)
6. [Implementation Steps](#implementation-steps)
7. [File Structure](#file-structure)
8. [Database Schema](#database-schema)
9. [Event Types Reference](#event-types-reference)
10. [Dependencies & Prerequisites](#dependencies--prerequisites)
11. [Open Questions](#open-questions)

---

## Current Project State

### End Goal

Career Prep is a **multi-agent orchestration system** designed to automate the transition from student to professional. The system uses 5 specialized agents:

| Agent | Responsibility | Current Status |
|-------|---------------|----------------|
| **Interviewer Agent** | Hume AI voice interviews for skill verification | Schema ready, not implemented |
| **Sentinel Agent** | Market intelligence scraping (Jooble/Adzuna) | Schema ready, not implemented |
| **Architect Agent** | Personalized learning roadmap generation | Schema ready, not implemented |
| **Action Agent** | Autonomous job application via RAG | Schema ready, not implemented |
| **Strategist Agent** | Rejection parsing and roadmap re-pathing | Schema ready, not implemented |

### What's Completed

| Component | Status | Notes |
|-----------|--------|-------|
| Clerk Authentication | ✅ Complete | Full integration with webhooks, user sync |
| Arcjet Security | ✅ Complete | Rate limiting, bot detection configured |
| Environment Validation | ✅ Complete | t3-env + Zod for all env vars |
| Shadcn UI + Dark Mode | ✅ Complete | 23+ components installed |
| PostgreSQL + Drizzle ORM | ✅ Complete | 12 tables with full relations |
| Onboarding Wizard | ✅ Complete | 6-step flow with auto-save |
| Resume Parser | ✅ Complete | Python FastAPI + OpenAI fallback |
| Skills Normalization | ✅ Complete | Alias mapping, fuzzy matching, catalog seeding |
| Dashboard Layout | ✅ Complete | Sidebar, navigation, protected routes |
| Core API Routes | ✅ Complete | Users, Roadmaps, Skills, Jobs CRUD |

### What's NOT Implemented (Schema Ready)

| Feature | Blocking Issue |
|---------|---------------|
| Hume AI Voice Interviews | No Hume SDK integration |
| Roadmap Generation | No Architect Agent logic |
| Job Scrapers | No Jooble/Adzuna API integration |
| Auto-Apply | No RAG/Vector DB foundation |
| Rejection Parsing | No email parsing service |
| **Agent Message Bus** | **No inter-agent communication layer** |
| **Vector DB / RAG** | **Fields exist in schema, not used** |

### Current Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js | 16.1 (Stable) |
| React | React | 19.2 |
| Auth | Clerk | v6.20 |
| Database | PostgreSQL + Drizzle ORM | v0.45.1 |
| Styling | Tailwind CSS | v4 |
| UI Library | Shadcn UI | Latest |
| Charts | Recharts | v2.15 |
| Forms | React Hook Form + Zod | v7.69 / v4.2 |
| Security | Arcjet | v1.0.0-beta.15 |
| AI | OpenAI GPT-4o | v6.15 |

---

## The Problem

### Agent Isolation

The five agents are currently **isolated domains** with no shared state manager or communication layer. Each agent operates independently with no way to:

1. **Notify other agents** when something important happens
2. **Trigger workflows** across agent boundaries
3. **Share state** or coordinate actions

### Real-World Examples

| Scenario | Current Behavior | Expected Behavior |
|----------|-----------------|-------------------|
| Sentinel finds trending job | Data sits in `job_listings` table | Should notify Architect to add skill module |
| Interview verifies a skill | `skill_verifications` updated | Should trigger Action Agent to auto-apply to matching jobs |
| User gets rejected | Feedback stored in `application_feedback` | Should trigger Strategist to re-path roadmap |
| Market demand shifts | `market_insights` updated daily | Should notify all users with affected target roles |

### Technical Limitations

1. **Next.js Server Actions timeout**: Limited to 30-60 seconds
2. **No background processing**: Long tasks block the UI
3. **No event-driven architecture**: Agents can't react to each other
4. **No audit trail**: No visibility into what agents are doing

---

## The Solution

### Background Job Processor + Event-Driven Architecture

Implement a **message bus** using **Trigger.dev** (or BullMQ) that:

1. **Persists events** to database for audit trail
2. **Routes events** to appropriate background jobs
3. **Handles long-running tasks** without blocking UI
4. **Enables inter-agent communication** via typed events

### Provider Comparison

| Feature | Trigger.dev | BullMQ |
|---------|-------------|--------|
| Hosting | Serverless (managed) | Self-hosted |
| Vercel Compatibility | Excellent | Requires separate worker |
| Dashboard | Built-in UI | Requires Bull Board |
| Pricing | Free tier available | Free (Redis costs) |
| Setup Complexity | Low | Medium |
| Control | Medium | Full |
| Redis Required | No | Yes |

**Recommendation:** Start with **Trigger.dev** for development simplicity and Vercel compatibility. Migrate to BullMQ if self-hosting requirements emerge.

---

## Technical Architecture

### Event Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MESSAGE BUS (Trigger.dev)                        │
│                                                                          │
│  ┌───────────┐   ┌────────────┐   ┌───────────┐   ┌───────────┐        │
│  │ Sentinel  │   │Interviewer │   │ Architect │   │  Action   │        │
│  │   Agent   │   │   Agent    │   │   Agent   │   │   Agent   │        │
│  └─────┬─────┘   └──────┬─────┘   └─────┬─────┘   └─────┬─────┘        │
│        │                │               │               │               │
│        ▼                ▼               ▼               ▼               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      AGENT EVENT QUEUE                            │  │
│  │                                                                    │  │
│  │  • MARKET_UPDATE           • INTERVIEW_COMPLETED                  │  │
│  │  • JOB_MATCH_FOUND         • SKILL_VERIFIED                       │  │
│  │  • REJECTION_PARSED        • ROADMAP_REPATH_NEEDED                │  │
│  │  • ONBOARDING_COMPLETED    • AUTO_APPLY_TRIGGERED                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                │                                        │
│                                ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      STRATEGIST AGENT                             │  │
│  │       (Orchestrates responses, triggers re-pathing, feedback)     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                       ┌──────────────────┐
                       │   PostgreSQL DB   │
                       │  (Source of Truth)│
                       └──────────────────┘
```

### Message Bus Flow

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Server     │────▶│  Message Bus    │────▶│  Trigger.dev    │
│  Action     │     │  publishEvent() │     │  Background Job │
└─────────────┘     └────────┬────────┘     └────────┬────────┘
                             │                       │
                             ▼                       ▼
                    ┌─────────────────┐     ┌─────────────────┐
                    │  agent_events   │     │  Job Execution  │
                    │  (Audit Trail)  │     │  (Long-running) │
                    └─────────────────┘     └─────────────────┘
```

---

## Senior Engineer Refinements

> **Critical production-grade patterns** that differentiate a robust system from a toy prototype.

### 1. Idempotency (The "Double-Trigger" Problem)

#### The Risk

Background jobs can trigger multiple times due to:
- Network retries (Trigger.dev/BullMQ retry on timeout)
- Webhook duplicate delivery
- User double-clicking (if event is user-triggered)

**Real-World Failure Mode:** If `INTERVIEW_COMPLETED` triggers twice, you might:
- Generate two conflicting roadmaps
- Send duplicate notifications
- Double-count skill verifications
- Corrupt `verification_metadata` with conflicting data

#### The Fix: Idempotency Key Pattern

Use `agent_events.id` as an **Idempotency Key** inside every Trigger.dev task.

```typescript
// FIRST LINE of every job handler
export const interviewAnalyzer = task({
  id: 'interview.analyze',
  run: async (payload: { event_id: string; /* ... */ }) => {
    // ⚠️ IDEMPOTENCY CHECK - Must be first!
    const event = await db.query.agentEvents.findFirst({
      where: eq(agentEvents.id, payload.event_id),
    });

    // Already processed? Exit immediately.
    if (event?.status === 'completed') {
      console.log(`Event ${payload.event_id} already processed, skipping.`);
      return { success: true, skipped: true, reason: 'already_processed' };
    }

    // Already being processed by another worker?
    if (event?.status === 'processing') {
      const processingTime = Date.now() - event.created_at.getTime();
      // Only skip if processing started < 5 minutes ago (avoid stuck jobs)
      if (processingTime < 5 * 60 * 1000) {
        console.log(`Event ${payload.event_id} already processing, skipping.`);
        return { success: true, skipped: true, reason: 'already_processing' };
      }
    }

    // Proceed with actual job logic...
  },
});
```

#### Helper Function

Add to `src/lib/agents/message-bus.ts`:

```typescript
/**
 * Check if an event has already been processed (idempotency check)
 * Call this at the START of every job handler
 *
 * @returns true if job should be skipped
 */
export async function shouldSkipEvent(eventId: string): Promise<{
  skip: boolean;
  reason?: 'already_completed' | 'already_processing' | 'not_found';
}> {
  const event = await db.query.agentEvents.findFirst({
    where: eq(agentEvents.id, eventId),
  });

  if (!event) {
    return { skip: true, reason: 'not_found' };
  }

  if (event.status === 'completed') {
    return { skip: true, reason: 'already_completed' };
  }

  if (event.status === 'processing') {
    const processingTime = Date.now() - event.created_at.getTime();
    // Only skip if processing started < 5 minutes ago
    if (processingTime < 5 * 60 * 1000) {
      return { skip: true, reason: 'already_processing' };
    }
  }

  return { skip: false };
}
```

---

### 2. Event Priority Queuing

#### The Risk

If the Sentinel Agent is scraping 1,000 jobs (slow, low-priority), it might clog the message bus, delaying a user's `INTERVIEW_COMPLETED` analysis that they're actively waiting for.

**Real-World Failure Mode:**
- User finishes interview at 2:00 PM
- Sentinel's daily market scrape started at 1:55 PM (processing 500 jobs)
- User's interview analysis is queued behind 500 job embedding tasks
- User waits 30+ minutes for their skill verification results

#### The Fix: Priority Column

Add a `priority` column to `agent_events` table (1-10 scale):

| Priority | Description | Example Events |
|----------|-------------|----------------|
| **10** (Highest) | User-facing, real-time expectations | `INTERVIEW_COMPLETED`, `SKILL_VERIFIED` |
| **7** | User-triggered, moderate urgency | `ONBOARDING_COMPLETED`, `AUTO_APPLY_TRIGGERED` |
| **5** (Default) | System-triggered, no user waiting | `REJECTION_PARSED`, `ROADMAP_REPATH_NEEDED` |
| **3** | Background processing | `JOB_MATCH_FOUND`, `APPLICATION_SUBMITTED` |
| **1** (Lowest) | Bulk operations, can be delayed | `MARKET_UPDATE` (daily scrape) |

#### Schema Update

```typescript
// In agent-events.ts schema
priority: integer('priority').default(5).notNull(),
```

#### Priority Assignment

```typescript
// In events.ts
export const EVENT_PRIORITIES: Record<AgentEventType, number> = {
  // User-facing, real-time (Priority 10)
  INTERVIEW_COMPLETED: 10,
  SKILL_VERIFIED: 10,

  // User-triggered (Priority 7)
  ONBOARDING_COMPLETED: 7,
  AUTO_APPLY_TRIGGERED: 7,

  // System-triggered (Priority 5)
  REJECTION_PARSED: 5,
  ROADMAP_REPATH_NEEDED: 5,

  // Background (Priority 3)
  JOB_MATCH_FOUND: 3,
  APPLICATION_SUBMITTED: 3,

  // Bulk operations (Priority 1)
  MARKET_UPDATE: 1,
};
```

#### Trigger.dev Queue Configuration

```typescript
// In trigger.config.ts
export default defineConfig({
  project: 'career-prep',
  // ... other config

  // Define priority queues
  queues: {
    'high-priority': {
      concurrencyLimit: 10, // Process more high-priority jobs concurrently
    },
    'default': {
      concurrencyLimit: 5,
    },
    'low-priority': {
      concurrencyLimit: 2, // Limit bulk operations
    },
  },
});
```

#### Dispatching to Correct Queue

```typescript
// In message-bus.ts dispatchToTrigger()
async function dispatchToTrigger(event: AgentEvent, eventId: string): Promise<void> {
  const priority = EVENT_PRIORITIES[event.type];

  // Determine queue based on priority
  const queue = priority >= 7 ? 'high-priority'
              : priority >= 3 ? 'default'
              : 'low-priority';

  switch (event.type) {
    case 'INTERVIEW_COMPLETED':
      await tasks.trigger('interview.analyze', {
        ...event.payload,
        event_id: eventId,
      }, { queue }); // ← Pass queue option
      break;
    // ... other cases
  }
}
``

---

### 3. Strategist as Global Listener (Event Aggregator Pattern)

#### The Concept

In the architecture diagram, the Strategist Agent sits at the bottom, "orchestrating" all other agents. This isn't just visual—**the Strategist should subscribe to ALL events** as a global listener.

#### Why?

The Strategist's job is to:
1. **Monitor user progress** across all agents
2. **Detect patterns** (e.g., "user failed 3 interviews in a row")
3. **Trigger cross-cutting concerns** (e.g., "send encouragement email")
4. **Maintain the "big picture"** of user's career journey

#### Implementation: Global Event Listener

```typescript
// src/trigger/jobs/strategist-listener.ts

import { task } from '@trigger.dev/sdk/v3';
import { db } from '@/drizzle/db';
import { agentEvents } from '@/drizzle/schema';
import { publishAgentEvent } from '@/lib/agents/message-bus';

/**
 * Global listener that processes ALL events for cross-cutting concerns.
 * This runs AFTER the primary handler completes.
 */
export const strategistGlobalListener = task({
  id: 'strategist.global-listener',
  run: async (payload: {
    event_id: string;
    event_type: string;
    user_id?: string;
  }) => {
    const { event_type, user_id } = payload;

    // Skip if no user context
    if (!user_id) return { processed: false };

    // Pattern detection based on event type
    switch (event_type) {
      case 'INTERVIEW_COMPLETED':
        await checkInterviewPatterns(user_id);
        break;

      case 'REJECTION_PARSED':
        await checkRejectionPatterns(user_id);
        break;

      case 'SKILL_VERIFIED':
        await checkProgressMilestones(user_id);
        break;

      case 'APPLICATION_SUBMITTED':
        await trackApplicationVelocity(user_id);
        break;
    }

    return { processed: true };
  },
});

/**
 * Detect if user is struggling with interviews
 */
async function checkInterviewPatterns(userId: string): Promise<void> {
  // Get last 5 interviews
  const recentInterviews = await db.query.interviews.findMany({
    where: eq(interviews.user_id, userId),
    orderBy: [desc(interviews.created_at)],
    limit: 5,
  });

  // Check for concerning patterns
  const lowScoreCount = recentInterviews.filter(
    (i) => i.raw_data?.overall_score < 50
  ).length;

  if (lowScoreCount >= 3) {
    // User struggling - trigger intervention
    await publishAgentEvent({
      type: 'ROADMAP_REPATH_NEEDED',
      payload: {
        user_id: userId,
        reason: 'skill_verification_gaps',
        details: {
          trigger: 'consecutive_low_interview_scores',
          count: lowScoreCount,
          recommendation: 'focus_on_fundamentals',
        },
      },
    });
  }
}

/**
 * Detect rejection patterns for strategic intervention
 */
async function checkRejectionPatterns(userId: string): Promise<void> {
  // Get rejections from last 30 days
  const recentRejections = await db.query.applicationFeedback.findMany({
    where: and(
      eq(applicationFeedback.user_id, userId),
      eq(applicationFeedback.feedback_type, 'rejection'),
      gte(applicationFeedback.received_at, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    ),
  });

  // Aggregate common rejection reasons
  const gapFrequency: Record<string, number> = {};
  for (const rejection of recentRejections) {
    const gaps = rejection.parsed_data?.extracted_gaps || [];
    for (const gap of gaps) {
      gapFrequency[gap] = (gapFrequency[gap] || 0) + 1;
    }
  }

  // Find skills mentioned in 3+ rejections
  const criticalGaps = Object.entries(gapFrequency)
    .filter(([, count]) => count >= 3)
    .map(([skill]) => skill);

  if (criticalGaps.length > 0) {
    await publishAgentEvent({
      type: 'ROADMAP_REPATH_NEEDED',
      payload: {
        user_id: userId,
        reason: 'rejection_feedback',
        details: {
          critical_gaps: criticalGaps,
          rejection_count: recentRejections.length,
          priority: 'high',
        },
      },
    });
  }
}

/**
 * Celebrate progress milestones
 */
async function checkProgressMilestones(userId: string): Promise<void> {
  const verifiedSkillsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(userSkills)
    .where(
      and(
        eq(userSkills.user_id, userId),
        sql`verification_metadata->>'is_verified' = 'true'`
      )
    );

  const count = verifiedSkillsCount[0]?.count || 0;

  // Milestone thresholds
  const milestones = [5, 10, 25, 50];
  if (milestones.includes(count)) {
    // TODO: Trigger celebration notification
    console.log(`User ${userId} reached ${count} verified skills milestone!`);
  }
}

/**
 * Track application submission velocity
 */
async function trackApplicationVelocity(userId: string): Promise<void> {
  // Get applications from last 7 days
  const weeklyApplications = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.user_id, userId),
        gte(jobApplications.created_at, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      )
    );

  const count = weeklyApplications[0]?.count || 0;

  // Store velocity metric for trend analysis
  // TODO: Add to user_metrics table
  console.log(`User ${userId} submitted ${count} applications this week`);
}
```

#### Wiring Up Global Listener

Update `dispatchToTrigger()` to ALWAYS trigger the global listener after primary dispatch:

```typescript
async function dispatchToTrigger(event: AgentEvent, eventId: string): Promise<void> {
  // ... existing switch statement for primary dispatch ...

  // ALWAYS trigger global listener (Strategist pattern)
  if ('user_id' in event.payload) {
    await tasks.trigger('strategist.global-listener', {
      event_id: eventId,
      event_type: event.type,
      user_id: event.payload.user_id,
    }, { queue: 'low-priority' }); // Run at low priority, non-blocking
  }
}
```

---

### Summary of Refinements

| Refinement | Problem Solved | Implementation |
|------------|----------------|----------------|
| **Idempotency** | Double-trigger corruption | Check event status at job start |
| **Priority Queuing** | Slow jobs blocking fast jobs | `priority` column + queue routing |
| **Global Listener** | No cross-cutting pattern detection | Strategist subscribes to all events |

---

## Implementation Steps

### Step 1: Install Trigger.dev

```bash
# Initialize Trigger.dev in the project
npx trigger.dev@latest init

# This will:
# - Create trigger.config.ts
# - Create src/trigger/ directory
# - Add TRIGGER_SECRET_KEY to .env
```

### Step 2: Create Agent Events Schema

**File:** `src/drizzle/schema/agent-events.ts`

```typescript
import { pgTable, varchar, text, timestamp, jsonb, pgEnum, integer } from 'drizzle-orm/pg-core';

export const eventStatusEnum = pgEnum('event_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const agentEvents = pgTable('agent_events', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Event identification
  event_type: varchar('event_type', { length: 50 }).notNull(),

  // Event data
  payload: jsonb('payload').notNull(),

  // Processing status
  status: eventStatusEnum('status').default('pending').notNull(),

  // Priority for queue routing (1=lowest, 10=highest)
  // High priority (10): User-facing events (INTERVIEW_COMPLETED)
  // Low priority (1): Bulk operations (MARKET_UPDATE)
  priority: integer('priority').default(5).notNull(),

  // Agent routing
  source_agent: varchar('source_agent', { length: 50 }),
  target_agent: varchar('target_agent', { length: 50 }),

  // Timestamps
  created_at: timestamp('created_at').defaultNow().notNull(),
  processed_at: timestamp('processed_at'),

  // Error handling
  error_message: text('error_message'),
  retry_count: integer('retry_count').default(0).notNull(),
});
```

### Step 3: Define Agent Event Types

**File:** `src/lib/agents/events.ts`

```typescript
/**
 * Discriminated union of all agent events
 * Each event type has a specific payload structure
 */
export type AgentEvent =
  // Onboarding Events
  | {
      type: 'ONBOARDING_COMPLETED';
      payload: {
        user_id: string;
        target_roles: string[];
        skills_count: number;
      };
    }

  // Interviewer Agent Events
  | {
      type: 'INTERVIEW_COMPLETED';
      payload: {
        interview_id: string;
        user_id: string;
        duration_minutes: number;
      };
    }
  | {
      type: 'SKILL_VERIFIED';
      payload: {
        user_id: string;
        skill_id: string;
        user_skill_id: string;
        confidence: number;
        verification_type: 'live_coding' | 'concept_explanation' | 'project_demo';
      };
    }

  // Sentinel Agent Events
  | {
      type: 'MARKET_UPDATE';
      payload: {
        skills: string[];
        demand_scores: Record<string, number>;
        trending_roles: string[];
        region?: string;
      };
    }
  | {
      type: 'JOB_MATCH_FOUND';
      payload: {
        user_id: string;
        job_listing_id: string;
        match_score: number;
        matching_skills: string[];
      };
    }

  // Strategist Agent Events
  | {
      type: 'REJECTION_PARSED';
      payload: {
        application_id: string;
        user_id: string;
        gaps: string[];
        recommended_skills: string[];
      };
    }
  | {
      type: 'ROADMAP_REPATH_NEEDED';
      payload: {
        user_id: string;
        reason: 'skill_verification_gaps' | 'market_shift' | 'rejection_feedback' | 'user_request';
        details: Record<string, unknown>;
      };
    }

  // Action Agent Events
  | {
      type: 'AUTO_APPLY_TRIGGERED';
      payload: {
        user_id: string;
        job_listing_id: string;
        document_id: string;
        confidence_score: number;
      };
    }
  | {
      type: 'APPLICATION_SUBMITTED';
      payload: {
        application_id: string;
        user_id: string;
        job_listing_id: string;
        method: 'auto' | 'manual';
      };
    };

/**
 * Extract event type string literals for type guards
 */
export type AgentEventType = AgentEvent['type'];

/**
 * Extract payload type for a specific event type
 */
export type AgentEventPayload<T extends AgentEventType> = Extract<
  AgentEvent,
  { type: T }
>['payload'];

/**
 * Agent identifiers for routing
 */
export type AgentName =
  | 'interviewer'
  | 'sentinel'
  | 'architect'
  | 'action'
  | 'strategist';

/**
 * Mapping of event types to their target agents
 */
export const EVENT_TARGET_AGENTS: Record<AgentEventType, AgentName[]> = {
  ONBOARDING_COMPLETED: ['architect', 'sentinel'],
  INTERVIEW_COMPLETED: ['strategist'],
  SKILL_VERIFIED: ['architect', 'action'],
  MARKET_UPDATE: ['architect', 'strategist'],
  JOB_MATCH_FOUND: ['action'],
  REJECTION_PARSED: ['strategist', 'architect'],
  ROADMAP_REPATH_NEEDED: ['architect'],
  AUTO_APPLY_TRIGGERED: ['action'],
  APPLICATION_SUBMITTED: ['strategist'],
};
```

### Step 4: Create Message Bus Service

**File:** `src/lib/agents/message-bus.ts`

```typescript
import { db } from '@/drizzle/db';
import { agentEvents } from '@/drizzle/schema/agent-events';
import { tasks } from '@trigger.dev/sdk/v3';
import type { AgentEvent, AgentEventType, EVENT_TARGET_AGENTS } from './events';

/**
 * Publish an agent event to the message bus
 *
 * 1. Persists event to agent_events table (audit trail)
 * 2. Dispatches to appropriate Trigger.dev background job
 *
 * @param event - The typed agent event to publish
 * @returns The created event ID
 */
export async function publishAgentEvent(event: AgentEvent): Promise<string> {
  // 1. Determine target agents
  const targetAgents = EVENT_TARGET_AGENTS[event.type];

  // 2. Persist to database for audit trail
  const [insertedEvent] = await db
    .insert(agentEvents)
    .values({
      event_type: event.type,
      payload: event.payload,
      status: 'pending',
      source_agent: getSourceAgent(event.type),
      target_agent: targetAgents[0], // Primary target
    })
    .returning({ id: agentEvents.id });

  // 3. Dispatch to Trigger.dev based on event type
  try {
    await dispatchToTrigger(event, insertedEvent.id);

    // Update status to processing
    await db
      .update(agentEvents)
      .set({ status: 'processing' })
      .where(eq(agentEvents.id, insertedEvent.id));
  } catch (error) {
    // Log failure but don't throw - event is persisted for retry
    console.error(`Failed to dispatch event ${event.type}:`, error);

    await db
      .update(agentEvents)
      .set({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(agentEvents.id, insertedEvent.id));
  }

  return insertedEvent.id;
}

/**
 * Dispatch event to appropriate Trigger.dev job
 */
async function dispatchToTrigger(event: AgentEvent, eventId: string): Promise<void> {
  switch (event.type) {
    case 'INTERVIEW_COMPLETED':
      await tasks.trigger('interview.analyze', {
        ...event.payload,
        event_id: eventId,
      });
      break;

    case 'MARKET_UPDATE':
      await tasks.trigger('roadmap.repath.check', {
        ...event.payload,
        event_id: eventId,
      });
      break;

    case 'JOB_MATCH_FOUND':
      await tasks.trigger('action.evaluate-match', {
        ...event.payload,
        event_id: eventId,
      });
      break;

    case 'REJECTION_PARSED':
      await tasks.trigger('strategist.process-rejection', {
        ...event.payload,
        event_id: eventId,
      });
      break;

    case 'ROADMAP_REPATH_NEEDED':
      await tasks.trigger('architect.repath-roadmap', {
        ...event.payload,
        event_id: eventId,
      });
      break;

    case 'ONBOARDING_COMPLETED':
      // Trigger initial roadmap generation
      await tasks.trigger('architect.generate-initial-roadmap', {
        ...event.payload,
        event_id: eventId,
      });
      break;

    default:
      console.warn(`No handler for event type: ${(event as AgentEvent).type}`);
  }
}

/**
 * Determine source agent based on event type
 */
function getSourceAgent(eventType: AgentEventType): string {
  const sourceMap: Record<AgentEventType, string> = {
    ONBOARDING_COMPLETED: 'system',
    INTERVIEW_COMPLETED: 'interviewer',
    SKILL_VERIFIED: 'interviewer',
    MARKET_UPDATE: 'sentinel',
    JOB_MATCH_FOUND: 'sentinel',
    REJECTION_PARSED: 'strategist',
    ROADMAP_REPATH_NEEDED: 'strategist',
    AUTO_APPLY_TRIGGERED: 'action',
    APPLICATION_SUBMITTED: 'action',
  };
  return sourceMap[eventType];
}

/**
 * Mark an event as completed (called by job handlers)
 */
export async function markEventCompleted(eventId: string): Promise<void> {
  await db
    .update(agentEvents)
    .set({
      status: 'completed',
      processed_at: new Date(),
    })
    .where(eq(agentEvents.id, eventId));
}

/**
 * Mark an event as failed with error message
 */
export async function markEventFailed(
  eventId: string,
  errorMessage: string
): Promise<void> {
  await db
    .update(agentEvents)
    .set({
      status: 'failed',
      error_message: errorMessage,
      processed_at: new Date(),
    })
    .where(eq(agentEvents.id, eventId));
}
```

### Step 5: Create Trigger.dev Job Stubs

**File:** `src/trigger/jobs/interview-analyzer.ts`

```typescript
import { task } from '@trigger.dev/sdk/v3';
import { markEventCompleted, markEventFailed } from '@/lib/agents/message-bus';

export const interviewAnalyzer = task({
  id: 'interview.analyze',
  run: async (payload: {
    interview_id: string;
    user_id: string;
    duration_minutes: number;
    event_id: string;
  }) => {
    try {
      // TODO: Implement in Phase 5.5
      // 1. Fetch interview transcript from DB
      // 2. Fetch user's claimed skills
      // 3. Analyze transcript for skill demonstrations (AI)
      // 4. Update user_skills with verification metadata
      // 5. Check for skill gaps
      // 6. Trigger roadmap repath if needed

      console.log('Interview analysis job triggered:', payload);

      await markEventCompleted(payload.event_id);

      return { success: true, analyzed: true };
    } catch (error) {
      await markEventFailed(
        payload.event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  },
});
```

**File:** `src/trigger/jobs/market-scraper.ts`

```typescript
import { task } from '@trigger.dev/sdk/v3';

export const marketScraper = task({
  id: 'market.scrape',
  // Run daily at 2 AM
  run: async () => {
    // TODO: Implement in Phase 6
    // 1. Scrape Jooble API
    // 2. Scrape Adzuna API
    // 3. Bulk upsert to job_listings
    // 4. Generate market insights
    // 5. Publish MARKET_UPDATE event

    console.log('Market scraping job triggered');

    return { success: true, listings: 0 };
  },
});
```

**File:** `src/trigger/jobs/roadmap-repather.ts`

```typescript
import { task } from '@trigger.dev/sdk/v3';
import { markEventCompleted, markEventFailed } from '@/lib/agents/message-bus';

export const roadmapRepather = task({
  id: 'architect.repath-roadmap',
  run: async (payload: {
    user_id: string;
    reason: string;
    details: Record<string, unknown>;
    event_id: string;
  }) => {
    try {
      // TODO: Implement in Phase 5.5
      // 1. Fetch current roadmap
      // 2. Fetch user's verified vs claimed skills
      // 3. Fetch latest market insights
      // 4. Re-generate roadmap modules (AI)
      // 5. Update roadmap in DB

      console.log('Roadmap re-path job triggered:', payload);

      await markEventCompleted(payload.event_id);

      return { success: true, repathed: true };
    } catch (error) {
      await markEventFailed(
        payload.event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  },
});
```

**File:** `src/trigger/jobs/auto-applier.ts`

```typescript
import { task } from '@trigger.dev/sdk/v3';
import { markEventCompleted, markEventFailed } from '@/lib/agents/message-bus';

export const autoApplier = task({
  id: 'action.evaluate-match',
  run: async (payload: {
    user_id: string;
    job_listing_id: string;
    match_score: number;
    matching_skills: string[];
    event_id: string;
  }) => {
    try {
      // TODO: Implement in Phase 7+
      // 1. Check if auto-apply is enabled for user
      // 2. Fetch user's latest resume document
      // 3. Generate tailored cover letter (AI + RAG)
      // 4. Submit application (if auto-apply enabled)
      // 5. Create job_applications record
      // 6. Publish APPLICATION_SUBMITTED event

      console.log('Auto-apply evaluation job triggered:', payload);

      await markEventCompleted(payload.event_id);

      return { success: true, applied: false };
    } catch (error) {
      await markEventFailed(
        payload.event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  },
});
```

**File:** `src/trigger/jobs/rejection-parser.ts`

```typescript
import { task } from '@trigger.dev/sdk/v3';
import { markEventCompleted, markEventFailed, publishAgentEvent } from '@/lib/agents/message-bus';

export const rejectionParser = task({
  id: 'strategist.process-rejection',
  run: async (payload: {
    application_id: string;
    user_id: string;
    gaps: string[];
    recommended_skills: string[];
    event_id: string;
  }) => {
    try {
      // TODO: Implement in Phase 6+
      // 1. Analyze rejection reason
      // 2. Identify skill gaps
      // 3. Update application_feedback record
      // 4. Trigger roadmap repath if significant gaps found

      console.log('Rejection parsing job triggered:', payload);

      // If gaps found, trigger roadmap repath
      if (payload.gaps.length > 0) {
        await publishAgentEvent({
          type: 'ROADMAP_REPATH_NEEDED',
          payload: {
            user_id: payload.user_id,
            reason: 'rejection_feedback',
            details: {
              application_id: payload.application_id,
              gaps: payload.gaps,
              recommended_skills: payload.recommended_skills,
            },
          },
        });
      }

      await markEventCompleted(payload.event_id);

      return { success: true, gaps_found: payload.gaps.length };
    } catch (error) {
      await markEventFailed(
        payload.event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  },
});
```

**File:** `src/trigger/jobs/initial-roadmap.ts`

```typescript
import { task } from '@trigger.dev/sdk/v3';
import { markEventCompleted, markEventFailed } from '@/lib/agents/message-bus';

export const initialRoadmapGenerator = task({
  id: 'architect.generate-initial-roadmap',
  run: async (payload: {
    user_id: string;
    target_roles: string[];
    skills_count: number;
    event_id: string;
  }) => {
    try {
      // TODO: Implement after Phase 3.6 (needs Vector DB)
      // 1. Fetch user profile and skills
      // 2. Fetch market insights for target roles
      // 3. Identify skill gaps
      // 4. Generate roadmap modules (AI)
      // 5. Create roadmap and modules in DB

      console.log('Initial roadmap generation triggered:', payload);

      await markEventCompleted(payload.event_id);

      return { success: true, roadmap_created: false };
    } catch (error) {
      await markEventFailed(
        payload.event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  },
});
```

### Step 6: Update Schema Barrel Export

**File:** `src/drizzle/schema.ts` (add new export)

```typescript
// ... existing exports ...

// Agent Orchestration Domain
export * from './schema/agent-events';
```

### Step 7: Add Trigger.dev Configuration

**File:** `trigger.config.ts`

```typescript
import { defineConfig } from '@trigger.dev/sdk/v3';

export default defineConfig({
  project: 'career-prep',
  runtime: 'node',
  logLevel: 'info',
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ['./src/trigger'],
});
```

### Step 8: Environment Variables

Add to `.env.local`:

```env
# Trigger.dev Configuration
TRIGGER_SECRET_KEY=tr_dev_xxxxxxxxxxxxx
TRIGGER_API_URL=https://api.trigger.dev

# Optional: For BullMQ alternative
# REDIS_URL=redis://localhost:6379
```

Add to `src/data/env/server.ts`:

```typescript
// Add to existing schema
TRIGGER_SECRET_KEY: z.string().min(1),
TRIGGER_API_URL: z.string().url().optional(),
```

---

## File Structure

After implementation, the new files will be:

```
src/
├── drizzle/
│   └── schema/
│       └── agent-events.ts       # NEW: Agent events table (with priority)
├── lib/
│   └── agents/
│       ├── events.ts             # NEW: Event types + EVENT_PRIORITIES
│       └── message-bus.ts        # NEW: Event publishing + shouldSkipEvent()
├── trigger/
│   ├── client.ts                 # NEW: Trigger.dev client (auto-generated)
│   └── jobs/
│       ├── interview-analyzer.ts   # NEW: Post-interview analysis
│       ├── market-scraper.ts       # NEW: Jooble/Adzuna scraping
│       ├── roadmap-repather.ts     # NEW: Roadmap re-generation
│       ├── auto-applier.ts         # NEW: Auto-apply evaluation
│       ├── rejection-parser.ts     # NEW: Rejection feedback processing
│       ├── initial-roadmap.ts      # NEW: Initial roadmap generation
│       └── strategist-listener.ts  # NEW: Global event listener (pattern detection)
└── trigger.config.ts             # NEW: Trigger.dev config (with priority queues)
```

---

## Database Schema

### agent_events Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar(36) | Primary key (UUID) - **Used as Idempotency Key** |
| `event_type` | varchar(50) | Event type (e.g., 'INTERVIEW_COMPLETED') |
| `payload` | jsonb | Event-specific data |
| `status` | enum | pending, processing, completed, failed |
| `priority` | integer | **NEW:** 1-10 scale (10=highest) for queue routing |
| `source_agent` | varchar(50) | Agent that created the event |
| `target_agent` | varchar(50) | Primary target agent |
| `created_at` | timestamp | When event was created |
| `processed_at` | timestamp | When processing completed |
| `error_message` | text | Error details if failed |
| `retry_count` | integer | Number of retry attempts |

### Indexes

```sql
CREATE INDEX idx_agent_events_status ON agent_events(status);
CREATE INDEX idx_agent_events_type ON agent_events(event_type);
CREATE INDEX idx_agent_events_created ON agent_events(created_at);
CREATE INDEX idx_agent_events_priority ON agent_events(priority DESC, created_at ASC);
```

---

## Event Types Reference

| Event Type | Source Agent | Target Agent(s) | Trigger |
|------------|--------------|-----------------|---------|
| `ONBOARDING_COMPLETED` | system | architect, sentinel | User finishes onboarding |
| `INTERVIEW_COMPLETED` | interviewer | strategist | Hume interview ends |
| `SKILL_VERIFIED` | interviewer | architect, action | AI confirms skill demonstration |
| `MARKET_UPDATE` | sentinel | architect, strategist | Daily scraper runs |
| `JOB_MATCH_FOUND` | sentinel | action | Job matches user profile |
| `REJECTION_PARSED` | strategist | architect | Email rejection analyzed |
| `ROADMAP_REPATH_NEEDED` | strategist | architect | Gaps identified |
| `AUTO_APPLY_TRIGGERED` | action | action | Match score above threshold |
| `APPLICATION_SUBMITTED` | action | strategist | Application sent |

---

## Dependencies & Prerequisites

### Required Before Implementation

1. **Trigger.dev Account** - Create account at https://trigger.dev
2. **PostgreSQL Running** - Docker container active
3. **Drizzle Schema Updated** - Add agent_events table

### Blocks Other Phases

| Phase | Dependency on 3.5 |
|-------|-------------------|
| Phase 5 (Hume AI) | Needs `INTERVIEW_COMPLETED` event |
| Phase 5.5 (Truth Loop) | Needs `interview-analyzer` job |
| Phase 6 (Market Intel) | Needs `market-scraper` job |
| Phase 7 (Digital Twin) | Needs event-driven skill updates |

---

## Open Questions

### For User Decision

1. **Trigger.dev vs BullMQ?**
   - Recommendation: Trigger.dev for Vercel deployment
   - BullMQ requires separate Redis instance and worker process

2. **Event Retention Policy?**
   - Option A: Keep indefinitely (full audit trail)
   - Option B: Auto-delete after 30 days (reduce storage)
   - Option C: Archive to cold storage after 7 days

3. **Retry Strategy?**
   - Current plan: 3 retries with exponential backoff
   - Alternative: Dead letter queue for manual review

4. **Real-time Notifications?**
   - Should agents notify users via WebSocket/SSE?
   - Or rely on polling dashboard?

5. **Rate Limiting per Agent?**
   - Should we limit how many events an agent can publish per minute?
   - Prevents runaway jobs from overwhelming the system

---

## Implementation Checklist

### Core Setup
- [ ] Create Trigger.dev account and get API key
- [ ] Run `npx trigger.dev@latest init`
- [ ] Create `src/drizzle/schema/agent-events.ts` (with `priority` column)
- [ ] Update `src/drizzle/schema.ts` barrel export
- [ ] Run `npx drizzle-kit push` to create table
- [ ] Add environment variables to `.env.local`
- [ ] Update `src/data/env/server.ts` validation

### Event System
- [ ] Create `src/lib/agents/events.ts` (types + `EVENT_PRIORITIES`)
- [ ] Create `src/lib/agents/message-bus.ts` (with `shouldSkipEvent()` helper)
- [ ] Create job stubs in `src/trigger/jobs/`
- [ ] Create `src/trigger/jobs/strategist-listener.ts` (global listener)

### Senior Engineer Refinements
- [ ] Implement idempotency check in all job handlers
- [ ] Configure priority queues in `trigger.config.ts`
- [ ] Add queue routing logic to `dispatchToTrigger()`
- [ ] Wire up Strategist global listener dispatch

### Integration & Testing
- [ ] Test event publishing flow
- [ ] Verify events appear in Trigger.dev dashboard
- [ ] Test idempotency (trigger same event twice)
- [ ] Test priority queuing (high-priority event during bulk job)
- [ ] Wire up `completeOnboarding()` to publish event

---

## Next Steps After Phase 3.5

1. **Phase 3.6: Vector Database** - RAG foundation for Action Agent
2. **Phase 5: Hume AI Integration** - Wire up Interviewer Agent
3. **Phase 5.5: Truth Loop** - Implement interview-analyzer job logic

---

*Last Updated: December 31, 2024*
