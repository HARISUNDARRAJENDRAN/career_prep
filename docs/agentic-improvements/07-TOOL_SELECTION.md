# Tool Selection

> **Document Version:** 1.0
> **Created:** January 5, 2026
> **Depends On:** 01-AGENTIC_ARCHITECTURE_OVERVIEW.md, 02-REASONING_LAYER_INTEGRATION.md
> **Purpose:** Dynamic tool selection based on goals and context

---

## Table of Contents

1. [Overview](#overview)
2. [Tool Registry](#tool-registry)
3. [Tool Selection Strategies](#tool-selection-strategies)
4. [Implementation](#implementation)
5. [Tool Execution](#tool-execution)
6. [Integration with Existing Code](#integration-with-existing-code)
7. [Adding New Tools](#adding-new-tools)

---

## Overview

### The Problem

Current agents have hard-coded tool usage:

```typescript
// Current: Fixed tool usage
export const interviewAnalyzer = task({
  run: async (payload) => {
    // Always uses the same tools in the same order
    const transcript = await transcriptParser.parse(payload);
    const analysis = await gpt4.analyze(transcript);
    const skills = await skillExtractor.extract(analysis);
    return { analysis, skills };
  }
});
```

**Issues:**
- No flexibility based on context
- Can't adapt to different interview types
- Can't use new tools without code changes
- No reasoning about WHICH tool is best

### The Solution

AI-based tool selection:

```
┌──────────────────────────────────────────────────────────────────────┐
│                     DYNAMIC TOOL SELECTION                           │
│                                                                      │
│   Goal: "Analyze interview transcript for technical skills"          │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    TOOL SELECTOR (AI)                        │   │
│   │                                                              │   │
│   │   Available Tools:                                           │   │
│   │   ┌────────────────┬────────────────┬────────────────┐      │   │
│   │   │ transcript_    │ gpt4_analyzer  │ skill_matcher  │      │   │
│   │   │ parser         │                │                │      │   │
│   │   │ (relevance:0.9)│ (relevance:0.8)│ (relevance:0.95)│     │   │
│   │   └────────────────┴────────────────┴────────────────┘      │   │
│   │                                                              │   │
│   │   Selected: [transcript_parser, skill_matcher, gpt4_analyzer]│   │
│   │   Reasoning: "Technical interview needs skill extraction     │   │
│   │              before general analysis"                        │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Tool Registry

### Tool Definition Schema

```typescript
interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  
  // Categorization
  category: ToolCategory;
  tags: string[];
  
  // Capabilities
  input_schema: JSONSchema;
  output_schema: JSONSchema;
  
  // Execution
  handler: (input: unknown) => Promise<unknown>;
  
  // Metadata for selection
  cost: {
    tokens?: number;       // Estimated token usage
    latency_ms?: number;   // Expected execution time
    api_calls?: number;    // External API calls
  };
  
  // Availability
  requires: string[];      // Required env vars or dependencies
  rate_limit?: {
    requests_per_minute: number;
  };
  
  // Usage guidance
  best_for: string[];      // Descriptions of ideal use cases
  not_suitable_for: string[]; // Anti-patterns
  examples: ToolExample[];
}

type ToolCategory = 
  | 'parsing'        // Data extraction
  | 'analysis'       // AI-powered analysis
  | 'search'         // Information retrieval
  | 'generation'     // Content generation
  | 'communication'  // Email, notifications
  | 'database'       // Data operations
  | 'external_api';  // Third-party services

interface ToolExample {
  goal: string;
  input: unknown;
  output: unknown;
}
```

### File: `src/lib/agents/tools/tool-registry.ts`

```typescript
/**
 * Tool Registry
 * 
 * Central catalog of all available tools for agents.
 * Tools are registered at startup and can be queried by capability.
 */

import { z } from 'zod';

// Types
type ToolCategory = 'parsing' | 'analysis' | 'search' | 'generation' | 'communication' | 'database' | 'external_api';

interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  tags: string[];
  input_schema: z.ZodSchema;
  output_schema: z.ZodSchema;
  handler: (input: unknown) => Promise<unknown>;
  cost: {
    tokens?: number;
    latency_ms?: number;
    api_calls?: number;
  };
  requires: string[];
  rate_limit?: { requests_per_minute: number };
  best_for: string[];
  not_suitable_for: string[];
}

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private categoryIndex: Map<ToolCategory, Set<string>> = new Map();

  /**
   * Register a tool
   */
  register(tool: ToolDefinition): void {
    // Validate required env vars
    for (const req of tool.requires) {
      if (!process.env[req]) {
        console.warn(`Tool ${tool.id} requires ${req} but it's not set`);
      }
    }

    this.tools.set(tool.id, tool);

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

    console.log(`Registered tool: ${tool.id}`);
  }

  /**
   * Get a tool by ID
   */
  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  /**
   * Get all tools
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolCategory): ToolDefinition[] {
    const ids = this.categoryIndex.get(category);
    if (!ids) return [];
    return Array.from(ids).map(id => this.tools.get(id)!);
  }

  /**
   * Get tools by tag
   */
  getByTag(tag: string): ToolDefinition[] {
    const ids = this.tagIndex.get(tag);
    if (!ids) return [];
    return Array.from(ids).map(id => this.tools.get(id)!);
  }

  /**
   * Search tools by capability description
   */
  searchByCapability(description: string): ToolDefinition[] {
    const descLower = description.toLowerCase();
    return this.getAll().filter(tool => {
      const searchText = [
        tool.name,
        tool.description,
        ...tool.tags,
        ...tool.best_for,
      ].join(' ').toLowerCase();
      return searchText.includes(descLower);
    });
  }

  /**
   * Get tool descriptions for AI selection
   */
  getToolDescriptions(): string {
    return this.getAll().map(tool => `
Tool: ${tool.id}
Name: ${tool.name}
Description: ${tool.description}
Best for: ${tool.best_for.join(', ')}
Not suitable for: ${tool.not_suitable_for.join(', ')}
Cost: ~${tool.cost.tokens || 0} tokens, ~${tool.cost.latency_ms || 0}ms
`).join('\n---\n');
  }

  /**
   * Check if a tool is available (dependencies met)
   */
  isAvailable(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    if (!tool) return false;
    return tool.requires.every(req => !!process.env[req]);
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();

// Helper to register tools
export function registerTool(tool: ToolDefinition): void {
  toolRegistry.register(tool);
}
```

### Registering Tools

```typescript
// src/lib/agents/tools/definitions/index.ts

import { registerTool } from '../tool-registry';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════
// PARSING TOOLS
// ═══════════════════════════════════════════════════════════════════

registerTool({
  id: 'transcript_parser',
  name: 'Interview Transcript Parser',
  description: 'Parses raw interview transcripts into structured format with speaker labels, timestamps, and segments.',
  category: 'parsing',
  tags: ['interview', 'transcript', 'parsing', 'text'],
  input_schema: z.object({
    raw_transcript: z.string(),
    format: z.enum(['plain', 'srt', 'vtt']).optional(),
  }),
  output_schema: z.object({
    segments: z.array(z.object({
      speaker: z.string(),
      text: z.string(),
      start_time: z.number().optional(),
      end_time: z.number().optional(),
    })),
    word_count: z.number(),
    duration_seconds: z.number().optional(),
  }),
  handler: async (input) => {
    const { parseTranscript } = await import('@/services/transcript-parser');
    return parseTranscript(input);
  },
  cost: { tokens: 0, latency_ms: 100, api_calls: 0 },
  requires: [],
  best_for: ['Converting raw transcripts to structured format', 'Identifying speakers', 'Segmenting conversation'],
  not_suitable_for: ['Actual analysis of content', 'Sentiment analysis'],
});

registerTool({
  id: 'resume_parser',
  name: 'Resume Parser',
  description: 'Extracts structured information from resume PDFs or text, including skills, experience, and education.',
  category: 'parsing',
  tags: ['resume', 'parsing', 'skills', 'experience'],
  input_schema: z.object({
    resume_content: z.string(),
    format: z.enum(['pdf', 'text', 'docx']),
  }),
  output_schema: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    skills: z.array(z.string()),
    experience: z.array(z.object({
      company: z.string(),
      title: z.string(),
      duration: z.string(),
      description: z.string(),
    })),
    education: z.array(z.object({
      institution: z.string(),
      degree: z.string(),
      year: z.string(),
    })),
  }),
  handler: async (input) => {
    const response = await fetch('http://localhost:8000/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return response.json();
  },
  cost: { tokens: 500, latency_ms: 2000, api_calls: 1 },
  requires: ['RESUME_PARSER_URL'],
  best_for: ['Extracting skills from resumes', 'Parsing work history', 'Identifying education'],
  not_suitable_for: ['Analyzing resume quality', 'Generating resume content'],
});

// ═══════════════════════════════════════════════════════════════════
// ANALYSIS TOOLS
// ═══════════════════════════════════════════════════════════════════

registerTool({
  id: 'gpt4_analyzer',
  name: 'GPT-4 General Analyzer',
  description: 'Uses GPT-4 for general-purpose analysis and reasoning tasks.',
  category: 'analysis',
  tags: ['ai', 'analysis', 'reasoning', 'general'],
  input_schema: z.object({
    prompt: z.string(),
    context: z.string().optional(),
    response_format: z.enum(['text', 'json']).optional(),
  }),
  output_schema: z.object({
    response: z.unknown(),
    tokens_used: z.number(),
  }),
  handler: async (input: any) => {
    const { openai } = await import('@/lib/openai');
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: input.context || 'You are a helpful assistant.' },
        { role: 'user', content: input.prompt },
      ],
      response_format: input.response_format === 'json' ? { type: 'json_object' } : undefined,
    });
    return {
      response: input.response_format === 'json' 
        ? JSON.parse(response.choices[0].message.content!)
        : response.choices[0].message.content,
      tokens_used: response.usage?.total_tokens || 0,
    };
  },
  cost: { tokens: 2000, latency_ms: 3000, api_calls: 1 },
  requires: ['OPENAI_API_KEY'],
  best_for: ['Complex reasoning', 'Open-ended analysis', 'Multi-step thinking'],
  not_suitable_for: ['Simple lookups', 'Structured data extraction', 'High-volume processing'],
});

registerTool({
  id: 'skill_analyzer',
  name: 'Skill Gap Analyzer',
  description: 'Analyzes skill gaps between current skills and target role requirements.',
  category: 'analysis',
  tags: ['skills', 'gap-analysis', 'career'],
  input_schema: z.object({
    current_skills: z.array(z.object({
      name: z.string(),
      level: z.number().min(1).max(5),
    })),
    target_role: z.string(),
    target_skills: z.array(z.object({
      name: z.string(),
      required_level: z.number().min(1).max(5),
    })).optional(),
  }),
  output_schema: z.object({
    gaps: z.array(z.object({
      skill: z.string(),
      current_level: z.number(),
      required_level: z.number(),
      priority: z.enum(['critical', 'high', 'medium', 'low']),
    })),
    ready_skills: z.array(z.string()),
    overall_readiness: z.number(),
  }),
  handler: async (input) => {
    const { analyzeSkillGaps } = await import('@/services/skill-analyzer');
    return analyzeSkillGaps(input);
  },
  cost: { tokens: 500, latency_ms: 1000, api_calls: 1 },
  requires: ['OPENAI_API_KEY'],
  best_for: ['Career planning', 'Learning prioritization', 'Role readiness assessment'],
  not_suitable_for: ['Skill extraction from text', 'Resume parsing'],
});

// ═══════════════════════════════════════════════════════════════════
// SEARCH TOOLS
// ═══════════════════════════════════════════════════════════════════

registerTool({
  id: 'rag_search',
  name: 'RAG Knowledge Search',
  description: 'Semantic search over embedded knowledge base using vector similarity.',
  category: 'search',
  tags: ['search', 'rag', 'embeddings', 'knowledge'],
  input_schema: z.object({
    query: z.string(),
    namespace: z.enum(['skills', 'jobs', 'market', 'general']).optional(),
    limit: z.number().default(5),
  }),
  output_schema: z.object({
    results: z.array(z.object({
      content: z.string(),
      similarity: z.number(),
      metadata: z.record(z.unknown()),
    })),
  }),
  handler: async (input: any) => {
    const { searchEmbeddings } = await import('@/lib/embeddings');
    return searchEmbeddings(input.query, input.namespace, input.limit);
  },
  cost: { tokens: 100, latency_ms: 200, api_calls: 1 },
  requires: ['OPENAI_API_KEY'],
  best_for: ['Finding relevant information', 'Semantic matching', 'Knowledge retrieval'],
  not_suitable_for: ['Exact string matching', 'Structured queries'],
});

registerTool({
  id: 'job_search',
  name: 'Job Listing Search',
  description: 'Searches job listings from multiple sources (Jooble, Adzuna, etc.).',
  category: 'external_api',
  tags: ['jobs', 'search', 'external'],
  input_schema: z.object({
    query: z.string(),
    location: z.string().optional(),
    remote: z.boolean().optional(),
    experience_level: z.enum(['entry', 'mid', 'senior']).optional(),
    limit: z.number().default(20),
  }),
  output_schema: z.object({
    jobs: z.array(z.object({
      title: z.string(),
      company: z.string(),
      location: z.string(),
      description: z.string(),
      url: z.string(),
      posted_date: z.string().optional(),
    })),
    total_found: z.number(),
  }),
  handler: async (input) => {
    const { searchJobs } = await import('@/services/job-scraper');
    return searchJobs(input);
  },
  cost: { tokens: 0, latency_ms: 2000, api_calls: 2 },
  requires: ['JOOBLE_API_KEY'],
  best_for: ['Finding job opportunities', 'Market research', 'Salary benchmarking'],
  not_suitable_for: ['Applying to jobs', 'Company research'],
});

// Export initialization function
export function initializeTools(): void {
  console.log('All tools registered');
}
```

---

## Tool Selection Strategies

### Strategy 1: AI-Based Selection

```typescript
// src/lib/agents/tools/tool-selector.ts

import { toolRegistry } from './tool-registry';
import { openai } from '@/lib/openai';

interface ToolSelectionResult {
  selected_tools: string[];
  reasoning: string;
  execution_order: string[];
  estimated_cost: {
    tokens: number;
    latency_ms: number;
    api_calls: number;
  };
}

export async function selectTools(
  goal: string,
  context: {
    available_inputs: Record<string, unknown>;
    constraints?: {
      max_tokens?: number;
      max_latency_ms?: number;
      required_tools?: string[];
      excluded_tools?: string[];
    };
  }
): Promise<ToolSelectionResult> {
  const availableTools = toolRegistry.getAll()
    .filter(t => toolRegistry.isAvailable(t.id))
    .filter(t => !context.constraints?.excluded_tools?.includes(t.id));

  const toolDescriptions = availableTools.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    best_for: t.best_for,
    cost: t.cost,
  }));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',  // Use cheaper model for selection
    messages: [
      {
        role: 'system',
        content: `You are a tool selection agent. Given a goal and available tools, select the best tools to accomplish the goal.

Rules:
1. Select only tools that are necessary
2. Consider tool costs (tokens, latency)
3. Provide execution order (dependencies)
4. Explain your reasoning

Available inputs: ${JSON.stringify(Object.keys(context.available_inputs))}

Respond in JSON format:
{
  "selected_tools": ["tool_id1", "tool_id2"],
  "reasoning": "Why these tools were selected",
  "execution_order": ["tool_id1", "tool_id2"],
  "notes": "Any additional notes"
}`
      },
      {
        role: 'user',
        content: `Goal: ${goal}

Available tools:
${JSON.stringify(toolDescriptions, null, 2)}

${context.constraints?.required_tools?.length 
  ? `Required tools (must include): ${context.constraints.required_tools.join(', ')}`
  : ''}
${context.constraints?.max_tokens 
  ? `Token budget: ${context.constraints.max_tokens}`
  : ''}
${context.constraints?.max_latency_ms 
  ? `Latency budget: ${context.constraints.max_latency_ms}ms`
  : ''}`
      }
    ],
    response_format: { type: 'json_object' },
  });

  const selection = JSON.parse(response.choices[0].message.content!);

  // Calculate estimated cost
  const estimated_cost = selection.selected_tools.reduce(
    (acc: any, toolId: string) => {
      const tool = toolRegistry.get(toolId);
      if (tool) {
        acc.tokens += tool.cost.tokens || 0;
        acc.latency_ms += tool.cost.latency_ms || 0;
        acc.api_calls += tool.cost.api_calls || 0;
      }
      return acc;
    },
    { tokens: 0, latency_ms: 0, api_calls: 0 }
  );

  return {
    selected_tools: selection.selected_tools,
    reasoning: selection.reasoning,
    execution_order: selection.execution_order,
    estimated_cost,
  };
}
```

### Strategy 2: Rule-Based Selection

```typescript
// For simpler cases, use rule-based selection

