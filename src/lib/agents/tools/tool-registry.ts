/**
 * Tool Registry
 *
 * Central catalog of all available tools for autonomous agents.
 * Tools are registered at startup and can be queried by capability.
 *
 * @see docs/agentic-improvements/07-TOOL_SELECTION.md
 */

import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

/**
 * Tool category for organization and filtering
 */
export type ToolCategory =
  | 'parsing' // Data extraction
  | 'analysis' // AI-powered analysis
  | 'search' // Information retrieval
  | 'generation' // Content generation
  | 'communication' // Email, notifications
  | 'database' // Data operations
  | 'external_api' // Third-party services
  | 'data_collection' // Scraping, API fetching
  | 'data_retrieval' // Fetching from database
  | 'matching' // Job/skill matching
  | 'persistence' // Storing data
  | 'decision' // AI decision making
  | 'validation'; // Validation checks

/**
 * Tool execution cost estimation
 */
export interface ToolCost {
  tokens?: number; // Estimated token usage
  latency_ms?: number; // Expected execution time
  api_calls?: number; // External API calls
  credits?: number; // Any credit-based cost
}

/**
 * Tool rate limiting configuration
 */
export interface ToolRateLimit {
  requests_per_minute: number;
  requests_per_hour?: number;
  concurrent_limit?: number;
}

/**
 * Example of tool usage
 */
export interface ToolExample {
  goal: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  description?: string;
}

/**
 * Tool handler function type
 */
export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput
) => Promise<TOutput>;

/**
 * Complete tool definition
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  // Identity
  id: string;
  name: string;
  description: string;
  version?: string;

  // Categorization
  category: ToolCategory;
  tags: string[];

  // Schema validation
  input_schema: z.ZodSchema<TInput>;
  output_schema: z.ZodSchema<TOutput>;

  // Execution
  handler: ToolHandler<TInput, TOutput>;

  // Cost estimation
  cost: ToolCost;

  // Requirements
  requires: string[]; // Required env vars or dependencies
  rate_limit?: ToolRateLimit;

  // Usage guidance
  best_for: string[]; // Descriptions of ideal use cases
  not_suitable_for: string[]; // Anti-patterns

  // Examples
  examples: ToolExample[];

  // Status
  enabled: boolean;
  deprecated?: boolean;
  deprecation_message?: string;
}

/**
 * Tool search result with relevance scoring
 */
export interface ToolSearchResult {
  tool: ToolDefinition;
  relevance: number;
  match_reason: string;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult<TOutput = unknown> {
  success: boolean;
  output?: TOutput;
  error?: string;
  duration_ms: number;
  tokens_used?: number;
}

// ============================================================================
// Tool Registry Class
// ============================================================================

/**
 * ToolRegistry manages the catalog of available tools
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private categoryIndex: Map<ToolCategory, Set<string>> = new Map();

  // =========================================================================
  // Registration
  // =========================================================================

  /**
   * Register a tool in the registry
   */
  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    // Check for missing requirements
    const missingReqs = tool.requires.filter((req) => !process.env[req]);
    if (missingReqs.length > 0) {
      console.warn(
        `Tool ${tool.id} is missing required env vars: ${missingReqs.join(', ')}`
      );
      // Still register but mark as disabled
      tool.enabled = false;
    }

    // Store tool
    this.tools.set(tool.id, tool as ToolDefinition);

    // Index by tags
    for (const tag of tool.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(tool.id);
    }

    // Index by category
    if (!this.categoryIndex.has(tool.category)) {
      this.categoryIndex.set(tool.category, new Set());
    }
    this.categoryIndex.get(tool.category)!.add(tool.id);

