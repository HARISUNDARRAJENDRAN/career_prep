/**
 * Plan Generator
 *
 * Creates executable plans from goals using available tools.
 * Uses AI to select appropriate tools and order steps.
 *
 * @see docs/agentic-improvements/02-REASONING_LAYER_INTEGRATION.md
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { toolRegistry } from '../tools/tool-registry';
import type { Goal, SubGoal } from './goal-decomposer';

// ============================================================================
// Types
// ============================================================================

/**
 * A single step in a plan
 */
export interface PlanStep {
  step_id: string;
  action: string;
  tool_id: string;
  tool_input: Record<string, unknown>;
  expected_output: string;
  fallback_tool_id?: string;
}

/**
 * A complete plan for achieving a goal
 */
export interface Plan {
  id: string;
  goal_id: string;
  steps: PlanStep[];
  estimated_duration_ms: number;
  confidence_threshold: number;
  max_iterations: number;
  created_at: Date;
  metadata: {
    reasoning: string;
    tools_considered: string[];
    risk_assessment?: string;
  };
}

/**
 * Feedback from execution for plan adaptation
 */
export interface ExecutionFeedback {
  step_id: string;
  success: boolean;
  output?: unknown;
  error?: string;
  confidence?: number;
  duration_ms?: number;
}

/**
 * Configuration for the plan generator
 */
export interface PlanGeneratorConfig {
  model: 'gpt-4o-mini' | 'gpt-4o';
  max_steps: number;
  default_confidence_threshold: number;
  default_max_iterations: number;
}

/**
 * Context for plan generation
 */
export interface PlanContext {
  user_id?: string;
  working_memory?: Record<string, unknown>;
  past_plans?: string[]; // Summaries of past plans for this goal type
  constraints?: string[];
}

// ============================================================================
// Zod Schemas
// ============================================================================

const PlanStepSchema = z.object({
  action: z.string(),
  tool_id: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
  expected_output: z.string(),
  fallback_tool_id: z.string().nullish(), // Allow null, undefined, or string
});

const PlanResponseSchema = z.object({
  steps: z.array(PlanStepSchema),
  reasoning: z.string(),
  estimated_duration_ms: z.number(),
  risk_assessment: z.string().nullish(), // Allow null, undefined, or string
});

// ============================================================================
// Plan Generator Class
// ============================================================================

/**
 * PlanGenerator creates executable plans from goals
 */
export class PlanGenerator {
  private openai: OpenAI;
  private config: PlanGeneratorConfig;

  constructor(config: PlanGeneratorConfig) {
    this.config = config;
    this.openai = new OpenAI();
  }

  /**
   * Generate a plan to achieve a goal
   */
  async generate(
    goal: Goal | SubGoal,
    context: PlanContext = {}
  ): Promise<Plan> {
    // Get available tools
    const availableTools = toolRegistry.exportForAI();

    if (availableTools.length === 0) {
      throw new Error('No tools available in registry');
    }

    const systemPrompt = this.buildSystemPrompt(availableTools);
    const userPrompt = this.buildUserPrompt(goal, context);

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    try {
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }, { signal: controller.signal });

