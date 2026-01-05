# Agent Memory System

> **Document Version:** 1.0
> **Created:** January 5, 2026
> **Depends On:** 01-AGENTIC_ARCHITECTURE_OVERVIEW.md, 03-AGENT_STATE_MACHINE.md
> **Purpose:** Implement knowledge accumulation across agent executions

---

## Table of Contents

1. [Overview](#overview)
2. [Memory Types](#memory-types)
3. [Database Schema](#database-schema)
4. [Implementation](#implementation)
5. [Memory Operations](#memory-operations)
6. [Integration with Existing Code](#integration-with-existing-code)
7. [Memory Retrieval Strategies](#memory-retrieval-strategies)

---

## Overview

### The Problem

Currently, each agent execution is stateless:

```typescript
// Current: Every run starts fresh
export const interviewAnalyzer = task({
  run: async (payload) => {
    // ❌ No knowledge of past analyses
    // ❌ No learning from previous mistakes
    // ❌ No accumulated user insights
    const result = await analyze(payload);
    return result;
  }
});
```

### The Solution

Agents need three types of memory:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MEMORY HIERARCHY                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    WORKING MEMORY                            │   │
│  │  • Current task context                                      │   │
│  │  • Active plan and progress                                  │   │
│  │  • Temporary calculations                                    │   │
│  │  • Lifetime: Single execution                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   EPISODIC MEMORY                            │   │
│  │  • Past actions and outcomes                                 │   │
│  │  • What worked vs what failed                                │   │
│  │  • Recent conversations/interactions                         │   │
│  │  • Lifetime: Days to weeks                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  LONG-TERM MEMORY                            │   │
│  │  • Learned user preferences                                  │   │
│  │  • Accumulated domain knowledge                              │   │
│  │  • Validated patterns and insights                           │   │
│  │  • Lifetime: Permanent (with decay)                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Memory Types

### 1. Working Memory

**Purpose:** Hold current task context during execution

| Property | Description |
|----------|-------------|
| **Scope** | Single agent execution |
| **Storage** | In-memory (Redis optional) |
| **Persistence** | Cleared after task completion |
| **Size Limit** | ~50KB per task |

**Contents:**
- Current goal and sub-goals
- Active plan with progress markers
- Intermediate results
- Tool outputs pending evaluation
- Scratchpad for reasoning

### 2. Episodic Memory

**Purpose:** Remember past actions and their outcomes

| Property | Description |
|----------|-------------|
| **Scope** | Per user, per agent |
| **Storage** | PostgreSQL + pgvector |
| **Persistence** | 30 days default, extendable |
| **Size Limit** | 1000 episodes per user per agent |

**Contents:**
- Action taken + context
- Outcome (success/failure)
- Confidence score
- User feedback (if any)
- Timestamp and duration

### 3. Long-Term Memory

**Purpose:** Store validated, generalizable knowledge

| Property | Description |
|----------|-------------|
| **Scope** | Per user (and global) |
| **Storage** | PostgreSQL + pgvector |
| **Persistence** | Permanent with relevance decay |
| **Size Limit** | Unlimited (with pruning) |

**Contents:**
- User preferences (learned)
- Domain facts (validated)
- Patterns (from multiple episodes)
- Skills and proficiencies
- Career trajectory insights

---

## Database Schema

### File: `src/drizzle/schema/agent-memory.ts`

```typescript
/**
 * Agent Memory Tables
 * 
 * Implements three-tier memory system for autonomous agents.
 * Uses pgvector for semantic retrieval.
 */

import {
  pgTable,
  varchar,
  text,
  timestamp,
  jsonb,
  real,
  integer,
  boolean,
  pgEnum,
  index,
  vector,
} from 'drizzle-orm/pg-core';
import { users } from './user';

// Memory type enum
export const memoryTypeEnum = pgEnum('memory_type', [
  'working',
  'episodic', 
  'long_term',
]);

// Memory category for filtering
export const memoryCategoryEnum = pgEnum('memory_category', [
  'user_preference',
  'skill_assessment',
  'interview_insight',
  'job_market_fact',
  'action_outcome',
  'feedback_received',
  'pattern_learned',
  'career_goal',
  'company_info',
  'general_fact',
]);

// Agent name enum (shared with agent-states)
export const agentNameEnum = pgEnum('agent_name', [
  'interviewer',
  'sentinel',
  'architect',
  'action',
  'strategist',
  'coordinator',
  'planner',
]);

/**
 * Working Memory - Current task context
 * Cleared after each execution
 */
export const workingMemory = pgTable(
  'working_memory',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Task identification
    task_id: varchar('task_id', { length: 100 }).notNull(),
    agent_name: agentNameEnum('agent_name').notNull(),
    user_id: varchar('user_id', { length: 255 }).references(() => users.clerk_id),

    // Memory content
    key: varchar('key', { length: 100 }).notNull(),
    value: jsonb('value').notNull(),
    
    // Metadata
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
    expires_at: timestamp('expires_at'), // Auto-cleanup
  },
  (table) => [
    index('idx_working_memory_task').on(table.task_id, table.agent_name),
    index('idx_working_memory_key').on(table.task_id, table.key),
  ]
);

/**
 * Episodic Memory - Past actions and outcomes
 * Time-bounded, per user per agent
 */
export const episodicMemory = pgTable(
  'episodic_memory',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Ownership
    user_id: varchar('user_id', { length: 255 })
      .references(() => users.clerk_id)
      .notNull(),
    agent_name: agentNameEnum('agent_name').notNull(),

    // Episode details
    action_type: varchar('action_type', { length: 100 }).notNull(),
    action_description: text('action_description').notNull(),
    context: jsonb('context').$type<{
      goal?: string;
      inputs?: Record<string, unknown>;
      tools_used?: string[];
      plan_id?: string;
    }>(),

    // Outcome
    outcome: pgEnum('outcome', ['success', 'partial', 'failure'])('outcome').notNull(),
    outcome_details: jsonb('outcome_details').$type<{
      result?: unknown;
      error?: string;
      metrics?: Record<string, number>;
    }>(),
    confidence_score: real('confidence_score'),

    // User feedback (if provided)
    user_feedback: jsonb('user_feedback').$type<{
      rating?: number;
      comment?: string;
      corrections?: Record<string, unknown>;
    }>(),

    // Embedding for semantic search
    embedding: vector('embedding', { dimensions: 1536 }),

    // Timestamps
    created_at: timestamp('created_at').defaultNow().notNull(),
    expires_at: timestamp('expires_at').notNull(), // Default: 30 days from creation
  },
  (table) => [
    index('idx_episodic_user_agent').on(table.user_id, table.agent_name),
    index('idx_episodic_action').on(table.user_id, table.action_type),
    index('idx_episodic_outcome').on(table.user_id, table.outcome),
    // Vector index for semantic search
    index('idx_episodic_embedding').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ]
);

/**
 * Long-Term Memory - Persistent knowledge
 * Permanent with relevance decay
 */
export const longTermMemory = pgTable(
  'long_term_memory',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Ownership (null user_id = global knowledge)
    user_id: varchar('user_id', { length: 255 }).references(() => users.clerk_id),
    
    // Memory classification
    category: memoryCategoryEnum('category').notNull(),
    agent_source: agentNameEnum('agent_source'), // Which agent created this

    // Content
    fact: text('fact').notNull(), // The actual knowledge
    evidence: jsonb('evidence').$type<{
      source_episodes?: string[]; // IDs of supporting episodes
      external_sources?: string[];
      confidence_history?: Array<{ score: number; date: string }>;
    }>(),

    // Retrieval
    keywords: text('keywords').array(), // For keyword search
    embedding: vector('embedding', { dimensions: 1536 }),

    // Relevance scoring
    relevance_score: real('relevance_score').default(1.0).notNull(),
    access_count: integer('access_count').default(0).notNull(),
    last_accessed: timestamp('last_accessed'),
    
    // Validation
    is_validated: boolean('is_validated').default(false),
    validated_at: timestamp('validated_at'),
    contradiction_count: integer('contradiction_count').default(0),

    // Timestamps
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_ltm_user_category').on(table.user_id, table.category),
    index('idx_ltm_keywords').using('gin', table.keywords),
    index('idx_ltm_relevance').on(table.user_id, table.relevance_score),
    index('idx_ltm_embedding').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ]
);

// Type exports
export type WorkingMemoryRecord = typeof workingMemory.$inferSelect;
export type EpisodicMemoryRecord = typeof episodicMemory.$inferSelect;
export type LongTermMemoryRecord = typeof longTermMemory.$inferSelect;
```

---

## Implementation

### File: `src/lib/agents/core/agent-memory.ts`

```typescript
/**
 * Agent Memory Manager
 * 
 * Unified interface for all memory operations.
 * Handles storage, retrieval, and memory lifecycle.
 */

import { db } from '@/drizzle/db';
import { 
  workingMemory, 
  episodicMemory, 
  longTermMemory,
  WorkingMemoryRecord,
  EpisodicMemoryRecord,
  LongTermMemoryRecord,
} from '@/drizzle/schema';
import { eq, and, desc, gt, sql, cosineDistance } from 'drizzle-orm';
import { generateEmbedding } from '@/lib/embeddings';

// Types
type AgentName = 'interviewer' | 'sentinel' | 'architect' | 'action' | 'strategist' | 'coordinator' | 'planner';
type MemoryCategory = 'user_preference' | 'skill_assessment' | 'interview_insight' | 'job_market_fact' | 'action_outcome' | 'feedback_received' | 'pattern_learned' | 'career_goal' | 'company_info' | 'general_fact';
type Outcome = 'success' | 'partial' | 'failure';

export interface MemoryConfig {
  userId?: string;
  agentName: AgentName;
  taskId?: string;
}

export interface EpisodeInput {
  actionType: string;
  actionDescription: string;
  context?: {
    goal?: string;
    inputs?: Record<string, unknown>;
    tools_used?: string[];
    plan_id?: string;
  };
  outcome: Outcome;
  outcomeDetails?: {
    result?: unknown;
    error?: string;
    metrics?: Record<string, number>;
  };
  confidenceScore?: number;
}

export interface FactInput {
  category: MemoryCategory;
  fact: string;
  keywords?: string[];
  evidence?: {
    source_episodes?: string[];
    external_sources?: string[];
  };
}

export class AgentMemoryManager {
  private config: MemoryConfig;

  constructor(config: MemoryConfig) {
    this.config = config;
  }

  // ═══════════════════════════════════════════════════════════════════
  // WORKING MEMORY
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Store a value in working memory
   */
  async setWorking(key: string, value: unknown): Promise<void> {
    if (!this.config.taskId) {
      throw new Error('taskId required for working memory');
    }

    const existing = await db.query.workingMemory.findFirst({
      where: and(
        eq(workingMemory.task_id, this.config.taskId),
        eq(workingMemory.key, key)
      ),
    });

    if (existing) {
      await db
        .update(workingMemory)
        .set({ value, updated_at: new Date() })
        .where(eq(workingMemory.id, existing.id));
    } else {
      await db.insert(workingMemory).values({
        task_id: this.config.taskId,
        agent_name: this.config.agentName,
        user_id: this.config.userId,
        key,
        value,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });
    }
  }

  /**
   * Retrieve a value from working memory
   */
  async getWorking<T = unknown>(key: string): Promise<T | null> {
    if (!this.config.taskId) return null;

    const record = await db.query.workingMemory.findFirst({
      where: and(
        eq(workingMemory.task_id, this.config.taskId),
        eq(workingMemory.key, key)
      ),
    });

    return record ? (record.value as T) : null;
  }

  /**
   * Get all working memory for current task
   */
  async getAllWorking(): Promise<Record<string, unknown>> {
    if (!this.config.taskId) return {};

    const records = await db.query.workingMemory.findMany({
      where: eq(workingMemory.task_id, this.config.taskId),
    });

    return records.reduce((acc, r) => {
      acc[r.key] = r.value;
      return acc;
    }, {} as Record<string, unknown>);
  }

  /**
   * Clear working memory for current task
   */
  async clearWorking(): Promise<void> {
    if (!this.config.taskId) return;

    await db
      .delete(workingMemory)
      .where(eq(workingMemory.task_id, this.config.taskId));
  }

  // ═══════════════════════════════════════════════════════════════════
  // EPISODIC MEMORY
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Record an episode (action + outcome)
   */
  async recordEpisode(episode: EpisodeInput): Promise<string> {
    if (!this.config.userId) {
      throw new Error('userId required for episodic memory');
    }

    // Generate embedding for semantic search
    const embeddingText = `${episode.actionType}: ${episode.actionDescription}. Outcome: ${episode.outcome}`;
    const embedding = await generateEmbedding(embeddingText);

    const [inserted] = await db
      .insert(episodicMemory)
      .values({
        user_id: this.config.userId,
        agent_name: this.config.agentName,
        action_type: episode.actionType,
        action_description: episode.actionDescription,
        context: episode.context,
        outcome: episode.outcome,
        outcome_details: episode.outcomeDetails,
        confidence_score: episode.confidenceScore,
        embedding,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })
      .returning({ id: episodicMemory.id });

    return inserted.id;
  }

  /**
   * Find similar past episodes
   */
  async findSimilarEpisodes(
    query: string,
    options: { limit?: number; outcomeFilter?: Outcome } = {}
  ): Promise<EpisodicMemoryRecord[]> {
    if (!this.config.userId) return [];

    const queryEmbedding = await generateEmbedding(query);
    const limit = options.limit || 5;

    let whereClause = and(
      eq(episodicMemory.user_id, this.config.userId),
      eq(episodicMemory.agent_name, this.config.agentName),
      gt(episodicMemory.expires_at, new Date())
    );

    if (options.outcomeFilter) {
      whereClause = and(
        whereClause,
        eq(episodicMemory.outcome, options.outcomeFilter)
      );
    }

    const results = await db
      .select()
      .from(episodicMemory)
      .where(whereClause)
      .orderBy(cosineDistance(episodicMemory.embedding, queryEmbedding))
      .limit(limit);

    return results;
  }

  /**
   * Get recent episodes by action type
   */
  async getRecentEpisodes(
    actionType: string,
    limit: number = 10
  ): Promise<EpisodicMemoryRecord[]> {
    if (!this.config.userId) return [];

    return db.query.episodicMemory.findMany({
      where: and(
        eq(episodicMemory.user_id, this.config.userId),
        eq(episodicMemory.agent_name, this.config.agentName),
        eq(episodicMemory.action_type, actionType),
        gt(episodicMemory.expires_at, new Date())
      ),
      orderBy: desc(episodicMemory.created_at),
      limit,
    });
  }

  /**
   * Add user feedback to an episode
   */
  async addFeedback(
    episodeId: string,
    feedback: { rating?: number; comment?: string; corrections?: Record<string, unknown> }
  ): Promise<void> {
    await db
      .update(episodicMemory)
      .set({ user_feedback: feedback })
      .where(eq(episodicMemory.id, episodeId));
  }

  // ═══════════════════════════════════════════════════════════════════
  // LONG-TERM MEMORY
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Store a fact in long-term memory
   */
  async storeFact(fact: FactInput): Promise<string> {
    // Generate embedding
    const embeddingText = `${fact.category}: ${fact.fact}`;
    const embedding = await generateEmbedding(embeddingText);

    const [inserted] = await db
      .insert(longTermMemory)
      .values({
        user_id: this.config.userId, // Can be null for global facts
        category: fact.category,
        agent_source: this.config.agentName,
        fact: fact.fact,
        keywords: fact.keywords,
        evidence: fact.evidence,
        embedding,
      })
      .returning({ id: longTermMemory.id });

    return inserted.id;
  }

  /**
   * Search long-term memory semantically
   */
  async searchFacts(
    query: string,
    options: { 
      category?: MemoryCategory; 
      limit?: number;
      includeGlobal?: boolean;
    } = {}
  ): Promise<LongTermMemoryRecord[]> {
    const queryEmbedding = await generateEmbedding(query);
    const limit = options.limit || 10;

    // Build where clause
    let whereConditions = [];

    if (this.config.userId) {
      if (options.includeGlobal) {
        whereConditions.push(
          sql`(${longTermMemory.user_id} = ${this.config.userId} OR ${longTermMemory.user_id} IS NULL)`
        );
      } else {
        whereConditions.push(eq(longTermMemory.user_id, this.config.userId));
      }
    }

    if (options.category) {
      whereConditions.push(eq(longTermMemory.category, options.category));
    }

    const results = await db
      .select()
      .from(longTermMemory)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(cosineDistance(longTermMemory.embedding, queryEmbedding))
      .limit(limit);

    // Update access tracking
    const ids = results.map(r => r.id);
    if (ids.length > 0) {
      await db
        .update(longTermMemory)
        .set({
          access_count: sql`${longTermMemory.access_count} + 1`,
          last_accessed: new Date(),
        })
        .where(sql`${longTermMemory.id} IN ${ids}`);
    }

    return results;
  }

  /**
   * Get facts by keyword
   */
  async getFactsByKeyword(keyword: string): Promise<LongTermMemoryRecord[]> {
    return db.query.longTermMemory.findMany({
      where: and(
        this.config.userId 
          ? eq(longTermMemory.user_id, this.config.userId)
          : sql`${longTermMemory.user_id} IS NULL`,
        sql`${keyword} = ANY(${longTermMemory.keywords})`
      ),
      orderBy: desc(longTermMemory.relevance_score),
    });
  }

  /**
   * Validate a fact (increase confidence)
   */
  async validateFact(factId: string): Promise<void> {
    await db
      .update(longTermMemory)
      .set({
        is_validated: true,
        validated_at: new Date(),
        relevance_score: sql`LEAST(${longTermMemory.relevance_score} + 0.1, 1.0)`,
      })
      .where(eq(longTermMemory.id, factId));
  }

  /**
   * Record contradiction (decrease confidence)
   */
  async recordContradiction(factId: string): Promise<void> {
    await db
      .update(longTermMemory)
      .set({
        contradiction_count: sql`${longTermMemory.contradiction_count} + 1`,
        relevance_score: sql`GREATEST(${longTermMemory.relevance_score} - 0.2, 0.0)`,
      })
      .where(eq(longTermMemory.id, factId));
  }

  // ═══════════════════════════════════════════════════════════════════
  // MEMORY CONSOLIDATION
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Consolidate episodes into long-term memory
   * Called periodically to extract patterns
   */
  async consolidateEpisodes(): Promise<number> {
    if (!this.config.userId) return 0;

    // Find successful episodes that haven't been consolidated
    const successfulEpisodes = await db.query.episodicMemory.findMany({
      where: and(
        eq(episodicMemory.user_id, this.config.userId),
        eq(episodicMemory.agent_name, this.config.agentName),
        eq(episodicMemory.outcome, 'success'),
        gt(episodicMemory.confidence_score, 0.8)
      ),
      orderBy: desc(episodicMemory.created_at),
      limit: 50,
    });

    // Group by action type and look for patterns
    const actionGroups = new Map<string, EpisodicMemoryRecord[]>();
    for (const episode of successfulEpisodes) {
      const group = actionGroups.get(episode.action_type) || [];
      group.push(episode);
      actionGroups.set(episode.action_type, group);
    }

    let consolidatedCount = 0;

    // Extract patterns from groups with 3+ similar episodes
    for (const [actionType, episodes] of actionGroups) {
      if (episodes.length >= 3) {
        // Create a learned pattern
        await this.storeFact({
          category: 'pattern_learned',
          fact: `Successful pattern for ${actionType}: High confidence achieved in ${episodes.length} instances`,
          keywords: [actionType, 'learned_pattern', this.config.agentName],
          evidence: {
            source_episodes: episodes.map(e => e.id),
          },
        });
        consolidatedCount++;
      }
    }

    return consolidatedCount;
  }

  // ═══════════════════════════════════════════════════════════════════
  // MEMORY DECAY
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Apply relevance decay to old, unused memories
   * Called periodically as maintenance
   */
  static async applyDecay(): Promise<number> {
    // Decay memories not accessed in 30 days
    const decayThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await db
      .update(longTermMemory)
      .set({
        relevance_score: sql`GREATEST(${longTermMemory.relevance_score} * 0.9, 0.1)`,
      })
      .where(
        and(
          sql`${longTermMemory.last_accessed} < ${decayThreshold}`,
          gt(longTermMemory.relevance_score, 0.1)
        )
      );

    return result.rowCount || 0;
  }

  /**
   * Prune low-relevance memories
   */
  static async pruneMemories(): Promise<number> {
    // Delete memories with very low relevance
    const result = await db
      .delete(longTermMemory)
      .where(
        and(
          sql`${longTermMemory.relevance_score} < 0.1`,
          eq(longTermMemory.is_validated, false)
        )
      );

    return result.rowCount || 0;
  }
}

// Factory function
export function createMemoryManager(config: MemoryConfig): AgentMemoryManager {
  return new AgentMemoryManager(config);
}
```

---

## Memory Operations

### Common Memory Patterns

```typescript
// 1. Remember what worked before
const pastSuccesses = await memory.findSimilarEpisodes(
  'analyzing interview transcript for behavioral questions',
  { outcomeFilter: 'success', limit: 3 }
);

// 2. Learn from failures
const pastFailures = await memory.findSimilarEpisodes(
  'analyzing interview transcript for behavioral questions',
  { outcomeFilter: 'failure', limit: 3 }
);

// 3. Get user preferences
const preferences = await memory.searchFacts(
  'user preferred interview style communication',
  { category: 'user_preference' }
);

// 4. Record what just happened
await memory.recordEpisode({
  actionType: 'interview_analysis',
  actionDescription: 'Analyzed behavioral interview for STAR methodology compliance',
  context: { goal: 'Improve interview responses', tools_used: ['transcript_parser', 'gpt4'] },
  outcome: 'success',
  outcomeDetails: { result: { score: 85, improvements: 3 } },
  confidenceScore: 0.92,
});

// 5. Store learned insight
await memory.storeFact({
  category: 'interview_insight',
  fact: 'User performs better with structured STAR responses than free-form answers',
  keywords: ['interview', 'STAR', 'behavioral', 'user_pattern'],
  evidence: { source_episodes: [episodeId1, episodeId2] },
});
```

---

## Integration with Existing Code

### Modifying Interview Analyzer

```typescript
// src/trigger/jobs/interview-analyzer.ts

import { createMemoryManager, AgentMemoryManager } from '@/lib/agents/core/agent-memory';

export const interviewAnalyzer = task({
  id: 'interview.analyze',
  run: async (payload: InterviewAnalyzerPayload) => {
    const { interview_id, user_id, transcript } = payload;

    // Initialize memory manager
    const memory = createMemoryManager({
      userId: user_id,
      agentName: 'interviewer',
      taskId: interview_id,
    });

    // Load relevant context from memory
    const [pastAnalyses, userPreferences, knownPatterns] = await Promise.all([
      memory.findSimilarEpisodes(`interview analysis ${transcript.slice(0, 200)}`, { limit: 3 }),
      memory.searchFacts('interview style preference', { category: 'user_preference' }),
      memory.searchFacts('interview improvement pattern', { category: 'pattern_learned' }),
    ]);

    // Store context in working memory
    await memory.setWorking('past_analyses', pastAnalyses);
    await memory.setWorking('user_preferences', userPreferences);
    await memory.setWorking('known_patterns', knownPatterns);

    // Perform analysis WITH context
    const analysis = await analyzeWithContext({
      transcript,
      pastAnalyses,
      userPreferences,
      knownPatterns,
    });

    // Record this episode
    const episodeId = await memory.recordEpisode({
      actionType: 'interview_analysis',
      actionDescription: `Analyzed interview ${interview_id}`,
      context: {
        goal: 'Provide feedback on interview performance',
        inputs: { transcript_length: transcript.length },
        tools_used: ['transcript_parser', 'gpt4', 'rag_search'],
      },
      outcome: analysis.confidence > 0.8 ? 'success' : 'partial',
      outcomeDetails: {
        result: analysis,
        metrics: {
          confidence: analysis.confidence,
          improvements_found: analysis.improvements.length,
        },
      },
      confidenceScore: analysis.confidence,
    });

    // If confident, store as long-term insight
    if (analysis.confidence > 0.9 && analysis.keyInsight) {
      await memory.storeFact({
        category: 'interview_insight',
        fact: analysis.keyInsight,
        keywords: ['interview', user_id, analysis.interviewType],
        evidence: { source_episodes: [episodeId] },
      });
    }

    // Clear working memory
    await memory.clearWorking();

    return { analysis, episodeId };
  },
});
```

---

## Memory Retrieval Strategies

### 1. Recency-Weighted Retrieval

```typescript
async function getRecentRelevantMemories(
  memory: AgentMemoryManager,
  query: string,
  maxAge: number = 7 * 24 * 60 * 60 * 1000 // 7 days
): Promise<EpisodicMemoryRecord[]> {
  const episodes = await memory.findSimilarEpisodes(query, { limit: 20 });
  
  const now = Date.now();
  return episodes
    .filter(e => now - new Date(e.created_at).getTime() < maxAge)
    .sort((a, b) => {
      // Balance semantic similarity with recency
      const aAge = now - new Date(a.created_at).getTime();
      const bAge = now - new Date(b.created_at).getTime();
      const aRecencyScore = 1 - (aAge / maxAge);
      const bRecencyScore = 1 - (bAge / maxAge);
      return bRecencyScore - aRecencyScore;
    })
    .slice(0, 5);
}
```

### 2. Outcome-Prioritized Retrieval

```typescript
async function getActionableMemories(
  memory: AgentMemoryManager,
  query: string
): Promise<{ successes: EpisodicMemoryRecord[]; failures: EpisodicMemoryRecord[] }> {
  const [successes, failures] = await Promise.all([
    memory.findSimilarEpisodes(query, { outcomeFilter: 'success', limit: 3 }),
    memory.findSimilarEpisodes(query, { outcomeFilter: 'failure', limit: 2 }),
  ]);

  return { successes, failures };
}

// Usage: Learn from both successes and failures
const { successes, failures } = await getActionableMemories(memory, taskDescription);
const prompt = `
  Task: ${taskDescription}
  
  What worked before:
  ${successes.map(s => `- ${s.action_description}`).join('\n')}
  
  What to avoid:
  ${failures.map(f => `- ${f.action_description}: ${f.outcome_details?.error}`).join('\n')}
`;
```

---

## Next Document

Continue to **05-AGENT_COORDINATOR.md** for multi-agent orchestration.

---

**Document Status:** Draft
**Dependencies:** 01, 03
**Next:** 05-AGENT_COORDINATOR.md