    console.log(
      `[ToolRegistry] Registered: ${tool.id} (${tool.enabled ? 'enabled' : 'disabled'})`
    );
  }

  /**
   * Register multiple tools at once
   */
  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Unregister a tool
   */
  unregister(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    if (!tool) return false;

    // Remove from indexes
    for (const tag of tool.tags) {
      this.tagIndex.get(tag)?.delete(toolId);
    }
    this.categoryIndex.get(tool.category)?.delete(toolId);

    // Remove from main map
    this.tools.delete(toolId);

    return true;
  }

  // =========================================================================
  // Retrieval
  // =========================================================================

  /**
   * Check if a tool exists by ID
   */
  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * Get a tool by ID
   */
  get(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get all registered tools
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all enabled tools
   */
  getEnabled(): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) => t.enabled && !t.deprecated);
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolCategory): ToolDefinition[] {
    const toolIds = this.categoryIndex.get(category);
    if (!toolIds) return [];

    return Array.from(toolIds)
      .map((id) => this.tools.get(id))
      .filter((t): t is ToolDefinition => t !== undefined && t.enabled);
  }

  /**
   * Get tools by tag
   */
  getByTag(tag: string): ToolDefinition[] {
    const toolIds = this.tagIndex.get(tag);
    if (!toolIds) return [];

    return Array.from(toolIds)
      .map((id) => this.tools.get(id))
      .filter((t): t is ToolDefinition => t !== undefined && t.enabled);
  }

  /**
   * Get tools by multiple tags (union)
   */
  getByTags(tags: string[]): ToolDefinition[] {
    const toolIds = new Set<string>();
    for (const tag of tags) {
      const ids = this.tagIndex.get(tag);
      if (ids) {
        ids.forEach((id) => toolIds.add(id));
      }
    }

    return Array.from(toolIds)
      .map((id) => this.tools.get(id))
      .filter((t): t is ToolDefinition => t !== undefined && t.enabled);
  }

  // =========================================================================
  // Search
  // =========================================================================

  /**
   * Search tools by text query
   * Returns tools sorted by relevance
   */
  search(query: string): ToolSearchResult[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    const results: ToolSearchResult[] = [];

    for (const tool of this.getEnabled()) {
      let relevance = 0;
      const matchReasons: string[] = [];

      // Name match (highest weight)
      if (tool.name.toLowerCase().includes(queryLower)) {
        relevance += 0.5;
        matchReasons.push('name');
      }

      // ID match
      if (tool.id.toLowerCase().includes(queryLower)) {
        relevance += 0.3;
        matchReasons.push('id');
      }

      // Description match
      const descLower = tool.description.toLowerCase();
      for (const word of queryWords) {
        if (descLower.includes(word)) {
          relevance += 0.1;
          if (!matchReasons.includes('description')) {
            matchReasons.push('description');
          }
        }
      }

      // Tag match
      for (const tag of tool.tags) {
        if (tag.toLowerCase().includes(queryLower)) {
          relevance += 0.2;
          matchReasons.push(`tag:${tag}`);
        }
      }

      // Best-for match
      for (const useCase of tool.best_for) {
        if (useCase.toLowerCase().includes(queryLower)) {
          relevance += 0.3;
          matchReasons.push('use-case');
        }
      }

      // Category match
      if (tool.category.toLowerCase().includes(queryLower)) {
        relevance += 0.15;
        matchReasons.push('category');
      }

      if (relevance > 0) {
        results.push({
          tool,
          relevance: Math.min(1.0, relevance),
          match_reason: matchReasons.join(', '),
        });
      }
    }

    // Sort by relevance descending
    return results.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Find tools suitable for a goal
   */
  findForGoal(goal: string): ToolSearchResult[] {
    // First try direct search
    const directMatches = this.search(goal);

    // Also check best_for matches more thoroughly
    const goalLower = goal.toLowerCase();
    const results = new Map<string, ToolSearchResult>();

    // Add direct matches
    for (const match of directMatches) {
      results.set(match.tool.id, match);
    }

    // Check best_for specifically
    for (const tool of this.getEnabled()) {
      for (const useCase of tool.best_for) {
        const similarity = this.calculateSimilarity(goalLower, useCase.toLowerCase());
        if (similarity > 0.3) {
          const existing = results.get(tool.id);
          const relevance = Math.min(1.0, (existing?.relevance || 0) + similarity * 0.5);
          results.set(tool.id, {
            tool,
            relevance,
            match_reason: existing
              ? `${existing.match_reason}, best_for`
              : 'best_for',
          });
        }
      }
    }

    return Array.from(results.values()).sort((a, b) => b.relevance - a.relevance);
  }

  // =========================================================================
  // Execution
  // =========================================================================

  /**
   * Execute a tool with validation
   */
  async execute<TInput, TOutput>(
    toolId: string,
    input: TInput
  ): Promise<ToolExecutionResult<TOutput>> {
    const tool = this.tools.get(toolId) as ToolDefinition<TInput, TOutput> | undefined;

    if (!tool) {
      return {
        success: false,
        error: `Tool ${toolId} not found`,
        duration_ms: 0,
      };
    }

    if (!tool.enabled) {
      return {
        success: false,
        error: `Tool ${toolId} is disabled`,
        duration_ms: 0,
      };
    }

    if (tool.deprecated) {
      console.warn(
        `Tool ${toolId} is deprecated: ${tool.deprecation_message || 'Consider using an alternative'}`
      );
    }

    const startTime = Date.now();

    try {
      // Validate input
      const validatedInput = tool.input_schema.parse(input);

      // Execute
      const output = await tool.handler(validatedInput);

      // Validate output
      const validatedOutput = tool.output_schema.parse(output);

      return {
        success: true,
        output: validatedOutput,
        duration_ms: Date.now() - startTime,
        tokens_used: tool.cost.tokens,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
      };
    }
  }

  // =========================================================================
  // Metadata
  // =========================================================================

  /**
   * Get all categories
   */
  getCategories(): ToolCategory[] {
    return Array.from(this.categoryIndex.keys());
  }

  /**
   * Get all tags
   */
  getTags(): string[] {
    return Array.from(this.tagIndex.keys());
  }

  /**
   * Get statistics about the registry
   */
  getStats(): {
    total: number;
    enabled: number;
    deprecated: number;
    by_category: Record<string, number>;
  } {
    const tools = Array.from(this.tools.values());

    const byCategory: Record<string, number> = {};
    for (const tool of tools) {
      byCategory[tool.category] = (byCategory[tool.category] || 0) + 1;
    }

    return {
      total: tools.length,
      enabled: tools.filter((t) => t.enabled).length,
      deprecated: tools.filter((t) => t.deprecated).length,
      by_category: byCategory,
    };
  }

  /**
   * Export tools for AI tool selection
   */
  exportForAI(): Array<{
    id: string;
    name: string;
    description: string;
    best_for: string[];
    category: string;
    cost: ToolCost;
  }> {
    return this.getEnabled().map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      best_for: tool.best_for,
      category: tool.category,
      cost: tool.cost,
    }));
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private calculateSimilarity(str1: string, str2: string): number {
    // Simple word overlap similarity
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));

    let overlap = 0;
    for (const word of words1) {
      if (words2.has(word)) {
        overlap++;
      }
    }

    return overlap / Math.max(words1.size, words2.size);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global tool registry instance
 */
export const toolRegistry = new ToolRegistry();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a tool definition with type safety
 */
export function defineTool<TInput, TOutput>(
  tool: ToolDefinition<TInput, TOutput>
): ToolDefinition<TInput, TOutput> {
  return tool;
}

/**
 * Register a tool in the global registry
 */
export function registerTool<TInput, TOutput>(
  tool: ToolDefinition<TInput, TOutput>
): void {
  toolRegistry.register(tool);
}