interface ToolSelectionRule {
  condition: (goal: string, context: Record<string, unknown>) => boolean;
  tools: string[];
  order: string[];
}

const SELECTION_RULES: ToolSelectionRule[] = [
  {
    condition: (goal) => goal.toLowerCase().includes('interview') && goal.toLowerCase().includes('transcript'),
    tools: ['transcript_parser', 'gpt4_analyzer', 'skill_analyzer'],
    order: ['transcript_parser', 'skill_analyzer', 'gpt4_analyzer'],
  },
  {
    condition: (goal) => goal.toLowerCase().includes('resume'),
    tools: ['resume_parser', 'skill_analyzer'],
    order: ['resume_parser', 'skill_analyzer'],
  },
  {
    condition: (goal) => goal.toLowerCase().includes('job') && goal.toLowerCase().includes('search'),
    tools: ['job_search', 'skill_analyzer'],
    order: ['job_search', 'skill_analyzer'],
  },
];

export function selectToolsByRules(
  goal: string,
  context: Record<string, unknown>
): { tools: string[]; order: string[] } | null {
  for (const rule of SELECTION_RULES) {
    if (rule.condition(goal, context)) {
      return { tools: rule.tools, order: rule.order };
    }
  }
  return null;  // No matching rule, use AI selection
}
```

### Strategy 3: Hybrid Selection

```typescript
// Try rules first, fall back to AI

