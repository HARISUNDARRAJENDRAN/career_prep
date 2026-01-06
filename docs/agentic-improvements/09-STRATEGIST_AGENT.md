# Strategist Agent

> **Document Version:** 1.0
> **Created:** January 6, 2026
> **Depends On:** All previous documents (01-08)
> **Purpose:** Strategic oversight, pattern detection, and career optimization

---

## Table of Contents

1. [Overview](#overview)
2. [Core Responsibilities](#core-responsibilities)
3. [Architecture](#architecture)
4. [Implementation](#implementation)
5. [Event Subscriptions](#event-subscriptions)
6. [Pattern Detection Algorithms](#pattern-detection-algorithms)
7. [Integration with Other Agents](#integration-with-other-agents)
8. [Database Schema](#database-schema)
9. [Trigger Jobs](#trigger-jobs)

---

## Overview

### The Strategist's Role

The Strategist Agent is the **strategic oversight layer** of the Career Prep system. Unlike other agents that focus on specific tasks (interviews, jobs, roadmaps), the Strategist:

1. **Observes all agent events** - Acts as a global listener
2. **Detects cross-domain patterns** - Identifies issues that span multiple agents
3. **Triggers interventions** - Initiates corrective actions when needed
4. **Tracks career velocity** - Monitors overall progress trajectory
5. **Parses feedback** - Extracts actionable insights from rejections

### Why a Dedicated Strategist?

```
Without Strategist:
┌─────────────────────────────────────────────────────────────────┐
│  Interviewer    Sentinel    Architect    Action                 │
│      │             │            │           │                   │
│      │             │            │           │                   │
│   (isolated)   (isolated)  (isolated)   (isolated)              │
│                                                                 │
│  No one notices:                                                │
│  • 5 rejections mentioning "system design"                      │
│  • Interview scores dropping over 3 weeks                       │
│  • Application velocity slowing down                            │
│  • Skills gap widening despite completed modules                │
└─────────────────────────────────────────────────────────────────┘

With Strategist:
┌─────────────────────────────────────────────────────────────────┐
│                      STRATEGIST AGENT                           │
│                   (Global Pattern Observer)                     │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │Interviewer│  │ Sentinel │  │ Architect │  │  Action  │       │
│  └─────┬─────┘  └─────┬────┘  └─────┬─────┘  └─────┬────┘       │
│        │              │             │              │            │
│        └──────────────┴─────────────┴──────────────┘            │
│                        │                                        │
│                        ▼                                        │
│              ┌─────────────────┐                                │
│              │ Pattern Analysis │                               │
│              │ • Rejection gaps │                               │
│              │ • Score trends   │                               │
│              │ • Velocity drops │                               │
│              │ • Milestone hits │                               │
│              └────────┬────────┘                                │
│                       │                                         │
│                       ▼                                         │
│              ┌─────────────────┐                                │
│              │  Interventions  │                                │
│              │ • Repath roadmap│                                │
│              │ • Send alerts   │                                │
│              │ • Celebrate wins│                                │
│              │ • Adjust focus  │                                │
│              └─────────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Responsibilities

### 1. Rejection Parsing & Gap Analysis

Parse rejection emails/feedback to identify skill gaps:

```typescript
// Input: Rejection feedback
"Thank you for your interest. After careful consideration,
we've decided to move forward with candidates who have
stronger system design experience and distributed systems knowledge."

// Strategist Output:
{
  rejection_type: "skill_gap",
  identified_gaps: ["system_design", "distributed_systems"],
  confidence: 0.85,
  recommendation: "REPATH_ROADMAP",
  priority: "high"
}
```

### 2. Pattern Detection

Identify concerning patterns across multiple events:

| Pattern | Trigger | Action |
|---------|---------|--------|
| **Skill Gap Cluster** | 3+ rejections mention same skill | Trigger roadmap repath |
| **Interview Decline** | 3 consecutive score drops | Alert user + suggest practice |
| **Application Stall** | 50% velocity drop week-over-week | Investigate + alert |
| **Progress Plateau** | No module completions in 2 weeks | Send motivation + review roadmap |
| **Success Streak** | 3+ positive outcomes | Celebrate + boost confidence |

### 3. Strategic Recommendations

Generate actionable recommendations based on analysis:

```typescript
interface StrategicRecommendation {
  type: 'urgent_action' | 'optimization' | 'celebration' | 'warning';
  title: string;
  description: string;
  actions: Array<{
    action: string;
    agent: 'architect' | 'action' | 'interviewer' | 'sentinel';
    payload: Record<string, unknown>;
  }>;
  priority: 'critical' | 'high' | 'medium' | 'low';
}
```

### 4. Velocity Tracking

Monitor career progression metrics:

```typescript
interface VelocityMetrics {
  applications_per_week: number;
  interviews_per_week: number;
  response_rate: number;  // % of applications getting responses
  pass_rate: number;      // % of interviews passed
  modules_completed_per_week: number;
  trend: 'accelerating' | 'stable' | 'decelerating' | 'stalled';
}
```

---

## Architecture

### Component Structure

```
src/lib/agents/agents/strategist/
├── index.ts                    # Exports
├── strategist-agent.ts         # Main agent class
├── strategist-prompts.ts       # AI prompts
├── strategist-tools.ts         # Tool definitions
├── pattern-detector.ts         # Pattern detection logic
├── rejection-analyzer.ts       # Rejection parsing
└── velocity-tracker.ts         # Velocity calculations
```

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     STRATEGIST AGENT FLOW                            │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    EVENT SUBSCRIBER                             │ │
│  │  Listens to: ALL agent events                                   │ │
│  │  • INTERVIEW_*, APPLICATION_*, ROADMAP_*, MARKET_*, etc.        │ │
│  └─────────────────────────────┬──────────────────────────────────┘ │
│                                │                                     │
│                                ▼                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    EVENT CLASSIFIER                             │ │
│  │  Categorize: feedback | progress | milestone | system           │ │
│  └─────────────────────────────┬──────────────────────────────────┘ │
│                                │                                     │
│         ┌──────────────────────┼──────────────────────┐             │
│         │                      │                      │             │
│         ▼                      ▼                      ▼             │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐       │
│  │  Rejection  │       │   Pattern   │       │  Velocity   │       │
│  │  Analyzer   │       │  Detector   │       │  Tracker    │       │
│  └──────┬──────┘       └──────┬──────┘       └──────┬──────┘       │
│         │                     │                     │               │
│         └─────────────────────┴─────────────────────┘               │
│                               │                                      │
│                               ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                 RECOMMENDATION ENGINE                           │ │
│  │  • Aggregate insights                                           │ │
│  │  • Prioritize actions                                           │ │
│  │  • Generate interventions                                       │ │
│  └─────────────────────────────┬──────────────────────────────────┘ │
│                                │                                     │
│                                ▼                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                 INTERVENTION DISPATCHER                         │ │
│  │  • Trigger roadmap repath (→ Architect)                         │ │
│  │  • Send user notifications                                      │ │
│  │  • Adjust application strategy (→ Action)                       │ │
│  │  • Request additional interviews (→ Interviewer)                │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Main Agent Class

```typescript
// src/lib/agents/agents/strategist/strategist-agent.ts

interface StrategistContext {
  user_id: string;
  time_window_days: number;  // How far back to analyze
  trigger_event?: AgentEventUnion;
}

interface StrategistOutput {
  patterns_detected: PatternMatch[];
  recommendations: StrategicRecommendation[];
  velocity_report: VelocityMetrics;
  interventions_triggered: string[];
}

export class StrategistAgent extends BaseAutonomousAgent<
  StrategistContext,
  StrategistOutput
> {
  protected agentName = 'strategist';

  // Components
  private patternDetector: PatternDetector;
  private rejectionAnalyzer: RejectionAnalyzer;
  private velocityTracker: VelocityTracker;

  constructor(context: StrategistContext) {
    super(context);
    this.patternDetector = new PatternDetector(context.user_id);
    this.rejectionAnalyzer = new RejectionAnalyzer();
    this.velocityTracker = new VelocityTracker(context.user_id);
  }

  async execute(): Promise<StrategistOutput> {
    // 1. Load recent events
    const events = await this.loadRecentEvents();

    // 2. Analyze patterns
    const patterns = await this.patternDetector.detect(events);

    // 3. Analyze rejections
    const rejectionInsights = await this.analyzeRejections(events);

    // 4. Calculate velocity
    const velocity = await this.velocityTracker.calculate();

    // 5. Generate recommendations
    const recommendations = await this.generateRecommendations(
      patterns,
      rejectionInsights,
      velocity
    );

    // 6. Dispatch interventions
    const interventions = await this.dispatchInterventions(recommendations);

    return {
      patterns_detected: patterns,
      recommendations,
      velocity_report: velocity,
      interventions_triggered: interventions,
    };
  }
}
```

---

## Event Subscriptions

The Strategist subscribes to ALL agent events:

```typescript
const STRATEGIST_SUBSCRIPTIONS = [
  // Interview Events
  'INTERVIEW_COMPLETED',
  'INTERVIEW_ANALYSIS_COMPLETED',

  // Application Events
  'APPLICATION_SUBMITTED',
  'APPLICATION_REJECTED',
  'APPLICATION_ACCEPTED',
  'APPLICATION_FEEDBACK_RECEIVED',

  // Roadmap Events
  'ROADMAP_GENERATED',
  'ROADMAP_REPATHED',
  'MODULE_COMPLETED',
  'SKILL_VERIFIED',

  // Market Events
  'MARKET_UPDATE',
  'JOB_MATCH_FOUND',

  // User Events
  'ONBOARDING_COMPLETED',
  'RESUME_UPLOADED',
  'PROFILE_UPDATED',
];
```

---

## Pattern Detection Algorithms

### 1. Skill Gap Clustering

```typescript
interface SkillGapCluster {
  skill: string;
  occurrences: number;
  sources: Array<{
    type: 'rejection' | 'interview' | 'market';
    event_id: string;
    timestamp: Date;
  }>;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

async function detectSkillGapClusters(
  events: AgentEvent[],
  threshold: number = 3
): Promise<SkillGapCluster[]> {
  const skillMentions = new Map<string, SkillGapCluster>();

  for (const event of events) {
    if (event.type === 'APPLICATION_REJECTED') {
      const gaps = await extractSkillGaps(event.payload.feedback);
      for (const skill of gaps) {
        // Aggregate skill mentions
        const existing = skillMentions.get(skill) || {
          skill,
          occurrences: 0,
          sources: [],
          severity: 'low',
        };
        existing.occurrences++;
        existing.sources.push({
          type: 'rejection',
          event_id: event.id,
          timestamp: event.created_at,
        });
        skillMentions.set(skill, existing);
      }
    }
  }

  // Filter by threshold and calculate severity
  return Array.from(skillMentions.values())
    .filter(cluster => cluster.occurrences >= threshold)
    .map(cluster => ({
      ...cluster,
      severity: calculateSeverity(cluster.occurrences),
    }));
}
```

### 2. Trend Detection

```typescript
interface TrendAnalysis {
  metric: string;
  direction: 'improving' | 'stable' | 'declining';
  change_percentage: number;
  data_points: Array<{ date: Date; value: number }>;
  significance: 'significant' | 'marginal' | 'noise';
}

async function detectTrends(
  events: AgentEvent[],
  metric: 'interview_score' | 'response_rate' | 'application_velocity'
): Promise<TrendAnalysis> {
  const dataPoints = extractMetricDataPoints(events, metric);

  // Use linear regression to detect trend
  const regression = linearRegression(dataPoints);

  return {
    metric,
    direction: regression.slope > 0.05 ? 'improving'
             : regression.slope < -0.05 ? 'declining'
             : 'stable',
    change_percentage: regression.slope * 100,
    data_points: dataPoints,
    significance: regression.rSquared > 0.7 ? 'significant'
                : regression.rSquared > 0.3 ? 'marginal'
                : 'noise',
  };
}
```

### 3. Milestone Detection

```typescript
interface Milestone {
  type: 'first_interview' | 'first_response' | 'streak' | 'skill_mastery' | 'job_offer';
  description: string;
  achieved_at: Date;
  celebration_level: 'major' | 'minor';
}

async function detectMilestones(
  events: AgentEvent[],
  userHistory: UserHistory
): Promise<Milestone[]> {
  const milestones: Milestone[] = [];

  // Check for first-time achievements
  if (!userHistory.has_completed_interview) {
    const interviewEvent = events.find(e => e.type === 'INTERVIEW_COMPLETED');
    if (interviewEvent) {
      milestones.push({
        type: 'first_interview',
        description: 'Completed your first mock interview!',
        achieved_at: interviewEvent.created_at,
        celebration_level: 'major',
      });
    }
  }

  // Check for streaks
  const streak = calculateStreak(events, 'positive_outcome');
  if (streak >= 3) {
    milestones.push({
      type: 'streak',
      description: `${streak} positive outcomes in a row!`,
      achieved_at: new Date(),
      celebration_level: streak >= 5 ? 'major' : 'minor',
    });
  }

  return milestones;
}
```

---

## Integration with Other Agents

### Triggering Roadmap Repath (→ Architect)

```typescript
async function triggerRoadmapRepath(
  userId: string,
  skillGaps: SkillGapCluster[],
  reason: string
): Promise<void> {
  await publishAgentEvent({
    type: 'STRATEGIST_REPATH_REQUESTED',
    payload: {
      user_id: userId,
      skill_gaps: skillGaps.map(g => ({
        skill: g.skill,
        severity: g.severity,
        evidence_count: g.occurrences,
      })),
      reason,
      priority: 'high',
    },
  });
}
```

### Adjusting Application Strategy (→ Action)

```typescript
async function adjustApplicationStrategy(
  userId: string,
  recommendation: StrategicRecommendation
): Promise<void> {
  await publishAgentEvent({
    type: 'STRATEGIST_STRATEGY_ADJUSTMENT',
    payload: {
      user_id: userId,
      adjustments: [
        {
          type: 'focus_skills',
          skills: recommendation.focus_skills,
        },
        {
          type: 'avoid_companies',
          reason: 'Multiple rejections',
          companies: recommendation.avoid_list,
        },
        {
          type: 'prioritize_roles',
          roles: recommendation.prioritized_roles,
        },
      ],
    },
  });
}
```

### Requesting Additional Practice (→ Interviewer)

```typescript
async function requestAdditionalPractice(
  userId: string,
  focusAreas: string[]
): Promise<void> {
  await publishAgentEvent({
    type: 'STRATEGIST_PRACTICE_REQUESTED',
    payload: {
      user_id: userId,
      focus_areas: focusAreas,
      suggested_interview_types: focusAreas.map(area => ({
        area,
        type: mapAreaToInterviewType(area),
      })),
      urgency: 'high',
    },
  });
}
```

---

## Database Schema

### Strategic Insights Table

```typescript
// src/drizzle/schema/strategic-insights.ts

export const strategicInsights = pgTable('strategic_insights', {
  id: varchar('id', { length: 36 }).primaryKey(),
  user_id: varchar('user_id', { length: 255 }).notNull(),

  // Insight details
  insight_type: pgEnum('insight_type', [
    'skill_gap_cluster',
    'trend_detected',
    'milestone_achieved',
    'velocity_change',
    'intervention_triggered',
  ])('insight_type').notNull(),

  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),

  // Data
  data: jsonb('data'),  // Type-specific data

  // Severity/Priority
  severity: pgEnum('severity', ['critical', 'high', 'medium', 'low'])('severity'),

  // Actions taken
  actions_triggered: jsonb('actions_triggered'),

  // Status
  status: pgEnum('insight_status', ['new', 'acknowledged', 'acted_upon', 'resolved'])('status')
    .default('new'),

  // Timestamps
  detected_at: timestamp('detected_at').defaultNow().notNull(),
  resolved_at: timestamp('resolved_at'),

  // Source events
  source_event_ids: jsonb('source_event_ids'),
});

// Index for user queries
export const strategicInsightsUserIdx = index('idx_insights_user')
  .on(strategicInsights.user_id);
```

### Velocity Metrics Table

```typescript
export const velocityMetrics = pgTable('velocity_metrics', {
  id: varchar('id', { length: 36 }).primaryKey(),
  user_id: varchar('user_id', { length: 255 }).notNull(),

  // Time period
  period_start: timestamp('period_start').notNull(),
  period_end: timestamp('period_end').notNull(),
  period_type: pgEnum('period_type', ['daily', 'weekly', 'monthly'])('period_type').notNull(),

  // Metrics
  applications_count: integer('applications_count').default(0),
  interviews_count: integer('interviews_count').default(0),
  responses_received: integer('responses_received').default(0),
  rejections_count: integer('rejections_count').default(0),
  offers_count: integer('offers_count').default(0),
  modules_completed: integer('modules_completed').default(0),
  skills_verified: integer('skills_verified').default(0),

  // Calculated rates
  response_rate: real('response_rate'),
  pass_rate: real('pass_rate'),

  // Trend comparison
  velocity_change_pct: real('velocity_change_pct'),  // vs previous period

  created_at: timestamp('created_at').defaultNow().notNull(),
});
```

---

## Trigger Jobs

### Global Event Listener (Refactored)

```typescript
// src/trigger/jobs/strategist-global-listener.ts

export const strategistGlobalListener = task({
  id: 'strategist.global-listener',

  run: async (payload: { event: AgentEventUnion }) => {
    const { event } = payload;

    // Create strategist agent for this user
    const agent = new StrategistAgent({
      user_id: event.payload.user_id,
      time_window_days: 30,
      trigger_event: event,
    });

    // Run analysis
    const result = await agent.execute();

    // Log significant findings
    if (result.patterns_detected.length > 0) {
      logger.info('Patterns detected', {
        user_id: event.payload.user_id,
        patterns: result.patterns_detected.map(p => p.type),
      });
    }

    if (result.interventions_triggered.length > 0) {
      logger.info('Interventions triggered', {
        user_id: event.payload.user_id,
        interventions: result.interventions_triggered,
      });
    }

    return result;
  },
});
```

### Scheduled Analysis Job

```typescript
// src/trigger/jobs/strategist-scheduled-analysis.ts

export const strategistScheduledAnalysis = schedules.task({
  id: 'strategist.scheduled-analysis',
  cron: '0 9 * * 1',  // Every Monday at 9 AM

  run: async () => {
    // Get all active users
    const activeUsers = await getActiveUsers();

    // Run batch analysis
    const results = await Promise.all(
      activeUsers.map(async (user) => {
        const agent = new StrategistAgent({
          user_id: user.id,
          time_window_days: 7,  // Last week
        });

        return {
          user_id: user.id,
          result: await agent.execute(),
        };
      })
    );

    // Generate weekly summary
    return {
      users_analyzed: results.length,
      total_patterns: results.reduce((sum, r) => sum + r.result.patterns_detected.length, 0),
      total_interventions: results.reduce((sum, r) => sum + r.result.interventions_triggered.length, 0),
    };
  },
});
```

### Rejection Parser Job

```typescript
// src/trigger/jobs/strategist-rejection-parser.ts

export const strategistRejectionParser = task({
  id: 'strategist.parse-rejection',

  run: async (payload: {
    user_id: string;
    application_id: string;
    rejection_content: string;
    source: 'email' | 'portal' | 'manual';
  }) => {
    const analyzer = new RejectionAnalyzer();

    // Parse rejection for insights
    const analysis = await analyzer.analyze(payload.rejection_content);

    // Store parsed result
    await db.insert(applicationFeedback).values({
      id: crypto.randomUUID(),
      application_id: payload.application_id,
      feedback_type: 'rejection',
      parsed_skills_mentioned: analysis.skills_mentioned,
      parsed_gaps_identified: analysis.gaps,
      sentiment: analysis.sentiment,
      actionable_feedback: analysis.actionable_items,
      raw_content: payload.rejection_content,
      created_at: new Date(),
    });

    // Trigger strategist analysis
    await strategistGlobalListener.trigger({
      event: {
        type: 'APPLICATION_REJECTED',
        payload: {
          user_id: payload.user_id,
          application_id: payload.application_id,
          analysis,
        },
      },
    });

    return analysis;
  },
});
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Pattern Detection Accuracy | > 85% | Manual validation sampling |
| Intervention Relevance | > 80% | User feedback on recommendations |
| Time to Intervention | < 24 hours | From pattern emergence to action |
| Velocity Tracking Accuracy | > 95% | Comparison with actual counts |
| User Engagement with Insights | > 60% | Acknowledgment rate |

---

## Next Steps After Implementation

1. **Notification Integration** - Connect insights to user notifications
2. **Dashboard Widget** - Display strategic insights on user dashboard
3. **Weekly Digest Email** - Send weekly strategic summary to users
4. **A/B Testing** - Test intervention effectiveness
5. **ML Enhancement** - Train models on successful patterns

---

**Document Status:** Ready for Implementation
**Priority:** HIGH
**Estimated Effort:** Medium (leverages existing infrastructure)
