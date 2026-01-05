/**
 * Agent Memory Manager
 *
 * Manages the three-tier memory system for autonomous agents:
 * - Working Memory: Current task context
 * - Episodic Memory: Past actions and outcomes
 * - Long-term Memory: Validated knowledge
 *
 * @see docs/agentic-improvements/04-AGENT_MEMORY_SYSTEM.md
 */

import { db } from '@/drizzle/db';
import {
  workingMemory,
  episodicMemory,
  longTermMemory,
  type MemoryAgentName,
  type MemoryCategory,
  type WorkingMemory,
  type EpisodicMemory,
  type LongTermMemory,
} from '@/drizzle/schema';
import { eq, and, desc, gte, lte, sql, asc } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the memory manager
 */
export interface MemoryManagerConfig {
  agent_name: MemoryAgentName;
  task_id: string;
  user_id?: string;
}

/**
 * Episode outcome type
 */
export interface EpisodeOutcome {
  success: boolean;
  result_summary: string;
  metrics?: Record<string, number>;
  artifacts_created?: string[];
}

/**
 * Episode context type
 */
export interface EpisodeContext {
  trigger_event?: string;
  input_summary?: string;
  tools_used?: string[];
  plan_id?: string;
}

/**
 * Options for memory retrieval
 */
export interface RetrievalOptions {
  limit?: number;
  since?: Date;
  min_importance?: number;
  min_confidence?: number;
  categories?: MemoryCategory[];
  include_global?: boolean;
}

/**
 * Long-term memory evidence type
 */
export interface MemoryEvidence {
  source_episodes?: string[];
  validation_method?: string;
  last_validated?: string;
  supporting_data?: Record<string, unknown>;
  supersedes?: string;
}

// ============================================================================
// Agent Memory Manager Class
// ============================================================================

/**
 * AgentMemoryManager handles all memory operations for an autonomous agent
 */
export class AgentMemoryManager {
  private agent_name: MemoryAgentName;
  private task_id: string;
  private user_id?: string;

  // In-memory cache for working memory (faster access)
  private working_cache: Map<string, unknown> = new Map();

  constructor(config: MemoryManagerConfig) {
    this.agent_name = config.agent_name;
    this.task_id = config.task_id;
    this.user_id = config.user_id;
  }

  // ==========================================================================
  // Working Memory Operations
  // ==========================================================================

  /**
   * Store a value in working memory
   */
  async setWorking(key: string, value: unknown): Promise<void> {
    // Update cache
    this.working_cache.set(key, value);

    // Persist to database (upsert)
    await db
      .insert(workingMemory)
      .values({
        agent_name: this.agent_name,
        task_id: this.task_id,
        user_id: this.user_id,
        key,
        value: value as Record<string, unknown>,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours default
      })
      .onConflictDoUpdate({
        target: [workingMemory.task_id, workingMemory.key],
        set: {
          value: value as Record<string, unknown>,
          updated_at: new Date(),
        },
      });
  }

  /**
   * Get a value from working memory
   */
  async getWorking<T = unknown>(key: string): Promise<T | null> {
    // Check cache first
    if (this.working_cache.has(key)) {
      return this.working_cache.get(key) as T;
    }

    // Query database
    const memory = await db.query.workingMemory.findFirst({
      where: and(
        eq(workingMemory.task_id, this.task_id),
        eq(workingMemory.key, key)
      ),
    });

    if (memory) {
      this.working_cache.set(key, memory.value);
      return memory.value as T;
    }

    return null;
  }

  /**
   * Get all working memory for current task
   */
  async getAllWorking(): Promise<Record<string, unknown>> {
    const memories = await db.query.workingMemory.findMany({
      where: eq(workingMemory.task_id, this.task_id),
    });

    const result: Record<string, unknown> = {};
    for (const mem of memories) {
      result[mem.key] = mem.value;
      this.working_cache.set(mem.key, mem.value);
    }

    return result;
  }

  /**
   * Delete a value from working memory
   */
  async deleteWorking(key: string): Promise<void> {
    this.working_cache.delete(key);
    await db
      .delete(workingMemory)
      .where(
        and(eq(workingMemory.task_id, this.task_id), eq(workingMemory.key, key))
      );
  }

