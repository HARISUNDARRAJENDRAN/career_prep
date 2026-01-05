/**
 * Conflict Resolver
 *
 * Handles conflicts between agent outputs, recommendations, and decisions.
 * Uses voting, confidence weighting, and rule-based resolution strategies.
 *
 * @see docs/agentic-improvements/05-AGENT_COORDINATOR.md
 */

import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { messageBus, MessageTopics } from '../message-bus';

// ============================================================================
// Types
// ============================================================================

export type ConflictType =
  | 'skill_priority' // Different agents prioritize skills differently
  | 'roadmap_path' // Conflicting learning path recommendations
  | 'job_ranking' // Different job match rankings
  | 'application_decision' // Apply vs don't apply disagreement
  | 'resource_allocation' // Time/effort distribution conflicts
  | 'timing' // When to take action conflicts
  | 'general'; // Generic conflict

export interface ConflictItem<T = unknown> {
  source: string; // Agent ID or name
  value: T;
  confidence: number; // 0-1
  reasoning?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface Conflict<T = unknown> {
  id: string;
  type: ConflictType;
  items: ConflictItem<T>[];
  context?: Record<string, unknown>;
  created_at: Date;
}

export interface Resolution<T = unknown> {
  conflict_id: string;
  strategy_used: ResolutionStrategy;
  result: T;
  confidence: number;
  explanation: string;
  contributing_sources: string[];
  resolved_at: Date;
}

export type ResolutionStrategy =
  | 'highest_confidence'
  | 'weighted_average'
  | 'majority_vote'
  | 'rule_based'
  | 'ai_mediated'
  | 'most_recent'
  | 'priority_source'
  | 'consensus';

export interface ResolutionRule {
  id: string;
  name: string;
  conflict_types: ConflictType[];
  condition: (conflict: Conflict) => boolean;
  resolve: (conflict: Conflict) => Promise<unknown>;
  priority: number;
}

export interface ConflictResolverConfig {
  default_strategy: ResolutionStrategy;
  source_priorities: Record<string, number>; // Agent name -> priority
  confidence_threshold: number; // Minimum confidence to consider
  enable_ai_mediation: boolean;
  rules?: ResolutionRule[];
}

// ============================================================================
// Conflict Resolver
// ============================================================================

export class ConflictResolver {
  private readonly config: ConflictResolverConfig;
  private readonly rules: ResolutionRule[] = [];
  private readonly pendingConflicts: Map<string, Conflict> = new Map();
  private readonly resolutions: Map<string, Resolution> = new Map();

  constructor(config: Partial<ConflictResolverConfig> = {}) {
    this.config = {
      default_strategy: config.default_strategy || 'weighted_average',
      source_priorities: config.source_priorities || {
        interviewer: 90,
        sentinel: 80,
        architect: 85,
        action: 70,
      },
      confidence_threshold: config.confidence_threshold || 0.3,
      enable_ai_mediation: config.enable_ai_mediation ?? true,
      rules: config.rules || [],
    };

    // Register built-in rules
    this.registerBuiltInRules();

    // Register custom rules
    for (const rule of this.config.rules || []) {
      this.registerRule(rule);
    }
  }

  /**
   * Register a resolution rule
   */
  registerRule(rule: ResolutionRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
    console.log(`[ConflictResolver] Registered rule: ${rule.name}`);
  }

  /**
   * Detect if there's a conflict between items
   */
  detectConflict<T>(
    items: ConflictItem<T>[],
    type: ConflictType,
    context?: Record<string, unknown>
  ): Conflict<T> | null {
    // Filter by confidence threshold
    const validItems = items.filter(
      (item) => item.confidence >= this.config.confidence_threshold
    );

    if (validItems.length < 2) {
      return null; // Need at least 2 items to have a conflict
    }

    // Check if values are actually different
    const hasConflict = this.itemsConflict(validItems, type);
    if (!hasConflict) {
      return null;
    }

    const conflict: Conflict<T> = {
      id: `conflict-${randomUUID().slice(0, 8)}`,
      type,
      items: validItems,
      context,
      created_at: new Date(),
    };

    this.pendingConflicts.set(conflict.id, conflict);
    console.log(`[ConflictResolver] Detected ${type} conflict: ${conflict.id}`);

    return conflict;
  }