export async function selectToolsHybrid(
  goal: string,
  context: {
    available_inputs: Record<string, unknown>;
    constraints?: {
      max_tokens?: number;
      max_latency_ms?: number;
      required_tools?: string[];
      excluded_tools?: string[];
    };
  }
): Promise<ToolSelectionResult> {
  // Try rule-based first
  const ruleResult = selectToolsByRules(goal, context.available_inputs);
  
  if (ruleResult) {
    const estimated_cost = ruleResult.tools.reduce(
      (acc, toolId) => {
        const tool = toolRegistry.get(toolId);
        if (tool) {
          acc.tokens += tool.cost.tokens || 0;
          acc.latency_ms += tool.cost.latency_ms || 0;
          acc.api_calls += tool.cost.api_calls || 0;
        }
        return acc;
      },
      { tokens: 0, latency_ms: 0, api_calls: 0 }
    );

    return {
      selected_tools: ruleResult.tools,
      reasoning: 'Selected by rule-based matching',
      execution_order: ruleResult.order,
      estimated_cost,
    };
  }

  // Fall back to AI selection
  return selectTools(goal, context);
}
```

---

## Tool Execution

### File: `src/lib/agents/tools/tool-executor.ts`

```typescript
/**
 * Tool Executor
 * 
 * Safely executes selected tools with:
 * - Input validation
 * - Rate limiting
 * - Error handling
 * - Output validation
 * - Execution logging
 */

