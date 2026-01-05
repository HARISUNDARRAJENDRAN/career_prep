/**
 * Tool Selector
 *
 * AI-powered tool selection based on task context and goal requirements.
 * Selects the most appropriate tools from the registry.
 *
 * @see docs/agentic-improvements/07-TOOL_SELECTION.md
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { toolRegistry, type ToolDefinition, type ToolSearchResult } from './tool-registry';

// ============================================================================
// Types
// ============================================================================

/**
 * Context for tool selection
 */
export interface ToolSelectionContext {
  task_description: string;
  goal?: string;
  constraints?: string[];
  preferred_categories?: string[];
  excluded_tools?: string[];
  max_tools?: number;
  working_memory?: Record<string, unknown>;
}

/**
 * Result of tool selection
 */
export interface ToolSelectionResult {
  selected_tools: SelectedTool[];
  reasoning: string;
  confidence: number;
  alternatives?: SelectedTool[];
}

/**
 * A selected tool with usage instructions
 */
export interface SelectedTool {
  tool_id: string;
  tool_name: string;
  relevance_score: number;
  usage_hint: string;
  suggested_input?: Record<string, unknown>;
}

/**
 * Configuration for the tool selector
 */
export interface ToolSelectorConfig {
  model: 'gpt-4o-mini' | 'gpt-4o';
  max_selections: number;
  min_relevance_score: number;
  enable_alternatives: boolean;
}

// ============================================================================
// Zod Schemas
// ============================================================================

const SelectedToolSchema = z.object({
  tool_id: z.string(),
  relevance_score: z.number().min(0).max(1),
  usage_hint: z.string(),
  suggested_input: z.record(z.string(), z.unknown()).optional(),
});

const ToolSelectionResponseSchema = z.object({
  selected_tools: z.array(SelectedToolSchema),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
  alternatives: z.array(SelectedToolSchema).optional(),
});

// ============================================================================
// Tool Selector Class
// ============================================================================

/**
 * ToolSelector uses AI to select appropriate tools for tasks
 */
export class ToolSelector {
  private openai: OpenAI;
  private config: ToolSelectorConfig;

  constructor(config: ToolSelectorConfig) {
    this.config = config;
    this.openai = new OpenAI();
  }

  /**
   * Select tools for a given task
   */
  async select(context: ToolSelectionContext): Promise<ToolSelectionResult> {
    // Get available tools
    let availableTools = toolRegistry.exportForAI();

    // Apply filters
    if (context.preferred_categories?.length) {
      const categoryTools = availableTools.filter((t) =>
        context.preferred_categories!.includes(t.category)
      );
      if (categoryTools.length > 0) {
        availableTools = categoryTools;
      }
    }

    if (context.excluded_tools?.length) {
      availableTools = availableTools.filter(
        (t) => !context.excluded_tools!.includes(t.id)
      );
    }

    if (availableTools.length === 0) {
      return {
        selected_tools: [],
        reasoning: 'No tools available matching criteria',
        confidence: 0,
      };
    }

    const prompt = this.buildPrompt(context, availableTools);

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    const parsed = ToolSelectionResponseSchema.parse(JSON.parse(content));

    // Filter by min relevance and enrich with tool names
    const selectedTools = parsed.selected_tools
      .filter((t) => t.relevance_score >= this.config.min_relevance_score)
      .slice(0, context.max_tools || this.config.max_selections)
      .map((t) => {
        const tool = toolRegistry.get(t.tool_id);
        return {
          ...t,
          tool_name: tool?.name || t.tool_id,
        };
      });

    return {
      selected_tools: selectedTools,
      reasoning: parsed.reasoning,
      confidence: parsed.confidence,
      alternatives: this.config.enable_alternatives
        ? parsed.alternatives?.map((t) => ({
            ...t,
            tool_name: toolRegistry.get(t.tool_id)?.name || t.tool_id,
          }))
        : undefined,
    };
  }

  /**
   * Quick selection using keyword matching (no AI call)
   */
  quickSelect(keywords: string[]): ToolDefinition[] {
    const results: ToolDefinition[] = [];

    for (const keyword of keywords) {
      const matches = toolRegistry.search(keyword);
      for (const match of matches) {
        if (!results.find((r) => r.id === match.tool.id)) {
          results.push(match.tool);
        }
      }
    }

    return results;
  }

  /**
   * Select the single best tool for a task
   */
  async selectBest(
    task_description: string
  ): Promise<SelectedTool | null> {
    const result = await this.select({
      task_description,
      max_tools: 1,
    });

    return result.selected_tools[0] || null;
  }

  /**
   * Rank tools by relevance to a task
   */
  async rank(
    task_description: string,
    tools: ToolDefinition[]
  ): Promise<Array<{ tool: ToolDefinition; score: number; reasoning: string }>> {
    const prompt = `Rank these tools by relevance to the task.

Task: ${task_description}

Tools:
${tools.map((t) => `- ${t.id}: ${t.description}`).join('\n')}

Respond with JSON:
{
  "rankings": [
    { "tool_id": "id", "score": 0.X, "reasoning": "why" }
  ]
}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return tools.map((t) => ({ tool: t, score: 0.5, reasoning: 'Unable to rank' }));
    }

    const parsed = JSON.parse(content);
    const rankings = parsed.rankings as Array<{
      tool_id: string;
      score: number;
      reasoning: string;
    }>;

    return rankings
      .map((r) => {
        const tool = tools.find((t) => t.id === r.tool_id);
        if (!tool) return null;
        return { tool, score: r.score, reasoning: r.reasoning };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private buildPrompt(
    context: ToolSelectionContext,
    tools: Array<{
      id: string;
      name: string;
      description: string;
      best_for: string[];
      category: string;
      input_schema?: object;
      cost: { tokens?: number; latency_ms?: number };
    }>
  ): string {
    let prompt = `You are an expert tool selector for an autonomous agent. Select the most appropriate tools for the given task.

Task: ${context.task_description}
`;

    if (context.goal) {
      prompt += `\nGoal: ${context.goal}`;
    }

    if (context.constraints?.length) {
      prompt += `\nConstraints:\n${context.constraints.map((c) => `- ${c}`).join('\n')}`;
    }

    prompt += `

Available Tools:
${tools.map((t) => `
- ID: ${t.id}
  Name: ${t.name}
  Description: ${t.description}
  Best For: ${t.best_for.join(', ')}
  Category: ${t.category}
  Est. Latency: ${t.cost.latency_ms || 'unknown'}ms
  Input Schema: ${t.input_schema ? JSON.stringify(t.input_schema).slice(0, 200) : 'N/A'}
`).join('\n')}

Select up to ${context.max_tools || this.config.max_selections} tools that best match the task.
For each tool, provide:
1. relevance_score (0-1)
2. usage_hint (how to use for this task)
3. suggested_input (if applicable)

${this.config.enable_alternatives ? 'Also suggest alternative tools if available.' : ''}

Respond with JSON:
{
  "selected_tools": [
    {
      "tool_id": "tool_id",
      "relevance_score": 0.X,
      "usage_hint": "how to use",
      "suggested_input": {}
    }
  ],
  "reasoning": "why these tools were selected",
  "confidence": 0.X,
  "alternatives": [] // optional
}`;

    return prompt;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a tool selector with default settings
 */
export function createToolSelector(
  options: Partial<ToolSelectorConfig> = {}
): ToolSelector {
  return new ToolSelector({
    model: 'gpt-4o-mini',
    max_selections: 5,
    min_relevance_score: 0.5,
    enable_alternatives: true,
    ...options,
  });
}