  /**
   * Resolve a conflict
   */
  async resolve<T>(
    conflict: Conflict<T>,
    strategy?: ResolutionStrategy
  ): Promise<Resolution<T>> {
    const resolveStrategy = strategy || this.config.default_strategy;

    console.log(`[ConflictResolver] Resolving ${conflict.type} conflict using ${resolveStrategy}`);

    // Check for matching rules first
    const matchingRule = this.rules.find(
      (rule) =>
        rule.conflict_types.includes(conflict.type) && rule.condition(conflict)
    );

    let result: T;
    let explanation: string;
    let confidence: number;
    let usedStrategy = resolveStrategy;

    if (matchingRule) {
      console.log(`[ConflictResolver] Using rule: ${matchingRule.name}`);
      result = (await matchingRule.resolve(conflict)) as T;
      explanation = `Resolved by rule: ${matchingRule.name}`;
      confidence = 0.9;
      usedStrategy = 'rule_based';
    } else {
      const strategyResult = await this.applyStrategy(conflict, resolveStrategy);
      result = strategyResult.result;
      explanation = strategyResult.explanation;
      confidence = strategyResult.confidence;
    }

    const resolution: Resolution<T> = {
      conflict_id: conflict.id,
      strategy_used: usedStrategy,
      result,
      confidence,
      explanation,
      contributing_sources: conflict.items.map((i) => i.source),
      resolved_at: new Date(),
    };

    this.resolutions.set(conflict.id, resolution);
    this.pendingConflicts.delete(conflict.id);

    // Publish resolution event
    await messageBus.publish(MessageTopics.CONFLICT_RESOLVED, {
      conflict_id: conflict.id,
      conflict_type: conflict.type,
      strategy: usedStrategy,
      result,
    });

    return resolution;
  }

  /**
   * Apply a resolution strategy
   */
  private async applyStrategy<T>(
    conflict: Conflict<T>,
    strategy: ResolutionStrategy
  ): Promise<{ result: T; explanation: string; confidence: number }> {
    switch (strategy) {
      case 'highest_confidence':
        return this.resolveByHighestConfidence(conflict);

      case 'weighted_average':
        return this.resolveByWeightedAverage(conflict);

      case 'majority_vote':
        return this.resolveByMajorityVote(conflict);

      case 'most_recent':
        return this.resolveByMostRecent(conflict);

      case 'priority_source':
        return this.resolveByPrioritySource(conflict);

      case 'consensus':
        return this.resolveByConsensus(conflict);

      case 'ai_mediated':
        if (this.config.enable_ai_mediation) {
          return this.resolveByAI(conflict);
        }
        // Fall back to weighted average if AI not enabled
        return this.resolveByWeightedAverage(conflict);

      default:
        return this.resolveByHighestConfidence(conflict);
    }
  }

  /**
   * Resolve by selecting item with highest confidence
   */
  private resolveByHighestConfidence<T>(
    conflict: Conflict<T>
  ): { result: T; explanation: string; confidence: number } {
    const sorted = [...conflict.items].sort(
      (a, b) => b.confidence - a.confidence
    );
    const winner = sorted[0];

    return {
      result: winner.value,
      explanation: `Selected ${winner.source} with highest confidence (${winner.confidence.toFixed(2)})`,
      confidence: winner.confidence,
    };
  }

  /**
   * Resolve by weighted average (for numeric values)
   */
  private resolveByWeightedAverage<T>(
    conflict: Conflict<T>
  ): { result: T; explanation: string; confidence: number } {
    // Check if values are numeric
    const firstValue = conflict.items[0].value;

    if (typeof firstValue === 'number') {
      const totalWeight = conflict.items.reduce(
        (sum, item) => sum + item.confidence,
        0
      );
      const weightedSum = conflict.items.reduce(
        (sum, item) =>
          sum + (item.value as unknown as number) * item.confidence,
        0
      );
      const result = (weightedSum / totalWeight) as unknown as T;
      const avgConfidence =
        conflict.items.reduce((sum, item) => sum + item.confidence, 0) /
        conflict.items.length;

      return {
        result,
        explanation: `Weighted average of ${conflict.items.length} values`,
        confidence: avgConfidence,
      };
    }

    // Fall back to highest confidence for non-numeric
    return this.resolveByHighestConfidence(conflict);
  }