import { toolRegistry } from './tool-registry';
import { db } from '@/drizzle/db';
import { toolExecutions } from '@/drizzle/schema';

interface ExecutionContext {
  agent_name: string;
  task_id: string;
  user_id?: string;
}

interface ExecutionResult {
  tool_id: string;
  success: boolean;
  output?: unknown;
  error?: string;
  execution_time_ms: number;
  tokens_used?: number;
}

// Rate limiter
const rateLimiters: Map<string, { count: number; reset_at: Date }> = new Map();

function checkRateLimit(toolId: string): boolean {
  const tool = toolRegistry.get(toolId);
  if (!tool?.rate_limit) return true;

  const limiter = rateLimiters.get(toolId);
  const now = new Date();

  if (!limiter || limiter.reset_at < now) {
    rateLimiters.set(toolId, {
      count: 1,
      reset_at: new Date(now.getTime() + 60000), // 1 minute window
    });
    return true;
  }

  if (limiter.count >= tool.rate_limit.requests_per_minute) {
    return false;
  }

  limiter.count++;
  return true;
}

export class ToolExecutor {
  private context: ExecutionContext;

  constructor(context: ExecutionContext) {
    this.context = context;
  }

  /**
   * Execute a single tool
   */
  async execute(toolId: string, input: unknown): Promise<ExecutionResult> {
    const tool = toolRegistry.get(toolId);
    
    if (!tool) {
      return {
        tool_id: toolId,
        success: false,
        error: `Tool not found: ${toolId}`,
        execution_time_ms: 0,
      };
    }

    if (!toolRegistry.isAvailable(toolId)) {
      return {
        tool_id: toolId,
        success: false,
        error: `Tool unavailable: missing dependencies`,
        execution_time_ms: 0,
      };
    }

    if (!checkRateLimit(toolId)) {
      return {
        tool_id: toolId,
        success: false,
        error: `Rate limit exceeded for tool: ${toolId}`,
        execution_time_ms: 0,
      };
    }

    // Validate input
    const inputValidation = tool.input_schema.safeParse(input);
    if (!inputValidation.success) {
      return {
        tool_id: toolId,
        success: false,
        error: `Invalid input: ${inputValidation.error.message}`,
        execution_time_ms: 0,
      };
    }

    const start = Date.now();
    
    try {
      // Execute tool
      const output = await tool.handler(inputValidation.data);
      const execution_time_ms = Date.now() - start;

      // Validate output
      const outputValidation = tool.output_schema.safeParse(output);
      if (!outputValidation.success) {
        console.warn(`Tool ${toolId} output validation failed:`, outputValidation.error);
        // Still return output, just log warning
      }

      // Log execution
      await this.logExecution(toolId, true, execution_time_ms, input, output);

      return {
        tool_id: toolId,
        success: true,
        output,
        execution_time_ms,
        tokens_used: (output as any)?.tokens_used,
      };

    } catch (error) {
      const execution_time_ms = Date.now() - start;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log failed execution
      await this.logExecution(toolId, false, execution_time_ms, input, undefined, errorMessage);

      return {
        tool_id: toolId,
        success: false,
        error: errorMessage,
        execution_time_ms,
      };
    }
  }

