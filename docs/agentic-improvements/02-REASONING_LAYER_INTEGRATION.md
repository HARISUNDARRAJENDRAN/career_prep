# Reasoning Layer Integration

> **Document Version:** 1.0
> **Created:** January 5, 2026
> **Depends On:** 01-AGENTIC_ARCHITECTURE_OVERVIEW.md
> **Purpose:** Detailed plan for adding planning/reasoning capabilities to agents

---

## Table of Contents

1. [Overview](#overview)
2. [Current State vs Target State](#current-state-vs-target-state)
3. [Components to Build](#components-to-build)
4. [Implementation Details](#implementation-details)
5. [Integration with Existing Code](#integration-with-existing-code)
6. [Example: Interview Preparation Reasoning](#example-interview-preparation-reasoning)
7. [API Reference](#api-reference)

---

## Overview

### What is the Reasoning Layer?

The Reasoning Layer is a meta-cognitive component that sits **above** our current agents. Before an agent executes any task, the Reasoning Layer:

1. **Analyzes** the current context and goals
2. **Plans** a sequence of steps to achieve the goal
3. **Evaluates** whether the plan is likely to succeed
4. **Monitors** execution and adjusts as needed

### Why Do We Need This?

| Without Reasoning | With Reasoning |
|-------------------|----------------|
| Agent receives "analyze interview" event | Agent asks: "What should I analyze? What's the goal?" |
| Executes hard-coded analysis steps | Generates custom plan based on user's skill gaps |
| Returns whatever result it produces | Evaluates if result is good enough, iterates if not |
| No consideration of context | Uses memory to inform decisions |

---

## Current State vs Target State

### Current Implementation

```typescript
// src/trigger/jobs/interview-analyzer.ts (CURRENT)

export const interviewAnalyzer = task({
  id: 'interview.analyze',
  run: async (payload: InterviewAnalyzerPayload) => {
    // ❌ No reasoning - just execute predefined steps
    
    // Step 1: Fetch transcript (always)
    const transcript = await fetchTranscript(payload.interview_id);
    
    // Step 2: Fetch skills (always)
    const skills = await fetchUserSkills(payload.user_id);
    
    // Step 3: Analyze with AI (always same prompt)
    const analysis = await analyzeTranscriptWithAI(transcript, skills);
    
    // Step 4: Save results (always)
    await saveAnalysis(analysis);
    
    return analysis; // Done - no evaluation of quality
  },
});
```

### Target Implementation

```typescript
// src/trigger/jobs/interview-analyzer.ts (TARGET)

export const interviewAnalyzer = task({
  id: 'interview.analyze',
  run: async (payload: InterviewAnalyzerPayload) => {
    // ✅ WITH REASONING
    
    // Step 1: REASON about what to do
    const reasoningAgent = new ReasoningAgent({
      goal: 'Analyze interview and verify skills',
      context: payload,
    });
    
    // Step 2: PLAN the analysis
    const plan = await reasoningAgent.generatePlan({
      availableTools: ['fetchTranscript', 'fetchSkills', 'analyzeWithAI', 'searchMemory'],
      constraints: { maxIterations: 3, confidenceThreshold: 0.85 },
    });
    
    // Step 3: EXECUTE with iteration
    let result = null;
    let confidence = 0;
    let iteration = 0;
    
    while (confidence < plan.confidenceThreshold && iteration < plan.maxIterations) {
      result = await reasoningAgent.executeStep(plan.steps[iteration]);
      confidence = await reasoningAgent.evaluateConfidence(result);
      iteration++;
      
      // ADAPT plan if needed
      if (confidence < plan.confidenceThreshold) {
        plan = await reasoningAgent.adaptPlan(result, confidence);
      }
    }
    
    // Step 4: Store reasoning trace in memory
    await reasoningAgent.saveToMemory(result, plan, confidence);
    
    return result;
  },
});
```

---

## Components to Build

### 1. Goal Decomposer (`goal-decomposer.ts`)

Breaks high-level goals into actionable sub-goals.

**Location:** `src/lib/agents/reasoning/goal-decomposer.ts`

```typescript
interface Goal {
  id: string;
  description: string;
  success_criteria: string[];
  priority: 'high' | 'medium' | 'low';
}

interface SubGoal extends Goal {
  parent_id: string;
  dependencies: string[];
  estimated_steps: number;
}

interface GoalDecomposerConfig {
  model: 'gpt-4o-mini' | 'gpt-4o';
  maxDepth: number;
  maxSubGoals: number;
}

class GoalDecomposer {
  constructor(config: GoalDecomposerConfig);
  
  async decompose(goal: Goal, context: Record<string, unknown>): Promise<SubGoal[]>;
  async validateDecomposition(subGoals: SubGoal[]): Promise<boolean>;
  async prioritize(subGoals: SubGoal[]): Promise<SubGoal[]>;
}
```

### 2. Plan Generator (`plan-generator.ts`)

Creates executable plans from goals.

**Location:** `src/lib/agents/reasoning/plan-generator.ts`

```typescript
interface PlanStep {
  step_id: string;
  action: string;
  tool: string;
  input: Record<string, unknown>;
  expected_output: string;
  fallback?: PlanStep;
}

interface Plan {
  id: string;
  goal_id: string;
  steps: PlanStep[];
  estimated_duration_ms: number;
  confidence_threshold: number;
  max_iterations: number;
  created_at: Date;
}

interface PlanGeneratorConfig {
  model: 'gpt-4o-mini' | 'gpt-4o';
  availableTools: string[];
  constraints: {
    maxSteps: number;
    maxDuration: number;
    requiredConfidence: number;
  };
}

class PlanGenerator {
  constructor(config: PlanGeneratorConfig);
  
  async generate(goal: Goal, context: Record<string, unknown>): Promise<Plan>;
  async validate(plan: Plan): Promise<{ valid: boolean; issues: string[] }>;
  async adapt(plan: Plan, feedback: ExecutionFeedback): Promise<Plan>;
  async merge(plans: Plan[]): Promise<Plan>; // For parallel sub-goals
}
```

### 3. Confidence Scorer (`confidence-scorer.ts`)

Evaluates output quality to determine if iteration is needed.

**Location:** `src/lib/agents/reasoning/confidence-scorer.ts`

```typescript
interface ConfidenceScore {
  overall: number;          // 0-1
  completeness: number;     // Did we cover all aspects?
  accuracy: number;         // Is the output factually correct?
  relevance: number;        // Is it relevant to the goal?
  consistency: number;      // Is it internally consistent?
  reasoning_trace: string;  // Why this score?
}

interface ConfidenceScorerConfig {
  model: 'gpt-4o-mini' | 'gpt-4o';
  threshold: number;
  criteria: string[];
}

class ConfidenceScorer {
  constructor(config: ConfidenceScorerConfig);
  
  async score(output: unknown, goal: Goal, context: Record<string, unknown>): Promise<ConfidenceScore>;
  async explain(score: ConfidenceScore): Promise<string>;
  async shouldIterate(score: ConfidenceScore): Promise<boolean>;
  async suggestImprovements(score: ConfidenceScore): Promise<string[]>;
}
```

### 4. Iteration Controller (`iteration-controller.ts`)

Manages the execute-evaluate-adapt loop.

**Location:** `src/lib/agents/reasoning/iteration-controller.ts`

```typescript
interface IterationConfig {
  maxIterations: number;
  confidenceThreshold: number;
  timeout_ms: number;
  earlyStopConditions: string[];
}

interface IterationResult {
  iteration: number;
  output: unknown;
  confidence: ConfidenceScore;
  duration_ms: number;
  tools_used: string[];
  adaptations_made: string[];
}

interface IterationSummary {
  total_iterations: number;
  final_confidence: number;
  converged: boolean;
  early_stopped: boolean;
  stop_reason: string;
  all_results: IterationResult[];
}

class IterationController {
  constructor(config: IterationConfig);
  
  async runLoop(
    executor: () => Promise<unknown>,
    scorer: ConfidenceScorer,
    adapter: (feedback: IterationResult) => Promise<void>
  ): Promise<IterationSummary>;
  
  async shouldContinue(result: IterationResult): Promise<boolean>;
  async handleTimeout(): Promise<IterationSummary>;
}
```

---

## Implementation Details

### File: `src/lib/agents/reasoning/goal-decomposer.ts`

```typescript
/**
 * Goal Decomposer
 * 
 * Breaks high-level goals into actionable sub-goals using AI.
 * 
 * Integration Points:
 * - Called by agents when they receive a new task
 * - Uses OpenAI GPT-4o-mini for cost-effective decomposition
 * - Stores decomposition in agent_plans table
 */

import OpenAI from 'openai';
import { db } from '@/drizzle/db';
import { agentPlans } from '@/drizzle/schema';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Goal {
  id: string;
  description: string;
  success_criteria: string[];
  priority: 'high' | 'medium' | 'low';
  context?: Record<string, unknown>;
}

export interface SubGoal extends Goal {
  parent_id: string;
  dependencies: string[];
  estimated_steps: number;
  order: number;
}

export interface GoalDecomposerConfig {
  model?: 'gpt-4o-mini' | 'gpt-4o';
  maxDepth?: number;
  maxSubGoals?: number;
}

const DECOMPOSITION_PROMPT = `You are a planning agent. Given a high-level goal, break it down into actionable sub-goals.

Rules:
1. Each sub-goal should be specific and actionable
2. Sub-goals should have clear success criteria
3. Identify dependencies between sub-goals
4. Order sub-goals by logical execution sequence
5. Estimate the number of steps needed for each

Output JSON array of sub-goals with this structure:
{
  "sub_goals": [
    {
      "description": "Clear description of what to do",
      "success_criteria": ["Criterion 1", "Criterion 2"],
      "dependencies": ["id_of_dependency"] or [],
      "estimated_steps": 3,
      "priority": "high" | "medium" | "low"
    }
  ]
}`;

export class GoalDecomposer {
  private config: Required<GoalDecomposerConfig>;

  constructor(config: GoalDecomposerConfig = {}) {
    this.config = {
      model: config.model || 'gpt-4o-mini',
      maxDepth: config.maxDepth || 2,
      maxSubGoals: config.maxSubGoals || 10,
    };
  }

  async decompose(goal: Goal, context: Record<string, unknown> = {}): Promise<SubGoal[]> {
    const prompt = `
Goal: ${goal.description}

Success Criteria:
${goal.success_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Context:
${JSON.stringify(context, null, 2)}

Break this goal into sub-goals.
`;

    const response = await openai.chat.completions.create({
      model: this.config.model,
      messages: [
        { role: 'system', content: DECOMPOSITION_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from decomposition');
    }

    const parsed = JSON.parse(content);
    const subGoals: SubGoal[] = parsed.sub_goals.map((sg: any, index: number) => ({
      id: `${goal.id}_sub_${index + 1}`,
      parent_id: goal.id,
      description: sg.description,
      success_criteria: sg.success_criteria,
      dependencies: sg.dependencies || [],
      estimated_steps: sg.estimated_steps || 1,
      priority: sg.priority || 'medium',
      order: index + 1,
    }));

    // Limit sub-goals
    return subGoals.slice(0, this.config.maxSubGoals);
  }

  async validateDecomposition(subGoals: SubGoal[]): Promise<boolean> {
    // Check for circular dependencies
    const ids = new Set(subGoals.map(sg => sg.id));
    for (const sg of subGoals) {
      for (const dep of sg.dependencies) {
        if (!ids.has(dep) && dep !== sg.parent_id) {
          console.warn(`Invalid dependency: ${dep} not found`);
          return false;
        }
      }
    }
    return true;
  }

  async prioritize(subGoals: SubGoal[]): Promise<SubGoal[]> {
    // Topological sort based on dependencies
    const sorted: SubGoal[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (sg: SubGoal) => {
      if (visited.has(sg.id)) return;
      if (visiting.has(sg.id)) throw new Error('Circular dependency detected');

      visiting.add(sg.id);

      for (const depId of sg.dependencies) {
        const dep = subGoals.find(s => s.id === depId);
        if (dep) visit(dep);
      }

      visiting.delete(sg.id);
      visited.add(sg.id);
      sorted.push(sg);
    };

    for (const sg of subGoals) {
      visit(sg);
    }

    return sorted;
  }

  async saveToDatabase(goal: Goal, subGoals: SubGoal[], userId?: string): Promise<string> {
    const [plan] = await db.insert(agentPlans).values({
      goal_description: goal.description,
      goal_success_criteria: goal.success_criteria,
      sub_goals: subGoals,
      status: 'pending',
      user_id: userId,
    }).returning({ id: agentPlans.id });

    return plan.id;
  }
}

export const goalDecomposer = new GoalDecomposer();
```

### File: `src/lib/agents/reasoning/plan-generator.ts`

```typescript
/**
 * Plan Generator
 * 
 * Creates executable plans from sub-goals.
 * Integrates with Tool Registry to select appropriate tools.
 * 
 * Integration Points:
 * - Uses GoalDecomposer output
 * - References ToolRegistry for available tools
 * - Stores plans in agent_plans table
 */

import OpenAI from 'openai';
import { toolRegistry } from '@/lib/agents/tools/tool-registry';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface PlanStep {
  step_id: string;
  action: string;
  tool: string;
  input: Record<string, unknown>;
  expected_output: string;
  fallback?: PlanStep;
  timeout_ms?: number;
}

export interface Plan {
  id: string;
  goal_id: string;
  steps: PlanStep[];
  estimated_duration_ms: number;
  confidence_threshold: number;
  max_iterations: number;
  created_at: Date;
  metadata?: Record<string, unknown>;
}

export interface PlanGeneratorConfig {
  model?: 'gpt-4o-mini' | 'gpt-4o';
  constraints?: {
    maxSteps?: number;
    maxDuration?: number;
    requiredConfidence?: number;
  };
}

const PLAN_GENERATION_PROMPT = `You are a planning agent that creates executable plans.

Given a goal and available tools, create a step-by-step plan.

Available Tools:
{tools}

Rules:
1. Each step must use one of the available tools
2. Steps should be ordered logically
3. Include expected output for each step
4. Provide fallback steps for critical operations
5. Estimate timeout for each step

Output JSON with this structure:
{
  "steps": [
    {
      "action": "What this step does",
      "tool": "tool_name",
      "input": { "param1": "value1" },
      "expected_output": "Description of expected result",
      "timeout_ms": 30000,
      "fallback": { ... } // optional
    }
  ],
  "estimated_duration_ms": 60000,
  "confidence_threshold": 0.85,
  "max_iterations": 3
}`;

export class PlanGenerator {
  private config: Required<PlanGeneratorConfig>;

  constructor(config: PlanGeneratorConfig = {}) {
    this.config = {
      model: config.model || 'gpt-4o-mini',
      constraints: {
        maxSteps: config.constraints?.maxSteps || 10,
        maxDuration: config.constraints?.maxDuration || 300000, // 5 minutes
        requiredConfidence: config.constraints?.requiredConfidence || 0.8,
      },
    };
  }

  async generate(
    goalDescription: string,
    context: Record<string, unknown> = {},
    availableTools?: string[]
  ): Promise<Plan> {
    // Get available tools from registry if not specified
    const tools = availableTools || toolRegistry.listTools();
    const toolDescriptions = tools
      .map(t => {
        const info = toolRegistry.getToolInfo(t);
        return `- ${t}: ${info?.description || 'No description'}`;
      })
      .join('\n');

    const prompt = PLAN_GENERATION_PROMPT.replace('{tools}', toolDescriptions);

    const response = await openai.chat.completions.create({
      model: this.config.model,
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: `Goal: ${goalDescription}\n\nContext: ${JSON.stringify(context, null, 2)}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from plan generation');
    }

    const parsed = JSON.parse(content);
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const plan: Plan = {
      id: planId,
      goal_id: `goal_${Date.now()}`,
      steps: parsed.steps.map((s: any, i: number) => ({
        step_id: `${planId}_step_${i + 1}`,
        action: s.action,
        tool: s.tool,
        input: s.input || {},
        expected_output: s.expected_output,
        fallback: s.fallback,
        timeout_ms: s.timeout_ms || 30000,
      })),
      estimated_duration_ms: parsed.estimated_duration_ms || 60000,
      confidence_threshold: parsed.confidence_threshold || this.config.constraints.requiredConfidence,
      max_iterations: parsed.max_iterations || 3,
      created_at: new Date(),
    };

    // Validate plan
    const validation = await this.validate(plan);
    if (!validation.valid) {
      console.warn('Plan validation issues:', validation.issues);
    }

    return plan;
  }

  async validate(plan: Plan): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check step count
    if (plan.steps.length > this.config.constraints.maxSteps) {
      issues.push(`Too many steps: ${plan.steps.length} > ${this.config.constraints.maxSteps}`);
    }

    // Check duration
    if (plan.estimated_duration_ms > this.config.constraints.maxDuration) {
      issues.push(`Duration too long: ${plan.estimated_duration_ms}ms`);
    }

    // Check tools exist
    for (const step of plan.steps) {
      if (!toolRegistry.hasTool(step.tool)) {
        issues.push(`Unknown tool: ${step.tool}`);
      }
    }

    return { valid: issues.length === 0, issues };
  }

  async adapt(plan: Plan, feedback: { stepId: string; error: string }): Promise<Plan> {
    // Find the failed step
    const failedStepIndex = plan.steps.findIndex(s => s.step_id === feedback.stepId);
    if (failedStepIndex === -1) return plan;

    const failedStep = plan.steps[failedStepIndex];

    // If there's a fallback, use it
    if (failedStep.fallback) {
      const newSteps = [...plan.steps];
      newSteps[failedStepIndex] = {
        ...failedStep.fallback,
        step_id: `${failedStep.step_id}_fallback`,
      };
      return { ...plan, steps: newSteps };
    }

    // Otherwise, regenerate from the failed step
    const remainingGoal = plan.steps
      .slice(failedStepIndex)
      .map(s => s.action)
      .join(', ');

    const newPlan = await this.generate(
      `Continue from: ${remainingGoal}. Previous error: ${feedback.error}`,
      { original_plan_id: plan.id, failed_step: feedback.stepId }
    );

    return {
      ...plan,
      steps: [
        ...plan.steps.slice(0, failedStepIndex),
        ...newPlan.steps,
      ],
    };
  }
}

export const planGenerator = new PlanGenerator();
```

---

## Integration with Existing Code

### Modifying `src/trigger/jobs/interview-analyzer.ts`

```typescript
// ADD these imports at the top
import { goalDecomposer, Goal } from '@/lib/agents/reasoning/goal-decomposer';
import { planGenerator, Plan } from '@/lib/agents/reasoning/plan-generator';
import { confidenceScorer } from '@/lib/agents/reasoning/confidence-scorer';
import { iterationController } from '@/lib/agents/reasoning/iteration-controller';
import { agentMemory } from '@/lib/agents/core/agent-memory';

// WRAP the existing logic in a reasoning loop
export const interviewAnalyzer = task({
  id: 'interview.analyze',
  run: async (payload: InterviewAnalyzerPayload) => {
    const { event_id, interview_id, user_id, interview_type } = payload;

    // Idempotency check (KEEP THIS)
    const idempotencyCheck = await shouldSkipEvent(event_id);
    if (idempotencyCheck.skip) {
      return { success: true, skipped: true, reason: idempotencyCheck.reason };
    }

    // NEW: Define the goal
    const goal: Goal = {
      id: `goal_interview_${interview_id}`,
      description: `Analyze interview ${interview_id} to verify claimed skills for user ${user_id}`,
      success_criteria: [
        'All claimed skills have been evaluated',
        'Confidence score >= 0.85 for verified skills',
        'Skill gaps have been identified',
        'Recommendations have been generated',
      ],
      priority: 'high',
    };

    // NEW: Load context from memory
    const memoryContext = await agentMemory.getRelevantContext(user_id, 'interview_analysis');

    // NEW: Decompose goal into sub-goals
    const subGoals = await goalDecomposer.decompose(goal, {
      interview_type,
      previous_interviews: memoryContext.previousInterviews || [],
      known_skill_gaps: memoryContext.knownGaps || [],
    });

    // NEW: Generate execution plan
    const plan = await planGenerator.generate(
      goal.description,
      { subGoals, memoryContext },
      ['fetchTranscript', 'fetchSkills', 'analyzeWithAI', 'updateSkills', 'generateRecommendations']
    );

    // NEW: Execute with iteration loop
    const result = await iterationController.runLoop(
      async () => {
        // This is the existing analysis logic, now wrapped
        const transcript = await fetchTranscript(interview_id);
        const skills = await fetchUserSkills(user_id);
        return await analyzeTranscriptWithAI(transcript, skills, interview_type);
      },
      confidenceScorer,
      async (feedback) => {
        // Adapt plan based on feedback
        if (feedback.confidence.overall < 0.85) {
          console.log('Confidence too low, adapting approach...');
          // Could switch to more detailed analysis, fetch more context, etc.
        }
      }
    );

    // NEW: Save to memory for future reference
    await agentMemory.save({
      user_id,
      agent_name: 'interviewer',
      memory_type: 'episodic',
      context_key: `interview_${interview_id}`,
      content: {
        analysis: result.output,
        confidence: result.final_confidence,
        iterations: result.total_iterations,
      },
    });

    // Mark event completed (KEEP THIS)
    await markEventCompleted(event_id);

    return {
      success: true,
      ...result,
    };
  },
});
```

### Feature Flag for Gradual Rollout

```typescript
// src/lib/agents/feature-flags.ts

export const agentFeatureFlags = {
  // Enable reasoning layer per agent
  ENABLE_REASONING_INTERVIEWER: process.env.ENABLE_REASONING_INTERVIEWER === 'true',
  ENABLE_REASONING_SENTINEL: process.env.ENABLE_REASONING_SENTINEL === 'true',
  ENABLE_REASONING_ARCHITECT: process.env.ENABLE_REASONING_ARCHITECT === 'true',
  ENABLE_REASONING_ACTION: process.env.ENABLE_REASONING_ACTION === 'true',
  
  // Global kill switch
  ENABLE_AUTONOMOUS_AGENTS: process.env.ENABLE_AUTONOMOUS_AGENTS === 'true',
};

// Usage in jobs:
if (agentFeatureFlags.ENABLE_REASONING_INTERVIEWER) {
  // Use new reasoning-based logic
} else {
  // Use existing logic
}
```

---

## Example: Interview Preparation Reasoning

### Scenario

User wants to prepare for a Senior Frontend Developer interview.

### Without Reasoning (Current)

```
Event: INTERVIEW_PREPARATION_REQUESTED
  ↓
Job: Generate interview questions
  ↓
Result: Generic React/JavaScript questions
```

### With Reasoning (Target)

```
Event: INTERVIEW_PREPARATION_REQUESTED
  ↓
Goal: "Prepare user for Senior Frontend Developer interview"
  ↓
Goal Decomposition:
  1. Analyze user's current skill profile
  2. Review user's past interview performances
  3. Check market demand for target role
  4. Identify skill gaps vs job requirements
  5. Generate custom preparation plan
  ↓
Planning:
  Step 1: fetchUserSkills → Get verified skills
  Step 2: searchMemory → Get past interview results
  Step 3: queryMarketInsights → Get current demand
  Step 4: analyzeGaps → Compare skills vs requirements
  Step 5: generatePlan → Create personalized prep
  ↓
Execution Loop:
  Iteration 1: Generate initial plan
    → Confidence: 0.72 (missing system design)
  Iteration 2: Add system design focus
    → Confidence: 0.88 (satisfactory)
  ↓
Result: Personalized plan focusing on:
  - System Design (gap identified)
  - React Performance (market demand)
  - State Management (previous interview weakness)
```

---

## API Reference

### GoalDecomposer

| Method | Description | Returns |
|--------|-------------|---------|
| `decompose(goal, context)` | Break goal into sub-goals | `SubGoal[]` |
| `validateDecomposition(subGoals)` | Check for valid structure | `boolean` |
| `prioritize(subGoals)` | Sort by dependencies | `SubGoal[]` |
| `saveToDatabase(goal, subGoals)` | Persist plan | `string` (plan ID) |

### PlanGenerator

| Method | Description | Returns |
|--------|-------------|---------|
| `generate(goal, context, tools)` | Create execution plan | `Plan` |
| `validate(plan)` | Check plan validity | `{ valid, issues }` |
| `adapt(plan, feedback)` | Modify plan after failure | `Plan` |

### ConfidenceScorer

| Method | Description | Returns |
|--------|-------------|---------|
| `score(output, goal, context)` | Evaluate output quality | `ConfidenceScore` |
| `explain(score)` | Human-readable explanation | `string` |
| `shouldIterate(score)` | Check if iteration needed | `boolean` |
| `suggestImprovements(score)` | Get improvement hints | `string[]` |

### IterationController

| Method | Description | Returns |
|--------|-------------|---------|
| `runLoop(executor, scorer, adapter)` | Execute with iteration | `IterationSummary` |
| `shouldContinue(result)` | Check loop condition | `boolean` |
| `handleTimeout()` | Graceful timeout handling | `IterationSummary` |

---

## Next Document

Continue to **03-AGENT_STATE_MACHINE.md** for implementing state transitions.

---

**Document Status:** Draft
**Dependencies:** 01-AGENTIC_ARCHITECTURE_OVERVIEW.md
**Next:** 03-AGENT_STATE_MACHINE.md