  /**
   * Clear all working memory for current task
   */
  async clearWorking(): Promise<void> {
    this.working_cache.clear();
    await db.delete(workingMemory).where(eq(workingMemory.task_id, this.task_id));
  }

  // ==========================================================================
  // Episodic Memory Operations
  // ==========================================================================

  /**
   * Record an episode (action + outcome)
   */
  async recordEpisode(params: {
    episode_type: string;
    action_taken: string;
    context?: EpisodeContext;
    outcome: EpisodeOutcome;
    confidence_score?: number;
  }): Promise<string> {
    const [episode] = await db
      .insert(episodicMemory)
      .values({
        agent_name: this.agent_name,
        user_id: this.user_id,
        episode_type: params.episode_type,
        action_taken: params.action_taken,
        context: params.context,
        outcome: params.outcome,
        confidence_score: params.confidence_score ?? 0.5,
        importance_score: this.calculateImportance(params.outcome),
        embedding_text: this.generateEmbeddingText(params),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })
      .returning({ id: episodicMemory.id });

    return episode.id;
  }

  /**
   * Retrieve relevant episodes
   */
  async recallEpisodes(options: RetrievalOptions = {}): Promise<EpisodicMemory[]> {
    const {
      limit = 10,
      since,
      min_importance = 0,
    } = options;

    const conditions = [
      eq(episodicMemory.agent_name, this.agent_name),
    ];

    if (this.user_id) {
      conditions.push(eq(episodicMemory.user_id, this.user_id));
    }

    if (since) {
      conditions.push(gte(episodicMemory.occurred_at, since));
    }

    if (min_importance > 0) {
      conditions.push(gte(episodicMemory.importance_score, min_importance));
    }

    const episodes = await db.query.episodicMemory.findMany({
      where: and(...conditions),
      orderBy: [desc(episodicMemory.importance_score), desc(episodicMemory.occurred_at)],
      limit,
    });

    // Update retrieval count for accessed episodes
    if (episodes.length > 0) {
      await db
        .update(episodicMemory)
        .set({
          retrieval_count: sql`retrieval_count + 1`,
        })
        .where(
          sql`${episodicMemory.id} IN (${sql.raw(episodes.map((e) => `'${e.id}'`).join(','))})`
        );
    }

    return episodes;
  }

  /**
   * Find episodes by type
   */
  async findEpisodesByType(
    episode_type: string,
    limit = 10
  ): Promise<EpisodicMemory[]> {
    return db.query.episodicMemory.findMany({
      where: and(
        eq(episodicMemory.agent_name, this.agent_name),
        eq(episodicMemory.episode_type, episode_type),
        this.user_id ? eq(episodicMemory.user_id, this.user_id) : undefined
      ),
      orderBy: [desc(episodicMemory.occurred_at)],
      limit,
    });
  }

  /**
   * Get success rate for episode type
   */
  async getSuccessRate(episode_type: string): Promise<{
    total: number;
    successful: number;
    rate: number;
  }> {
    const episodes = await this.findEpisodesByType(episode_type, 100);

    const total = episodes.length;
    const successful = episodes.filter((e) => e.outcome?.success).length;

    return {
      total,
      successful,
      rate: total > 0 ? successful / total : 0,
    };
  }

  /**
   * Record user feedback on an episode
   */
  async recordFeedback(
    episode_id: string,
    feedback: { rating?: number; comment?: string }
  ): Promise<void> {
    await db
      .update(episodicMemory)
      .set({
        user_feedback: {
          ...feedback,
          received_at: new Date().toISOString(),
        },
        // Boost importance based on feedback
        importance_score: sql`LEAST(1.0, importance_score + 0.2)`,
      })
      .where(eq(episodicMemory.id, episode_id));
  }

  // ==========================================================================
  // Long-Term Memory Operations
  // ==========================================================================