  /**
   * Execute multiple tools in order
   */
  async executeSequence(
    tools: Array<{ tool_id: string; input: unknown | ((prev: unknown) => unknown) }>
  ): Promise<{
    success: boolean;
    results: ExecutionResult[];
    final_output: unknown;
  }> {
    const results: ExecutionResult[] = [];
    let previousOutput: unknown = undefined;

    for (const { tool_id, input } of tools) {
      // Resolve input (may depend on previous output)
      const resolvedInput = typeof input === 'function' ? input(previousOutput) : input;

      const result = await this.execute(tool_id, resolvedInput);
      results.push(result);

      if (!result.success) {
        return {
          success: false,
          results,
          final_output: undefined,
        };
      }

      previousOutput = result.output;
    }

    return {
      success: true,
      results,
      final_output: previousOutput,
    };
  }

  /**
   * Execute tools in parallel (no dependencies between them)
   */
  async executeParallel(
    tools: Array<{ tool_id: string; input: unknown }>
  ): Promise<{
    success: boolean;
    results: ExecutionResult[];
  }> {
    const results = await Promise.all(
      tools.map(({ tool_id, input }) => this.execute(tool_id, input))
    );

    return {
      success: results.every(r => r.success),
      results,
    };
  }

  /**
   * Log tool execution for analytics
   */
  private async logExecution(
    toolId: string,
    success: boolean,
    execution_time_ms: number,
    input: unknown,
    output?: unknown,
    error?: string
  ): Promise<void> {
    try {
      await db.insert(toolExecutions).values({
        id: crypto.randomUUID(),
        tool_id: toolId,
        agent_name: this.context.agent_name,
        task_id: this.context.task_id,
        user_id: this.context.user_id,
        success,
        execution_time_ms,
        input_summary: JSON.stringify(input).slice(0, 500),
        output_summary: output ? JSON.stringify(output).slice(0, 500) : undefined,
        error,
        created_at: new Date(),
      });
    } catch (e) {
      console.error('Failed to log tool execution:', e);
    }
  }
}