  /**
   * Resolve by majority vote
   */
  private resolveByMajorityVote<T>(
    conflict: Conflict<T>
  ): { result: T; explanation: string; confidence: number } {
    const votes = new Map<string, { count: number; item: ConflictItem<T> }>();

    for (const item of conflict.items) {
      const key = JSON.stringify(item.value);
      const existing = votes.get(key);
      if (existing) {
        existing.count++;
      } else {
        votes.set(key, { count: 1, item });
      }
    }

    let maxCount = 0;
    let winner: ConflictItem<T> | null = null;

    for (const [, value] of votes) {
      if (value.count > maxCount) {
        maxCount = value.count;
        winner = value.item;
      }
    }

    if (!winner) {
      return this.resolveByHighestConfidence(conflict);
    }

    const totalVotes = conflict.items.length;
    const voteConfidence = maxCount / totalVotes;

    return {
      result: winner.value,
      explanation: `Majority vote: ${maxCount}/${totalVotes} (${(voteConfidence * 100).toFixed(0)}%)`,
      confidence: voteConfidence * winner.confidence,
    };
  }

  /**
   * Resolve by most recent item
   */
  private resolveByMostRecent<T>(
    conflict: Conflict<T>
  ): { result: T; explanation: string; confidence: number } {
    const sorted = [...conflict.items].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
    const winner = sorted[0];

    return {
      result: winner.value,
      explanation: `Selected most recent from ${winner.source}`,
      confidence: winner.confidence,
    };
  }

  /**
   * Resolve by source priority
   */
  private resolveByPrioritySource<T>(
    conflict: Conflict<T>
  ): { result: T; explanation: string; confidence: number } {
    const sorted = [...conflict.items].sort((a, b) => {
      const priorityA = this.config.source_priorities[a.source] || 50;
      const priorityB = this.config.source_priorities[b.source] || 50;
      return priorityB - priorityA;
    });

    const winner = sorted[0];
    const priority = this.config.source_priorities[winner.source] || 50;

    return {
      result: winner.value,
      explanation: `Selected ${winner.source} with highest priority (${priority})`,
      confidence: winner.confidence * (priority / 100),
    };
  }

  /**
   * Resolve by finding consensus
   */
  private resolveByConsensus<T>(
    conflict: Conflict<T>
  ): { result: T; explanation: string; confidence: number } {
    // Group similar values and find the most agreed-upon cluster
    const groups = this.groupSimilarItems(conflict.items);

    if (groups.length === 0) {
      return this.resolveByHighestConfidence(conflict);
    }

    // Find largest consensus group
    const largestGroup = groups.reduce((max, group) =>
      group.length > max.length ? group : max
    );

    if (largestGroup.length <= 1) {
      return this.resolveByHighestConfidence(conflict);
    }

    // Pick representative from consensus group
    const representative = largestGroup.reduce((best, item) =>
      item.confidence > best.confidence ? item : best
    );

    const consensusRatio = largestGroup.length / conflict.items.length;

    return {
      result: representative.value,
      explanation: `Consensus from ${largestGroup.length}/${conflict.items.length} sources`,
      confidence: representative.confidence * consensusRatio,
    };
  }