      clearTimeout(timeoutId);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from AI');
      }

      const parsed = JSON.parse(content);
      const validated = PlanResponseSchema.parse(parsed);

      // Convert to Plan format
      const plan: Plan = {
        id: crypto.randomUUID(),
        goal_id: goal.id,
        steps: validated.steps.map((step, index) => ({
          step_id: `step-${index + 1}`,
          action: step.action,
          tool_id: step.tool_id,
          tool_input: step.tool_input,
          expected_output: step.expected_output,
          fallback_tool_id: step.fallback_tool_id ?? undefined, // Convert null to undefined
        })),
        estimated_duration_ms: validated.estimated_duration_ms,
        confidence_threshold: this.config.default_confidence_threshold,
        max_iterations: this.config.default_max_iterations,
        created_at: new Date(),
        metadata: {
          reasoning: validated.reasoning,
          tools_considered: availableTools.map((t) => t.id),
          risk_assessment: validated.risk_assessment ?? undefined, // Convert null to undefined
        },
      };

      return plan;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Plan generation timed out after 60 seconds');
      }
      throw error;
    }
  }

  /**
   * Validate a plan for executability
   */
  async validate(plan: Plan): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check all tools exist
    for (const step of plan.steps) {
      const tool = toolRegistry.get(step.tool_id);
      if (!tool) {
        issues.push(`Tool ${step.tool_id} not found in registry`);
      } else if (!tool.enabled) {
        issues.push(`Tool ${step.tool_id} is disabled`);
      }

      if (step.fallback_tool_id) {
        const fallback = toolRegistry.get(step.fallback_tool_id);
        if (!fallback) {
          issues.push(`Fallback tool ${step.fallback_tool_id} not found`);
        }
      }
    }

    // Check for circular dependencies (not applicable for linear plans)
    // Could be extended for DAG-based plans

    // Check step count
    if (plan.steps.length > this.config.max_steps) {
      issues.push(
        `Plan has ${plan.steps.length} steps, exceeding maximum of ${this.config.max_steps}`
      );
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Adapt a plan based on execution feedback
   */
  async adapt(
    plan: Plan,
    feedback: ExecutionFeedback[]
  ): Promise<Plan> {
    // Get the original goal (we'll reconstruct it for the prompt)
    const failedSteps = feedback.filter((f) => !f.success);
    const successfulSteps = feedback.filter((f) => f.success);

    if (failedSteps.length === 0) {
      // No failures, might need to improve quality
      return this.improveQuality(plan, feedback);
    }

    // Get available tools again
    const availableTools = toolRegistry.exportForAI();

    const prompt = `You are adapting a plan that encountered issues during execution.

Original Plan Goal: ${plan.metadata.reasoning}

Steps that succeeded:
${successfulSteps.map((s) => {
  const step = plan.steps.find((ps) => ps.step_id === s.step_id);
  return `- ${step?.action}: ${s.output ? 'Output received' : 'Completed'}`;
}).join('\n') || 'None'}

Steps that failed:
${failedSteps.map((s) => {
  const step = plan.steps.find((ps) => ps.step_id === s.step_id);
  return `- ${step?.action}: ${s.error || 'Unknown error'}`;
}).join('\n')}

Available Tools:
${availableTools.map((t) => `- ${t.id}: ${t.description}`).join('\n')}

Create an adapted plan that:
1. Builds on successful steps
2. Replaces or modifies failed steps
3. Addresses the root cause of failures

Respond with JSON:
{
  "steps": [...],
  "reasoning": "explanation of adaptations",
  "estimated_duration_ms": number
}`;

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4, // Slightly higher for creative adaptation
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    const validated = PlanResponseSchema.parse(JSON.parse(content));

    // Create adapted plan
    const adaptedPlan: Plan = {
      id: crypto.randomUUID(),
      goal_id: plan.goal_id,
      steps: validated.steps.map((step, index) => ({
        step_id: `step-${index + 1}`,
        action: step.action,
        tool_id: step.tool_id,
        tool_input: step.tool_input,
        expected_output: step.expected_output,
        fallback_tool_id: step.fallback_tool_id ?? undefined, // Convert null to undefined
      })),
      estimated_duration_ms: validated.estimated_duration_ms,
      confidence_threshold: plan.confidence_threshold,
      max_iterations: plan.max_iterations,
      created_at: new Date(),
      metadata: {
        reasoning: `Adapted from plan ${plan.id}: ${validated.reasoning}`,
        tools_considered: availableTools.map((t) => t.id),
        risk_assessment: validated.risk_assessment ?? undefined, // Convert null to undefined
      },
    };

    return adaptedPlan;
  }

  /**
   * Merge multiple plans for parallel sub-goals
   */
  async merge(plans: Plan[]): Promise<Plan> {
    if (plans.length === 0) {
      throw new Error('Cannot merge empty plans array');
    }

    if (plans.length === 1) {
      return plans[0];
    }

    // Combine all steps, maintaining order within each plan
    const allSteps: PlanStep[] = [];
    for (const plan of plans) {
      for (const step of plan.steps) {
        allSteps.push({
          ...step,
          step_id: `${plan.id}-${step.step_id}`,
        });
      }
    }

    // Total estimated duration (assuming some parallelization)
    const totalDuration = plans.reduce(
      (sum, p) => sum + p.estimated_duration_ms,
      0
    );

    return {
      id: crypto.randomUUID(),
      goal_id: plans[0].goal_id, // Assume same parent goal
      steps: allSteps,
      estimated_duration_ms: totalDuration * 0.7, // Assume 30% parallelization
      confidence_threshold: Math.min(...plans.map((p) => p.confidence_threshold)),
      max_iterations: Math.max(...plans.map((p) => p.max_iterations)),
      created_at: new Date(),
      metadata: {
        reasoning: `Merged from ${plans.length} plans`,
        tools_considered: [...new Set(plans.flatMap((p) => p.metadata.tools_considered))],
      },
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private buildSystemPrompt(
    tools: Array<{
      id: string;
      name: string;
      description: string;
      best_for: string[];
      cost: { tokens?: number; latency_ms?: number };
    }>
  ): string {
    return `You are an expert plan generator for autonomous agents. Your task is to create executable plans using available tools.

Available Tools:
${tools.map((t) => `
- ID: ${t.id}
  Name: ${t.name}
  Description: ${t.description}
  Best For: ${t.best_for.join(', ')}
  Est. Latency: ${t.cost.latency_ms || 'unknown'}ms
`).join('\n')}

Guidelines for plan generation:
1. Select the most appropriate tool for each action
2. Order steps logically, respecting dependencies
3. Include fallback tools for critical steps when available
4. Estimate realistic duration based on tool latencies
5. Keep plans concise - each step should be necessary

Always respond in valid JSON format.`;
  }

  private buildUserPrompt(
    goal: Goal | SubGoal,
    context: PlanContext
  ): string {
    let prompt = `Create a plan to achieve this goal:

Goal: ${goal.description}

Success Criteria:
${goal.success_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Priority: ${goal.priority}
`;

    if (context.working_memory && Object.keys(context.working_memory).length > 0) {
      prompt += `\nCurrent Context:\n${JSON.stringify(context.working_memory, null, 2)}`;
    }

    if (context.constraints?.length) {
      prompt += `\nConstraints:\n${context.constraints.map((c) => `- ${c}`).join('\n')}`;
    }

    if (context.past_plans?.length) {
      prompt += `\nLearnings from past plans:\n${context.past_plans.map((p) => `- ${p}`).join('\n')}`;
    }

    prompt += `

Create a plan with ${this.config.max_steps} steps maximum.

Respond with JSON:
{
  "steps": [
    {
      "action": "Description of what this step does",
      "tool_id": "id of the tool to use",
      "tool_input": { "param": "value" },
      "expected_output": "What output to expect",
      "fallback_tool_id": "optional alternative tool"
    }
  ],
  "reasoning": "Why this plan will achieve the goal",
  "estimated_duration_ms": total_duration,
  "risk_assessment": "Potential issues and mitigations"
}`;

    return prompt;
  }

  private async improveQuality(
    plan: Plan,
    feedback: ExecutionFeedback[]
  ): Promise<Plan> {
    // If all steps succeeded but confidence is low, we need to enhance the plan
    const avgConfidence =
      feedback.reduce((sum, f) => sum + (f.confidence || 0), 0) / feedback.length;

    if (avgConfidence >= plan.confidence_threshold) {
      // Plan is good enough, return as-is
      return plan;
    }

    // Add refinement steps
    const availableTools = toolRegistry.exportForAI();

    const prompt = `The following plan executed successfully but confidence (${avgConfidence.toFixed(2)}) is below threshold (${plan.confidence_threshold}).

Current steps:
${plan.steps.map((s, i) => `${i + 1}. ${s.action} (using ${s.tool_id})`).join('\n')}

Suggest additional steps or modifications to improve output quality.

Available tools:
${availableTools.map((t) => `- ${t.id}: ${t.description}`).join('\n')}

Respond with an improved plan in JSON format.`;

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return plan; // Return original if improvement fails
    }

    try {
      const validated = PlanResponseSchema.parse(JSON.parse(content));

      return {
        ...plan,
        id: crypto.randomUUID(),
        steps: validated.steps.map((step, index) => ({
          step_id: `step-${index + 1}`,
          action: step.action,
          tool_id: step.tool_id,
          tool_input: step.tool_input,
          expected_output: step.expected_output,
          fallback_tool_id: step.fallback_tool_id ?? undefined, // Convert null to undefined
        })),
        metadata: {
          ...plan.metadata,
          reasoning: `Quality improvement of plan ${plan.id}: ${validated.reasoning}`,
        },
      };
    } catch {
      return plan;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a plan generator with default settings
 */
export function createPlanGenerator(
  options: Partial<PlanGeneratorConfig> = {}
): PlanGenerator {
  return new PlanGenerator({
    model: 'gpt-4o-mini',
    max_steps: 10,
    default_confidence_threshold: 0.85,
    default_max_iterations: 3,
    ...options,
  });
}
