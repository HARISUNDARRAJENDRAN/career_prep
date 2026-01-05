/**
 * Goal Decomposer
 *
 * Breaks high-level goals into actionable sub-goals.
 * Uses AI to understand the goal and create a hierarchical breakdown.
 *
 * @see docs/agentic-improvements/02-REASONING_LAYER_INTEGRATION.md
 */

import OpenAI from 'openai';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

/**
 * A goal to be achieved by an agent
 */
export interface Goal {
  id: string;
  description: string;
  success_criteria: string[];
  priority: 'high' | 'medium' | 'low';
}

/**
 * A sub-goal derived from decomposing a parent goal
 */
export interface SubGoal extends Goal {
  parent_id: string;
  dependencies: string[]; // IDs of sub-goals that must complete first
  estimated_steps: number;
}

/**
 * Configuration for the goal decomposer
 */
export interface GoalDecomposerConfig {
  model: 'gpt-4o-mini' | 'gpt-4o';
  max_depth: number;
  max_sub_goals: number;
  agent_context?: string; // Description of what this agent does
}

/**
 * Context provided to help decomposition
 */
export interface DecompositionContext {
  user_id?: string;
  available_tools?: string[];
  constraints?: string[];
  past_learnings?: string[];
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

const SubGoalSchema = z.object({
  description: z.string(),
  success_criteria: z.array(z.string()),
  priority: z.enum(['high', 'medium', 'low']),
  dependencies: z.array(z.string()), // References other sub-goal descriptions
  estimated_steps: z.number(),
});

const DecompositionResponseSchema = z.object({
  sub_goals: z.array(SubGoalSchema),
  reasoning: z.string(),
  can_be_further_decomposed: z.boolean(),
});

// ============================================================================
// Goal Decomposer Class
// ============================================================================

/**
 * GoalDecomposer breaks complex goals into manageable sub-goals
 */
export class GoalDecomposer {
  private openai: OpenAI;
  private config: GoalDecomposerConfig;

  constructor(config: GoalDecomposerConfig) {
    this.config = config;
    this.openai = new OpenAI();
  }

  /**
   * Decompose a goal into sub-goals
   */
  async decompose(
    goal: Goal,
    context: DecompositionContext = {}
  ): Promise<SubGoal[]> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(goal, context);

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent decomposition
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    const parsed = JSON.parse(content);
    const validated = DecompositionResponseSchema.parse(parsed);

    // Convert to SubGoal format with IDs
    const subGoals: SubGoal[] = validated.sub_goals.map((sg, index) => ({
      id: `${goal.id}-${index + 1}`,
      parent_id: goal.id,
      description: sg.description,
      success_criteria: sg.success_criteria,
      priority: sg.priority,
      dependencies: [], // Will be resolved below
      estimated_steps: sg.estimated_steps,
    }));

    // Resolve dependencies (match descriptions to IDs)
    for (let i = 0; i < subGoals.length; i++) {
      const originalDeps = validated.sub_goals[i].dependencies;
      subGoals[i].dependencies = this.resolveDependencies(
        originalDeps,
        subGoals
      );
    }

    return subGoals;
  }

  /**
   * Recursively decompose to a specified depth
   */
  async decomposeRecursive(
    goal: Goal,
    context: DecompositionContext = {},
    currentDepth = 0
  ): Promise<SubGoal[]> {
    if (currentDepth >= this.config.max_depth) {
      return [];
    }

    const subGoals = await this.decompose(goal, context);
    const allSubGoals: SubGoal[] = [...subGoals];

    // Recursively decompose high-complexity sub-goals
    for (const subGoal of subGoals) {
      if (subGoal.estimated_steps > 3 && currentDepth < this.config.max_depth - 1) {
        const nestedGoal: Goal = {
          id: subGoal.id,
          description: subGoal.description,
          success_criteria: subGoal.success_criteria,
          priority: subGoal.priority,
        };

        const nestedSubGoals = await this.decomposeRecursive(
          nestedGoal,
          context,
          currentDepth + 1
        );

        allSubGoals.push(...nestedSubGoals);
      }
    }

    return allSubGoals;
  }

  /**
   * Validate a decomposition for completeness
   */
  async validateDecomposition(
    originalGoal: Goal,
    subGoals: SubGoal[]
  ): Promise<{
    valid: boolean;
    issues: string[];
    coverage_score: number;
  }> {
    const prompt = `
You are validating whether a set of sub-goals adequately covers an original goal.

Original Goal: ${originalGoal.description}

Success Criteria:
${originalGoal.success_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Sub-Goals:
${subGoals.map((sg, i) => `${i + 1}. ${sg.description}`).join('\n')}

Evaluate:
1. Do the sub-goals fully cover all success criteria?
2. Are there any gaps or missing components?
3. Is there unnecessary overlap?

Respond in JSON format:
{
  "valid": boolean,
  "issues": ["issue1", "issue2"],
  "coverage_score": 0.0-1.0,
  "reasoning": "explanation"
}
`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use cheaper model for validation
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { valid: false, issues: ['Failed to validate'], coverage_score: 0 };
    }