  /**
   * Store a validated fact in long-term memory
   */
  async rememberFact(params: {
    category: MemoryCategory;
    fact: string;
    confidence?: number;
    evidence?: MemoryEvidence;
    metadata?: { tags?: string[]; related_facts?: string[] };
  }): Promise<string> {
    const [memory] = await db
      .insert(longTermMemory)
      .values({
        agent_name: this.agent_name,
        user_id: this.user_id,
        category: params.category,
        fact: params.fact,
        confidence: params.confidence ?? 0.5,
        evidence: params.evidence,
        metadata: params.metadata,
        embedding_text: params.fact,
      })
      .returning({ id: longTermMemory.id });

    return memory.id;
  }

  /**
   * Retrieve facts from long-term memory
   */
  async recallFacts(options: RetrievalOptions = {}): Promise<LongTermMemory[]> {
    const {
      limit = 10,
      min_confidence = 0,
      categories,
      include_global = true,
    } = options;

    const conditions = [];

    // User-specific or global facts
    if (include_global) {
      conditions.push(
        sql`(${longTermMemory.user_id} = ${this.user_id} OR ${longTermMemory.user_id} IS NULL)`
      );
    } else if (this.user_id) {
      conditions.push(eq(longTermMemory.user_id, this.user_id));
    }

    // Agent-specific or global facts
    conditions.push(
      sql`(${longTermMemory.agent_name} = ${this.agent_name} OR ${longTermMemory.agent_name} IS NULL)`
    );

    if (min_confidence > 0) {
      conditions.push(gte(longTermMemory.confidence, min_confidence));
    }

    if (categories && categories.length > 0) {
      conditions.push(
        sql`${longTermMemory.category} IN (${sql.raw(categories.map((c) => `'${c}'`).join(','))})`
      );
    }

    const facts = await db.query.longTermMemory.findMany({
      where: and(...conditions),
      orderBy: [desc(longTermMemory.relevance_score), desc(longTermMemory.confidence)],
      limit,
    });

    // Update retrieval count and last accessed time
    if (facts.length > 0) {
      await db
        .update(longTermMemory)
        .set({
          retrieval_count: sql`retrieval_count + 1`,
          last_accessed_at: new Date(),
        })
        .where(
          sql`${longTermMemory.id} IN (${sql.raw(facts.map((f) => `'${f.id}'`).join(','))})`
        );
    }

    return facts;
  }

  /**
   * Find facts by category
   */
  async findFactsByCategory(
    category: MemoryCategory,
    limit = 10
  ): Promise<LongTermMemory[]> {
    return this.recallFacts({ categories: [category], limit });
  }