// Factory function
export function createToolExecutor(context: ExecutionContext): ToolExecutor {
  return new ToolExecutor(context);
}
```

---

## Integration with Existing Code

### Using Tool Selection in Agents

```typescript
// src/trigger/jobs/interview-analyzer.ts

import { selectToolsHybrid } from '@/lib/agents/tools/tool-selector';
import { createToolExecutor } from '@/lib/agents/tools/tool-executor';

export const interviewAnalyzer = task({
  id: 'interview.analyze',
  run: async (payload: { interview_id: string; user_id: string; transcript: string }) => {
    const { interview_id, user_id, transcript } = payload;

    // Select tools based on goal
    const toolSelection = await selectToolsHybrid(
      'Analyze interview transcript for skills, performance, and improvement areas',
      {
        available_inputs: { transcript, user_id },
        constraints: {
          max_tokens: 5000,
          max_latency_ms: 30000,
        },
      }
    );

    console.log(`Selected tools: ${toolSelection.selected_tools.join(', ')}`);
    console.log(`Reasoning: ${toolSelection.reasoning}`);

    // Create executor
    const executor = createToolExecutor({
      agent_name: 'interviewer',
      task_id: interview_id,
      user_id,
    });

    // Build execution sequence with data flow
    const executionPlan = toolSelection.execution_order.map((toolId, index) => {
      if (toolId === 'transcript_parser') {
        return { tool_id: toolId, input: { raw_transcript: transcript } };
      }
      if (toolId === 'skill_analyzer') {
        return {
          tool_id: toolId,
          input: (prev: any) => ({
            current_skills: prev?.segments || [],
            target_role: 'software_engineer',
          }),
        };
      }
      if (toolId === 'gpt4_analyzer') {
        return {
          tool_id: toolId,
          input: (prev: any) => ({
            prompt: `Analyze this interview: ${transcript}`,
            context: 'You are an interview coach.',
            response_format: 'json',
          }),
        };
      }
      return { tool_id: toolId, input: {} };
    });

    // Execute
    const result = await executor.executeSequence(executionPlan);

    return {
      success: result.success,
      analysis: result.final_output,
      tools_used: toolSelection.selected_tools,
      execution_stats: result.results.map(r => ({
        tool: r.tool_id,
        time_ms: r.execution_time_ms,
        tokens: r.tokens_used,
      })),
    };
  },
});
```

---

## Adding New Tools

### Step-by-Step Guide

```typescript
// 1. Create tool definition file
// src/lib/agents/tools/definitions/my-new-tool.ts