    const result = JSON.parse(content);
    return {
      valid: result.valid,
      issues: result.issues || [],
      coverage_score: result.coverage_score || 0,
    };
  }

  /**
   * Prioritize sub-goals based on dependencies and impact
   */
  prioritize(subGoals: SubGoal[]): SubGoal[] {
    // Topological sort + priority weighting
    const sorted: SubGoal[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (goal: SubGoal): void => {
      if (visited.has(goal.id)) return;
      if (visiting.has(goal.id)) {
        // Circular dependency - skip
        console.warn(`Circular dependency detected for goal: ${goal.id}`);
        return;
      }

      visiting.add(goal.id);

      // Visit dependencies first
      for (const depId of goal.dependencies) {
        const dep = subGoals.find((g) => g.id === depId);
        if (dep) visit(dep);
      }

      visiting.delete(goal.id);
      visited.add(goal.id);
      sorted.push(goal);
    };

    // Visit all goals
    for (const goal of subGoals) {
      visit(goal);
    }

    // Within each dependency level, sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return sorted.sort((a, b) => {
      // First by whether dependencies are met (already handled by topological sort)
      // Then by priority
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private buildSystemPrompt(): string {
    return `You are an expert goal decomposition agent. Your task is to break down complex goals into smaller, actionable sub-goals.

${this.config.agent_context ? `Context: ${this.config.agent_context}` : ''}

Guidelines for decomposition:
1. Each sub-goal should be SMART: Specific, Measurable, Achievable, Relevant, Time-bound
2. Sub-goals should be independent where possible
3. Identify clear dependencies between sub-goals
4. Estimate the number of steps/actions needed for each sub-goal
5. Assign appropriate priority based on urgency and impact

Always respond in valid JSON format matching the specified schema.`;
  }

  private buildUserPrompt(goal: Goal, context: DecompositionContext): string {
    let prompt = `Decompose the following goal into sub-goals:

Goal: ${goal.description}

Success Criteria:
${goal.success_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Priority: ${goal.priority}
`;

    if (context.available_tools?.length) {
      prompt += `\nAvailable Tools: ${context.available_tools.join(', ')}`;
    }

    if (context.constraints?.length) {
      prompt += `\nConstraints:\n${context.constraints.map((c) => `- ${c}`).join('\n')}`;
    }

    if (context.past_learnings?.length) {
      prompt += `\nRelevant Learnings:\n${context.past_learnings.map((l) => `- ${l}`).join('\n')}`;
    }

    prompt += `

Respond with a JSON object containing:
{
  "sub_goals": [
    {
      "description": "Clear description of sub-goal",
      "success_criteria": ["criterion 1", "criterion 2"],
      "priority": "high" | "medium" | "low",
      "dependencies": ["description of dependent sub-goal if any"],
      "estimated_steps": number
    }
  ],
  "reasoning": "Brief explanation of your decomposition strategy",
  "can_be_further_decomposed": boolean
}

Limit to ${this.config.max_sub_goals} sub-goals maximum.`;

    return prompt;
  }

  private resolveDependencies(
    depDescriptions: string[],
    subGoals: SubGoal[]
  ): string[] {
    const resolvedIds: string[] = [];

    for (const desc of depDescriptions) {
      // Find the sub-goal that best matches this description
      const match = subGoals.find(
        (sg) =>
          sg.description.toLowerCase().includes(desc.toLowerCase()) ||
          desc.toLowerCase().includes(sg.description.toLowerCase())
      );

      if (match) {
        resolvedIds.push(match.id);
      }
    }

    return resolvedIds;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a goal decomposer with default settings
 */
export function createGoalDecomposer(
  options: Partial<GoalDecomposerConfig> = {}
): GoalDecomposer {
  return new GoalDecomposer({
    model: 'gpt-4o-mini',
    max_depth: 2,
    max_sub_goals: 5,
    ...options,
  });
}

/**
 * Create a root goal from a description
 */
export function createGoal(
  description: string,
  options: Partial<Omit<Goal, 'id' | 'description'>> = {}
): Goal {
  return {
    id: crypto.randomUUID(),
    description,
    success_criteria: options.success_criteria || [description],
    priority: options.priority || 'medium',
  };
}