  /**
   * Resolve using AI mediation
   */
  private async resolveByAI<T>(
    conflict: Conflict<T>
  ): Promise<{ result: T; explanation: string; confidence: number }> {
    const openai = new OpenAI();

    const prompt = this.buildAIMediationPrompt(conflict);

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a conflict resolution expert. Analyze conflicting recommendations from different AI agents and determine the best resolution.
Output JSON with:
- selected_index: number (0-based index of the best option)
- explanation: string (why this was selected)
- confidence: number (0-1)`,
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty AI response');
      }

      const parsed = JSON.parse(content);
      const selectedItem = conflict.items[parsed.selected_index];

      return {
        result: selectedItem.value,
        explanation: `AI mediation: ${parsed.explanation}`,
        confidence: parsed.confidence,
      };
    } catch (error) {
      console.error('[ConflictResolver] AI mediation failed:', error);
      return this.resolveByWeightedAverage(conflict);
    }
  }

  /**
   * Build prompt for AI mediation
   */
  private buildAIMediationPrompt<T>(conflict: Conflict<T>): string {
    const options = conflict.items.map((item, index) => ({
      index,
      source: item.source,
      value: item.value,
      confidence: item.confidence,
      reasoning: item.reasoning,
    }));

    return `
Conflict Type: ${conflict.type}
Context: ${JSON.stringify(conflict.context || {})}

Options to resolve:
${JSON.stringify(options, null, 2)}

Analyze these options and select the best resolution. Consider:
1. Source expertise for this conflict type
2. Confidence levels
3. Reasoning quality
4. Context alignment
`;
  }

  /**
   * Check if items have conflicting values
   */
  private itemsConflict<T>(
    items: ConflictItem<T>[],
    type: ConflictType
  ): boolean {
    if (items.length < 2) return false;

    // For numeric values, check if variance is significant
    const firstValue = items[0].value;
    if (typeof firstValue === 'number') {
      const values = items.map((i) => i.value as unknown as number);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
        values.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = mean !== 0 ? stdDev / Math.abs(mean) : 0;

      // If coefficient of variation > 10%, consider it a conflict
      return coefficientOfVariation > 0.1;
    }

    // For other types, check if any values differ
    const firstJson = JSON.stringify(items[0].value);
    return items.some((item) => JSON.stringify(item.value) !== firstJson);
  }

  /**
   * Group similar items together
   */
  private groupSimilarItems<T>(items: ConflictItem<T>[]): ConflictItem<T>[][] {
    const groups: ConflictItem<T>[][] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < items.length; i++) {
      if (assigned.has(i)) continue;

      const group: ConflictItem<T>[] = [items[i]];
      assigned.add(i);

      for (let j = i + 1; j < items.length; j++) {
        if (assigned.has(j)) continue;

        if (this.areValuesSimilar(items[i].value, items[j].value)) {
          group.push(items[j]);
          assigned.add(j);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Check if two values are similar
   */
  private areValuesSimilar<T>(a: T, b: T): boolean {
    if (typeof a === 'number' && typeof b === 'number') {
      const diff = Math.abs(a - b);
      const max = Math.max(Math.abs(a), Math.abs(b));
      return max === 0 ? diff === 0 : diff / max < 0.05; // 5% tolerance
    }

    return JSON.stringify(a) === JSON.stringify(b);
  }

  /**
   * Register built-in resolution rules
   */
  private registerBuiltInRules(): void {
    // Rule: High confidence single source wins
    this.rules.push({
      id: 'high_confidence_single',
      name: 'High Confidence Single Source',
      conflict_types: ['skill_priority', 'job_ranking', 'application_decision'],
      condition: (conflict) => {
        const highConfidence = conflict.items.filter((i) => i.confidence > 0.9);
        return highConfidence.length === 1;
      },
      resolve: async (conflict) => {
        const winner = conflict.items.find((i) => i.confidence > 0.9);
        return winner?.value;
      },
      priority: 100,
    });

    // Rule: Interviewer wins for skill-related conflicts
    this.rules.push({
      id: 'interviewer_skill_authority',
      name: 'Interviewer Skill Authority',
      conflict_types: ['skill_priority'],
      condition: (conflict) =>
        conflict.items.some((i) => i.source === 'interviewer'),
      resolve: async (conflict) => {
        const interviewer = conflict.items.find(
          (i) => i.source === 'interviewer'
        );
        return interviewer?.value;
      },
      priority: 90,
    });

    // Rule: Sentinel wins for job ranking
    this.rules.push({
      id: 'sentinel_job_authority',
      name: 'Sentinel Job Authority',
      conflict_types: ['job_ranking'],
      condition: (conflict) =>
        conflict.items.some((i) => i.source === 'sentinel'),
      resolve: async (conflict) => {
        const sentinel = conflict.items.find((i) => i.source === 'sentinel');
        return sentinel?.value;
      },
      priority: 85,
    });

    // Rule: Architect wins for roadmap paths
    this.rules.push({
      id: 'architect_roadmap_authority',
      name: 'Architect Roadmap Authority',
      conflict_types: ['roadmap_path', 'resource_allocation'],
      condition: (conflict) =>
        conflict.items.some((i) => i.source === 'architect'),
      resolve: async (conflict) => {
        const architect = conflict.items.find((i) => i.source === 'architect');
        return architect?.value;
      },
      priority: 85,
    });

    // Rule: Conservative approach for application decisions
    this.rules.push({
      id: 'conservative_application',
      name: 'Conservative Application Decision',
      conflict_types: ['application_decision'],
      condition: (conflict) =>
        conflict.items.some(
          (i) => i.value === 'no' || i.value === 'wait' || i.value === 'maybe'
        ),
      resolve: async (conflict) => {
        // If any agent says no/wait with decent confidence, be conservative
        const conservative = conflict.items.find(
          (i) =>
            (i.value === 'no' || i.value === 'wait' || i.value === 'maybe') &&
            i.confidence > 0.6
        );
        return conservative?.value || conflict.items[0].value;
      },
      priority: 80,
    });
  }

  /**
   * Get resolution history
   */
  getResolutions(): Resolution[] {
    return Array.from(this.resolutions.values());
  }

  /**
   * Get pending conflicts
   */
  getPendingConflicts(): Conflict[] {
    return Array.from(this.pendingConflicts.values());
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const conflictResolver = new ConflictResolver();

export default ConflictResolver;