import { registerTool } from '../tool-registry';
import { z } from 'zod';

registerTool({
  id: 'my_new_tool',
  name: 'My New Tool',
  description: 'What this tool does',
  category: 'analysis',
  tags: ['my-tag', 'another-tag'],
  
  input_schema: z.object({
    required_field: z.string(),
    optional_field: z.number().optional(),
  }),
  
  output_schema: z.object({
    result: z.string(),
    confidence: z.number(),
  }),
  
  handler: async (input: any) => {
    // Implement tool logic
    const result = await doSomething(input.required_field);
    return { result, confidence: 0.9 };
  },
  
  cost: { tokens: 100, latency_ms: 500, api_calls: 1 },
  requires: ['MY_API_KEY'],  // Environment variables needed
  
  best_for: ['Use case 1', 'Use case 2'],
  not_suitable_for: ['Anti-pattern 1'],
});

// 2. Import in tools index
// src/lib/agents/tools/definitions/index.ts
import './my-new-tool';

// 3. Tool is now available for selection!
```

---

## Database Schema for Tool Execution Logs

```typescript
// src/drizzle/schema/tool-executions.ts

export const toolExecutions = pgTable('tool_executions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tool_id: varchar('tool_id', { length: 100 }).notNull(),
  agent_name: varchar('agent_name', { length: 50 }).notNull(),
  task_id: varchar('task_id', { length: 100 }),
  user_id: varchar('user_id', { length: 255 }),
  success: boolean('success').notNull(),
  execution_time_ms: integer('execution_time_ms').notNull(),
  input_summary: text('input_summary'),
  output_summary: text('output_summary'),
  error: text('error'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_tool_exec_tool').on(table.tool_id),
  index('idx_tool_exec_agent').on(table.agent_name),
  index('idx_tool_exec_date').on(table.created_at),
]);
```

---

## Next Document

Continue to **08-PILOT_INTERVIEW_AGENT.md** for the first autonomous agent implementation.

---

**Document Status:** Draft
**Dependencies:** 01, 02
**Next:** 08-PILOT_INTERVIEW_AGENT.md