  /**
   * Reinforce a fact (increase confidence)
   */
  async reinforceFact(fact_id: string): Promise<void> {
    await db
      .update(longTermMemory)
      .set({
        validation_count: sql`validation_count + 1`,
        confidence: sql`LEAST(1.0, confidence + 0.1)`,
        relevance_score: sql`LEAST(1.0, relevance_score + 0.05)`,
        last_reinforced_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(longTermMemory.id, fact_id));
  }

  /**
   * Contradict a fact (decrease confidence)
   */
  async contradictFact(fact_id: string): Promise<void> {
    await db
      .update(longTermMemory)
      .set({
        contradiction_count: sql`contradiction_count + 1`,
        confidence: sql`GREATEST(0.0, confidence - 0.15)`,
        updated_at: new Date(),
      })
      .where(eq(longTermMemory.id, fact_id));
  }

  /**
   * Supersede a fact with a new version
   */
  async supersedeFact(old_fact_id: string, new_fact: string): Promise<string> {
    // Get old fact for category
    const oldFact = await db.query.longTermMemory.findFirst({
      where: eq(longTermMemory.id, old_fact_id),
    });

    if (!oldFact) {
      throw new Error(`Fact ${old_fact_id} not found`);
    }

    // Create new fact
    const new_id = await this.rememberFact({
      category: oldFact.category,
      fact: new_fact,
      confidence: oldFact.confidence,
      evidence: {
        ...(oldFact.evidence as MemoryEvidence),
        supersedes: old_fact_id,
      },
    });

    // Mark old fact as superseded
    await db
      .update(longTermMemory)
      .set({
        metadata: sql`jsonb_set(COALESCE(metadata, '{}'::jsonb), '{superseded_by}', ${JSON.stringify(new_id)}::jsonb)`,
        relevance_score: 0,
        updated_at: new Date(),
      })
      .where(eq(longTermMemory.id, old_fact_id));

    return new_id;
  }

  // ==========================================================================
  // Memory Consolidation Operations
  // ==========================================================================

  /**
   * Promote important episodes to long-term memory
   */
  async consolidateEpisodes(threshold = 0.8): Promise<number> {
    // Find high-importance episodes that haven't been consolidated
    const episodes = await db.query.episodicMemory.findMany({
      where: and(
        eq(episodicMemory.agent_name, this.agent_name),
        this.user_id ? eq(episodicMemory.user_id, this.user_id) : undefined,
        gte(episodicMemory.importance_score, threshold),
        gte(episodicMemory.retrieval_count, 3) // Accessed multiple times
      ),
      limit: 10,
    });

    let consolidated = 0;

    for (const episode of episodes) {
      // Extract learnable fact from episode
      const fact = this.extractFactFromEpisode(episode);
      if (fact) {
        await this.rememberFact({
          category: 'pattern_learned',
          fact,
          confidence: episode.confidence_score ?? 0.5,
          evidence: {
            source_episodes: [episode.id],
            validation_method: 'episode_consolidation',
            last_validated: new Date().toISOString(),
          },
        });
        consolidated++;
      }
    }

    return consolidated;
  }

  /**
   * Decay relevance of old memories
   */
  async decayRelevance(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Decay long-term memory relevance
    await db
      .update(longTermMemory)
      .set({
        relevance_score: sql`GREATEST(0.1, relevance_score * 0.95)`,
        updated_at: new Date(),
      })
      .where(
        and(
          lte(longTermMemory.last_accessed_at, thirtyDaysAgo),
          gte(longTermMemory.relevance_score, 0.1)
        )
      );
  }

  /**
   * Cleanup expired memories
   */
  async cleanup(): Promise<{ working: number; episodic: number }> {
    const now = new Date();

    // Clean working memory
    const workingResult = await db
      .delete(workingMemory)
      .where(lte(workingMemory.expires_at, now))
      .returning({ id: workingMemory.id });

    // Clean episodic memory
    const episodicResult = await db
      .delete(episodicMemory)
      .where(lte(episodicMemory.expires_at, now))
      .returning({ id: episodicMemory.id });

    return {
      working: workingResult.length,
      episodic: episodicResult.length,
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private calculateImportance(outcome: EpisodeOutcome): number {
    let importance = 0.5; // Base importance

    // Success/failure affects importance
    if (!outcome.success) {
      importance += 0.2; // Failures are important to learn from
    }

    // High-impact outcomes
    if (outcome.metrics) {
      const values = Object.values(outcome.metrics);
      if (values.some((v) => v > 0.9 || v < 0.1)) {
        importance += 0.1; // Extreme values are noteworthy
      }
    }

    return Math.min(1.0, importance);
  }

  private generateEmbeddingText(params: {
    episode_type: string;
    action_taken: string;
    context?: EpisodeContext;
    outcome: EpisodeOutcome;
  }): string {
    const parts = [
      `Episode: ${params.episode_type}`,
      `Action: ${params.action_taken}`,
      `Outcome: ${params.outcome.result_summary}`,
    ];

    if (params.context?.tools_used?.length) {
      parts.push(`Tools: ${params.context.tools_used.join(', ')}`);
    }

    return parts.join('. ');
  }

  private extractFactFromEpisode(episode: EpisodicMemory): string | null {
    // Simple extraction - in production, use AI for better extraction
    if (episode.outcome?.success) {
      return `When performing ${episode.episode_type}, ${episode.action_taken} led to success.`;
    } else {
      return `When performing ${episode.episode_type}, ${episode.action_taken} should be avoided or improved.`;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new memory manager for an agent
 */
export function createMemoryManager(
  config: MemoryManagerConfig
): AgentMemoryManager {
  return new AgentMemoryManager(config);
}
