# Pilot Interview Agent

> **Document Version:** 1.0
> **Created:** January 5, 2026
> **Depends On:** All previous documents (01-07)
> **Purpose:** First fully autonomous agent implementation combining all concepts

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Implementation](#implementation)
4. [Complete Code](#complete-code)
5. [Testing Strategy](#testing-strategy)
6. [Deployment Plan](#deployment-plan)
7. [Success Metrics](#success-metrics)

---

## Overview

### Why Interview Agent as Pilot?

The Interview Agent is ideal as our first fully autonomous agent because:

1. **Well-defined scope**: Analyze transcript → provide feedback
2. **Clear success criteria**: User satisfaction with feedback quality
3. **Existing infrastructure**: Hume AI integration, transcript storage
4. **High impact**: Directly improves user's interview skills
5. **Testable**: Can compare against current implementation

### Transformation Summary

| Aspect | Current | Pilot Implementation |
|--------|---------|---------------------|
| Execution | Single-pass | Iterative until confident |
| Tool Selection | Hard-coded | AI-selected based on goal |
| Memory | None | Working + Episodic + Long-term |
| State | Running/Done | 12 explicit states |
| Planning | None | Goal decomposition + plan generation |
| Coordination | Event dispatch | Workflow-managed |

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUTONOMOUS INTERVIEW AGENT                                │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         COORDINATOR LAYER                              │ │
│  │  • Receives INTERVIEW_COMPLETED event                                  │ │
│  │  • Initiates interview_analysis_workflow                               │ │
│  │  • Manages state across all components                                 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│  ┌─────────────────────────────────▼────────────────────────────────────┐   │
│  │                         REASONING LAYER                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │    Goal     │  │    Plan     │  │ Confidence  │  │  Iteration  │ │   │
│  │  │ Decomposer  │  │  Generator  │  │   Scorer    │  │ Controller  │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌─────────────────────────────────▼────────────────────────────────────┐   │
│  │                          MEMORY LAYER                                 │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │   │
│  │  │ Working Memory  │  │ Episodic Memory │  │ Long-term Memory│      │   │
│  │  │ (current task)  │  │ (past analyses) │  │ (user patterns) │      │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌─────────────────────────────────▼────────────────────────────────────┐   │
│  │                           TOOL LAYER                                  │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │   │
│  │  │ Transcript │  │   GPT-4    │  │   Skill    │  │    RAG     │     │   │
│  │  │   Parser   │  │  Analyzer  │  │  Extractor │  │   Search   │     │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌─────────────────────────────────▼────────────────────────────────────┐   │
│  │                          STATE MACHINE                                │   │
│  │                                                                       │   │
│  │   idle → init → planning → executing → evaluating → adapting         │   │
│  │                     ↑                       │                         │   │
│  │                     └───────────────────────┘                         │   │
│  │                           (iterate)                                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. INTERVIEW_COMPLETED event received
         │
         ▼
2. Load context from memory
   • Past interview analyses for this user
   • User preferences and patterns
   • Historical feedback that worked well
         │
         ▼
3. Goal decomposition
   • "Provide comprehensive interview feedback"
   • Sub-goals: analyze_responses, identify_strengths,
     find_improvements, generate_action_items
         │
         ▼
4. Plan generation
   • Step 1: Parse transcript
   • Step 2: Extract skill signals
   • Step 3: Analyze response quality
   • Step 4: Compare with past performance
   • Step 5: Generate personalized feedback
         │
         ▼
5. Tool selection
   • transcript_parser (required)
   • skill_analyzer (optional based on interview type)
   • gpt4_analyzer (always)
   • rag_search (if knowledge needed)
         │
         ▼
6. Execute → Evaluate → Adapt loop
   • Execute plan
   • Score output confidence
   • If confidence < 0.85, adapt and retry
   • Max 3 iterations
         │
         ▼
7. Store results
   • Record episode in memory
   • Store learned patterns
   • Update user insights
         │
         ▼
8. Emit completion event
   • INTERVIEW_ANALYSIS_COMPLETED
   • Triggers downstream agents (Sentinel, Architect)
```

---

## Implementation

### Directory Structure

```
src/
├── lib/
│   └── agents/
│       ├── core/
│       │   ├── base-agent.ts          # Abstract autonomous agent
│       │   ├── agent-state.ts         # State machine (from 03)
│       │   ├── agent-memory.ts        # Memory manager (from 04)
│       │   └── agent-coordinator.ts   # Coordinator (from 05)
│       ├── reasoning/
│       │   ├── goal-decomposer.ts     # (from 02)
│       │   ├── plan-generator.ts      # (from 02)
│       │   ├── confidence-scorer.ts   # (from 02)
│       │   └── iteration-controller.ts # (from 06)
│       ├── tools/
│       │   ├── tool-registry.ts       # (from 07)
│       │   ├── tool-selector.ts       # (from 07)
│       │   └── tool-executor.ts       # (from 07)
│       ├── agents/
│       │   └── interviewer/           # NEW: Pilot agent
│       │       ├── index.ts
│       │       ├── interviewer-agent.ts
│       │       ├── interviewer-prompts.ts
│       │       └── interviewer-tools.ts
│       └── workflows/
│           └── interview-analysis.ts  # Workflow definition
└── trigger/
    └── jobs/
        └── interview-analyzer.ts      # REFACTOR: Wrap with agent
```

---

## Complete Code

### File: `src/lib/agents/agents/interviewer/index.ts`

```typescript
/**
 * Autonomous Interview Agent
 * 
 * First fully autonomous agent implementation.
 * Demonstrates all agentic patterns working together.
 */

export { InterviewerAgent } from './interviewer-agent';
export { INTERVIEWER_PROMPTS } from './interviewer-prompts';
export { registerInterviewerTools } from './interviewer-tools';
```

### File: `src/lib/agents/agents/interviewer/interviewer-agent.ts`

```typescript
/**
 * Interviewer Agent Implementation
 * 
 * A fully autonomous agent that:
 * 1. Reasons about how to analyze interviews
 * 2. Selects appropriate tools dynamically
 * 3. Iterates until confident in output
 * 4. Learns from past analyses
 * 5. Coordinates with other agents
 */

import { createAgentStateMachine, AgentStateMachine } from '../../core/agent-state';
import { createMemoryManager, AgentMemoryManager } from '../../core/agent-memory';
import { GoalDecomposer } from '../../reasoning/goal-decomposer';
import { PlanGenerator, Plan, PlanStep } from '../../reasoning/plan-generator';
import { ConfidenceScorer, EvaluationResult } from '../../reasoning/confidence-scorer';
import { createIterationLoop } from '../../core/iteration-loop';
import { selectToolsHybrid, ToolSelectionResult } from '../../tools/tool-selector';
import { createToolExecutor, ToolExecutor, ExecutionResult } from '../../tools/tool-executor';
import { publishAgentEvent } from '../../message-bus';
import { db } from '@/drizzle/db';
import { interviews, interviewAnalyses } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { INTERVIEWER_PROMPTS } from './interviewer-prompts';

// Types
interface InterviewContext {
  interview_id: string;
  user_id: string;
  transcript: string;
  interview_type: 'behavioral' | 'technical' | 'case' | 'mixed';
  duration_minutes: number;
  job_role?: string;
  company?: string;
}

interface AnalysisOutput {
  overall_score: number;
  strengths: Array<{
    category: string;
    description: string;
    evidence: string;
  }>;
  improvements: Array<{
    category: string;
    description: string;
    suggestion: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  detailed_feedback: {
    communication: { score: number; notes: string };
    technical: { score: number; notes: string };
    problem_solving: { score: number; notes: string };
    cultural_fit: { score: number; notes: string };
  };
  action_items: Array<{
    item: string;
    timeline: string;
    resources?: string[];
  }>;
  personalized_tips: string[];
}

interface AgentConfig {
  max_iterations: number;
  confidence_threshold: number;
  timeout_ms: number;
  enable_learning: boolean;
}

const DEFAULT_CONFIG: AgentConfig = {
  max_iterations: 5,           // Increased for better confidence convergence
  confidence_threshold: 0.85,
  timeout_ms: 120000,          // 2 minutes
  enable_learning: true,
  graceful_degradation: true,  // Accept valid output even if threshold not met
};

export class InterviewerAgent {
  private config: AgentConfig;
  private state: AgentStateMachine;
  private memory: AgentMemoryManager;
  private goalDecomposer: GoalDecomposer;
  private planGenerator: PlanGenerator;
  private confidenceScorer: ConfidenceScorer;
  private toolExecutor: ToolExecutor;

  constructor(
    private context: InterviewContext,
    config: Partial<AgentConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize components
    this.state = createAgentStateMachine({
      agentName: 'interviewer',
      userId: context.user_id,
      taskId: context.interview_id,
    });

    this.memory = createMemoryManager({
      agentName: 'interviewer',
      userId: context.user_id,
      taskId: context.interview_id,
    });

    this.goalDecomposer = new GoalDecomposer();
    this.planGenerator = new PlanGenerator();
    this.confidenceScorer = new ConfidenceScorer();

    this.toolExecutor = createToolExecutor({
      agent_name: 'interviewer',
      task_id: context.interview_id,
      user_id: context.user_id,
    });
  }

  /**
   * Main entry point - run the autonomous analysis
   */
  async analyze(): Promise<{
    success: boolean;
    analysis: AnalysisOutput | null;
    iterations: number;
    confidence: number;
    reasoning_trace: string[];
  }> {
    const reasoning_trace: string[] = [];
    
    try {
      // ═══════════════════════════════════════════════════════════════
      // PHASE 1: INITIALIZATION
      // ═══════════════════════════════════════════════════════════════
      
      await this.state.transition({ type: 'START', payload: { task_id: this.context.interview_id } });
      reasoning_trace.push('Started interview analysis');

      // Load context from memory
      const memoryContext = await this.loadMemoryContext();
      reasoning_trace.push(`Loaded ${memoryContext.pastAnalyses.length} past analyses, ${memoryContext.userPatterns.length} user patterns`);

      await this.state.transition({ type: 'INIT_COMPLETE', payload: { context_loaded: true } });

      // ═══════════════════════════════════════════════════════════════
      // PHASE 2: GOAL DECOMPOSITION
      // ═══════════════════════════════════════════════════════════════

      const mainGoal = `Provide comprehensive, actionable interview feedback for a ${this.context.interview_type} interview${this.context.job_role ? ` for ${this.context.job_role}` : ''}`;
      
      const subGoals = await this.goalDecomposer.decompose(mainGoal, {
        interview_type: this.context.interview_type,
        transcript_length: this.context.transcript.length,
        has_past_data: memoryContext.pastAnalyses.length > 0,
      });
      
      reasoning_trace.push(`Decomposed goal into ${subGoals.length} sub-goals: ${subGoals.map(g => g.description).join(', ')}`);

      // ═══════════════════════════════════════════════════════════════
      // PHASE 3: PLAN GENERATION
      // ═══════════════════════════════════════════════════════════════

      const plan = await this.planGenerator.generate(subGoals, {
        available_tools: await this.getAvailableTools(),
        constraints: {
          max_steps: 10,
          max_duration_ms: this.config.timeout_ms,
        },
        memory_context: memoryContext,
      });

      reasoning_trace.push(`Generated plan with ${plan.steps.length} steps`);
      await this.memory.setWorking('current_plan', plan);

      await this.state.transition({ 
        type: 'PLAN_COMPLETE', 
        payload: { plan_id: plan.id, steps: plan.steps.length } 
      });

      // ═══════════════════════════════════════════════════════════════
      // PHASE 4: ITERATIVE EXECUTION
      // ═══════════════════════════════════════════════════════════════

      const loop = createIterationLoop<
        { plan: Plan; context: typeof memoryContext },
        AnalysisOutput
      >({
        name: 'interview_analysis',
        
        execute: async (input) => {
          return this.executePlan(input.plan, input.context);
        },
        
        evaluate: async (output) => {
          return this.evaluateOutput(output);
        },
        
        adapt: async (output, evaluation, loopContext) => {
          const adaptedPlan = await this.adaptPlan(
            loopContext.history[loopContext.iteration - 1]?.output as Plan,
            output,
            evaluation
          );
          reasoning_trace.push(`Iteration ${loopContext.iteration}: Adapted plan based on feedback: ${evaluation.feedback}`);
          return { plan: adaptedPlan, context: memoryContext };
        },
        
        termination: {
          type: 'combined',
          operator: 'OR',
          conditions: [
            { type: 'confidence', threshold: this.config.confidence_threshold, min_iterations: 1 },
            { type: 'max_iterations', limit: this.config.max_iterations },
            { type: 'timeout', duration_ms: this.config.timeout_ms },
            { type: 'no_improvement', patience: 2 },
          ],
        },
        
        onIterationComplete: (result) => {
          reasoning_trace.push(`Iteration ${result.iteration}: confidence=${result.confidence.toFixed(2)}, time=${result.duration_ms}ms`);
        },
      });

      const result = await loop.run(
        { plan, context: memoryContext },
        this.memory,
        this.state
      );

      // ═══════════════════════════════════════════════════════════════
      // PHASE 5: POST-PROCESSING & LEARNING
      // ═══════════════════════════════════════════════════════════════

      if (result.success && result.output) {
        // Store analysis in database
        await this.persistAnalysis(result.output);

        // Record episode for learning
        if (this.config.enable_learning) {
          await this.recordLearning(result);
        }

        // Emit completion event
        await publishAgentEvent({
          type: 'INTERVIEW_ANALYSIS_COMPLETED' as any,
          payload: {
            interview_id: this.context.interview_id,
            user_id: this.context.user_id,
            analysis: result.output,
            confidence: result.history[result.history.length - 1]?.confidence || 0,
          },
        });

        reasoning_trace.push(`Analysis completed successfully after ${result.iterations} iterations`);
      }

      // Clean up working memory
      await this.memory.clearWorking();

      return {
        success: result.success,
        analysis: result.output,
        iterations: result.iterations,
        confidence: result.history[result.history.length - 1]?.confidence || 0,
        reasoning_trace,
      };

    } catch (error) {
      reasoning_trace.push(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      await this.state.transition({
        type: 'STEP_FAILED',
        payload: { 
          step_id: 'main', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        },
      });

      return {
        success: false,
        analysis: null,
        iterations: 0,
        confidence: 0,
        reasoning_trace,
      };
    }
  }

  /**
   * Load relevant context from memory
   */
  private async loadMemoryContext(): Promise<{
    pastAnalyses: any[];
    userPatterns: any[];
    learnedInsights: any[];
  }> {
    const [pastAnalyses, userPatterns, learnedInsights] = await Promise.all([
      // Find similar past analyses
      this.memory.findSimilarEpisodes(
        `${this.context.interview_type} interview analysis`,
        { limit: 5, outcomeFilter: 'success' }
      ),
      // Get user preferences
      this.memory.searchFacts(
        'interview feedback preferences',
        { category: 'user_preference', limit: 5 }
      ),
      // Get learned patterns
      this.memory.searchFacts(
        `${this.context.interview_type} interview patterns`,
        { category: 'pattern_learned', limit: 5 }
      ),
    ]);

    return { pastAnalyses, userPatterns, learnedInsights };
  }

  /**
   * Get available tools for this analysis
   */
  private async getAvailableTools(): Promise<string[]> {
    const toolSelection = await selectToolsHybrid(
      `Analyze ${this.context.interview_type} interview transcript`,
      {
        available_inputs: {
          transcript: this.context.transcript,
          interview_type: this.context.interview_type,
        },
      }
    );

    await this.memory.setWorking('selected_tools', toolSelection);
    return toolSelection.selected_tools;
  }

  /**
   * Execute a plan using selected tools
   */
  private async executePlan(plan: Plan, memoryContext: any): Promise<AnalysisOutput> {
    const results: Record<string, any> = {};

    for (const step of plan.steps) {
      await this.state.transition({
        type: 'STEP_COMPLETE',
        payload: { step_id: step.id, output: null },
      });

      // Build input from previous step outputs
      const stepInput = this.buildStepInput(step, results, memoryContext);

      // Execute tool
      const toolResult = await this.toolExecutor.execute(step.tool_id, stepInput);
      
      if (!toolResult.success) {
        throw new Error(`Step ${step.id} failed: ${toolResult.error}`);
      }

      results[step.id] = toolResult.output;
    }

    // Synthesize final output
    return this.synthesizeOutput(results, memoryContext);
  }

  /**
   * Build input for a plan step
   */
  private buildStepInput(
    step: PlanStep,
    previousResults: Record<string, any>,
    memoryContext: any
  ): any {
    const input: any = {};

    // Map inputs from previous steps
    for (const [key, source] of Object.entries(step.input_mapping || {})) {
      if (typeof source === 'string' && source.startsWith('$')) {
        const sourceStep = source.slice(1);
        input[key] = previousResults[sourceStep];
      } else if (source === '@transcript') {
        input[key] = this.context.transcript;
      } else if (source === '@interview_type') {
        input[key] = this.context.interview_type;
      } else if (source === '@memory') {
        input[key] = memoryContext;
      } else {
        input[key] = source;
      }
    }

    return input;
  }

  /**
   * Synthesize analysis output from step results
   */
  private async synthesizeOutput(
    stepResults: Record<string, any>,
    memoryContext: any
  ): Promise<AnalysisOutput> {
    // Use GPT-4 to synthesize a coherent analysis
    const synthesisResult = await this.toolExecutor.execute('gpt4_analyzer', {
      prompt: INTERVIEWER_PROMPTS.SYNTHESIS.replace('{STEP_RESULTS}', JSON.stringify(stepResults, null, 2))
        .replace('{INTERVIEW_TYPE}', this.context.interview_type)
        .replace('{PAST_PATTERNS}', JSON.stringify(memoryContext.learnedInsights)),
      context: INTERVIEWER_PROMPTS.SYSTEM_CONTEXT,
      response_format: 'json',
    });

    return (synthesisResult.output as any).response as AnalysisOutput;
  }

  /**
   * Evaluate output quality
   */
  private async evaluateOutput(output: AnalysisOutput): Promise<EvaluationResult> {
    const checks = {
      has_strengths: output.strengths.length >= 2,
      has_improvements: output.improvements.length >= 2,
      has_action_items: output.action_items.length >= 1,
      detailed_feedback: Object.values(output.detailed_feedback).every(f => f.notes.length > 50),
      personalized: output.personalized_tips.length >= 2,
      reasonable_score: output.overall_score >= 0 && output.overall_score <= 100,
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    const confidence = passedChecks / totalChecks;

    const improvements: string[] = [];
    if (!checks.has_strengths) improvements.push('Add more specific strengths');
    if (!checks.has_improvements) improvements.push('Identify more areas for improvement');
    if (!checks.has_action_items) improvements.push('Include actionable next steps');
    if (!checks.detailed_feedback) improvements.push('Expand feedback detail');
    if (!checks.personalized) improvements.push('Add personalized recommendations');

    return {
      confidence,
      passed: confidence >= this.config.confidence_threshold,
      feedback: improvements.length ? improvements.join('; ') : 'Analysis is comprehensive',
      improvements,
    };
  }

  /**
   * Adapt plan based on evaluation feedback
   */
  private async adaptPlan(
    currentPlan: Plan,
    output: AnalysisOutput,
    evaluation: EvaluationResult
  ): Promise<Plan> {
    // Add steps to address gaps
    const newSteps: PlanStep[] = [...currentPlan.steps];

    if (evaluation.improvements?.includes('Add more specific strengths')) {
      newSteps.push({
        id: 'deep_strength_analysis',
        tool_id: 'gpt4_analyzer',
        description: 'Deep dive into identifying specific strengths',
        input_mapping: {
          prompt: INTERVIEWER_PROMPTS.STRENGTH_DEEP_DIVE,
          context: '@transcript',
        },
      });
    }

    if (evaluation.improvements?.includes('Include actionable next steps')) {
      newSteps.push({
        id: 'action_item_generation',
        tool_id: 'gpt4_analyzer',
        description: 'Generate specific action items',
        input_mapping: {
          prompt: INTERVIEWER_PROMPTS.ACTION_ITEMS,
          context: '@transcript',
        },
      });
    }

    return {
      ...currentPlan,
      id: `${currentPlan.id}_adapted`,
      steps: newSteps,
    };
  }

  /**
   * Persist analysis to database
   */
  private async persistAnalysis(analysis: AnalysisOutput): Promise<void> {
    await db.insert(interviewAnalyses).values({
      id: crypto.randomUUID(),
      interview_id: this.context.interview_id,
      user_id: this.context.user_id,
      overall_score: analysis.overall_score,
      strengths: analysis.strengths,
      improvements: analysis.improvements,
      detailed_feedback: analysis.detailed_feedback,
      action_items: analysis.action_items,
      personalized_tips: analysis.personalized_tips,
      created_at: new Date(),
    });
  }

  /**
   * Record learning for future improvements
   */
  private async recordLearning(result: any): Promise<void> {
    // Record episode
    const episodeId = await this.memory.recordEpisode({
      actionType: 'interview_analysis',
      actionDescription: `Analyzed ${this.context.interview_type} interview for ${this.context.job_role || 'unknown role'}`,
      context: {
        goal: 'Provide comprehensive interview feedback',
        inputs: {
          interview_type: this.context.interview_type,
          transcript_length: this.context.transcript.length,
        },
        tools_used: (await this.memory.getWorking('selected_tools') as any)?.selected_tools || [],
        plan_id: (await this.memory.getWorking('current_plan') as any)?.id,
      },
      outcome: 'success',
      outcomeDetails: {
        result: { iterations: result.iterations },
        metrics: {
          confidence: result.history[result.history.length - 1]?.confidence || 0,
          iterations: result.iterations,
        },
      },
      confidenceScore: result.history[result.history.length - 1]?.confidence || 0,
    });

    // If high confidence, store learned pattern
    if (result.history[result.history.length - 1]?.confidence >= 0.9) {
      await this.memory.storeFact({
        category: 'pattern_learned',
        fact: `Successful ${this.context.interview_type} interview analysis pattern: ${result.iterations} iterations, tools: ${(await this.memory.getWorking('selected_tools') as any)?.selected_tools?.join(', ')}`,
        keywords: [this.context.interview_type, 'interview', 'analysis', 'successful'],
        evidence: { source_episodes: [episodeId] },
      });
    }
  }
}
```

### File: `src/lib/agents/agents/interviewer/interviewer-prompts.ts`

```typescript
/**
 * Interviewer Agent Prompts
 * 
 * Centralized prompt templates for the interviewer agent.
 */

export const INTERVIEWER_PROMPTS = {
  SYSTEM_CONTEXT: `You are an expert interview coach with years of experience helping candidates succeed.
You provide specific, actionable feedback that is encouraging yet honest.
You focus on both technical competence and soft skills.
Your feedback always includes concrete examples from the transcript.`,

  SYNTHESIS: `Synthesize the following analysis results into a comprehensive interview feedback report.

Step Results:
{STEP_RESULTS}

Interview Type: {INTERVIEW_TYPE}

Past Patterns to Consider:
{PAST_PATTERNS}

Return a JSON object with this structure:
{
  "overall_score": <0-100>,
  "strengths": [
    {"category": "...", "description": "...", "evidence": "quote from transcript"}
  ],
  "improvements": [
    {"category": "...", "description": "...", "suggestion": "...", "priority": "high|medium|low"}
  ],
  "detailed_feedback": {
    "communication": {"score": <0-100>, "notes": "..."},
    "technical": {"score": <0-100>, "notes": "..."},
    "problem_solving": {"score": <0-100>, "notes": "..."},
    "cultural_fit": {"score": <0-100>, "notes": "..."}
  },
  "action_items": [
    {"item": "...", "timeline": "...", "resources": ["..."]}
  ],
  "personalized_tips": ["..."]
}`,

  STRENGTH_DEEP_DIVE: `Analyze the interview transcript deeply to identify specific strengths.
Focus on:
1. Communication clarity and structure
2. Technical accuracy and depth
3. Problem-solving approach
4. Examples and evidence provided
5. Enthusiasm and cultural fit

For each strength, provide:
- A specific quote or moment from the transcript
- Why this demonstrates strength
- How to leverage this in future interviews`,

  ACTION_ITEMS: `Based on the interview analysis, generate specific, actionable improvement items.
Each action item should:
1. Address a specific weakness or gap
2. Have a clear timeline (1 week, 2 weeks, 1 month)
3. Include resources or methods to improve
4. Be measurable

Focus on the 3-5 most impactful improvements.`,

  SKILL_EXTRACTION: `Extract technical and soft skills demonstrated in this interview.
For each skill:
- Name the skill
- Rate proficiency (1-5 based on evidence)
- Cite evidence from transcript
- Note if this matches job requirements`,
};
```

### File: `src/trigger/jobs/interview-analyzer.ts` (Refactored)

```typescript
/**
 * Interview Analyzer Job
 * 
 * Trigger.dev task that wraps the Autonomous Interview Agent.
 * Maintains backward compatibility while adding full autonomy.
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import { InterviewerAgent } from '@/lib/agents/agents/interviewer';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

interface InterviewAnalyzerPayload {
  event_id: string;
  interview_id: string;
  user_id: string;
}

export const interviewAnalyzer = task({
  id: 'interview.analyze',
  
  run: async (payload: InterviewAnalyzerPayload) => {
    const { event_id, interview_id, user_id } = payload;
    
    logger.info('Starting autonomous interview analysis', { interview_id, user_id });

    // Load interview data
    const interview = await db.query.interviews.findFirst({
      where: eq(interviews.id, interview_id),
    });

    if (!interview) {
      throw new Error(`Interview not found: ${interview_id}`);
    }

    // Create autonomous agent
    const agent = new InterviewerAgent({
      interview_id,
      user_id,
      transcript: interview.transcript || '',
      interview_type: (interview.type as any) || 'behavioral',
      duration_minutes: interview.duration_minutes || 30,
      job_role: interview.job_role || undefined,
      company: interview.company || undefined,
    });

    // Run autonomous analysis
    const result = await agent.analyze();

    logger.info('Interview analysis completed', {
      interview_id,
      success: result.success,
      iterations: result.iterations,
      confidence: result.confidence,
    });

    // Log reasoning trace for debugging
    if (result.reasoning_trace.length > 0) {
      logger.debug('Reasoning trace', { trace: result.reasoning_trace });
    }

    return {
      success: result.success,
      interview_id,
      analysis: result.analysis,
      meta: {
        iterations: result.iterations,
        confidence: result.confidence,
        reasoning_steps: result.reasoning_trace.length,
      },
    };
  },
});
```

---

## Testing Strategy

### Unit Tests

```typescript
// src/lib/agents/agents/interviewer/__tests__/interviewer-agent.test.ts

import { InterviewerAgent } from '../interviewer-agent';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('InterviewerAgent', () => {
  const mockContext = {
    interview_id: 'test-interview-123',
    user_id: 'test-user-456',
    transcript: 'Interviewer: Tell me about yourself.\nCandidate: I am a software engineer...',
    interview_type: 'behavioral' as const,
    duration_minutes: 30,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete analysis successfully', async () => {
    const agent = new InterviewerAgent(mockContext);
    const result = await agent.analyze();

    expect(result.success).toBe(true);
    expect(result.analysis).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should iterate when confidence is low', async () => {
    const agent = new InterviewerAgent(mockContext, {
      confidence_threshold: 0.99, // Very high threshold
      max_iterations: 3,
    });

    const result = await agent.analyze();

    expect(result.iterations).toBeGreaterThan(1);
  });

  it('should respect max iterations', async () => {
    const agent = new InterviewerAgent(mockContext, {
      confidence_threshold: 1.0, // Impossible threshold
      max_iterations: 2,
    });

    const result = await agent.analyze();

    expect(result.iterations).toBeLessThanOrEqual(2);
  });

  it('should load memory context', async () => {
    // Test with mocked memory
    const agent = new InterviewerAgent(mockContext);
    const result = await agent.analyze();

    expect(result.reasoning_trace).toContain(expect.stringContaining('Loaded'));
  });
});
```

### Integration Tests

```typescript
// src/lib/agents/agents/interviewer/__tests__/interviewer-integration.test.ts

import { InterviewerAgent } from '../interviewer-agent';
import { db } from '@/drizzle/db';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('InterviewerAgent Integration', () => {
  const testUserId = 'integration-test-user';
  const testInterviewId = 'integration-test-interview';

  beforeAll(async () => {
    // Set up test data
  });

  afterAll(async () => {
    // Clean up test data
  });

  it('should persist analysis to database', async () => {
    const agent = new InterviewerAgent({
      interview_id: testInterviewId,
      user_id: testUserId,
      transcript: 'Test transcript...',
      interview_type: 'technical',
      duration_minutes: 45,
    });

    const result = await agent.analyze();
    expect(result.success).toBe(true);

    // Verify persistence
    const savedAnalysis = await db.query.interviewAnalyses.findFirst({
      where: eq(interviewAnalyses.interview_id, testInterviewId),
    });

    expect(savedAnalysis).toBeDefined();
    expect(savedAnalysis?.overall_score).toBeDefined();
  });

  it('should emit completion event', async () => {
    // Test event emission
  });

  it('should learn from analysis', async () => {
    // Test memory storage
  });
});
```

---

## Deployment Plan

### Phase 1: Shadow Mode (Week 1)

```typescript
// Run new agent in parallel with old implementation
// Compare results, don't use new results yet

const legacyResult = await runLegacyAnalyzer(payload);
const autonomousResult = await runAutonomousAgent(payload);

// Log comparison
logger.info('Analysis comparison', {
  legacy_score: legacyResult.score,
  autonomous_score: autonomousResult.analysis?.overall_score,
  confidence: autonomousResult.confidence,
  iterations: autonomousResult.iterations,
});

// Return legacy result
return legacyResult;
```

### Phase 2: Canary Release (Week 2)

```typescript
// 10% of users get new agent
const useAutonomous = Math.random() < 0.1;

if (useAutonomous) {
  return await runAutonomousAgent(payload);
} else {
  return await runLegacyAnalyzer(payload);
}
```

### Phase 3: Gradual Rollout (Week 3-4)

```typescript
// Feature flag based rollout
const rolloutPercentage = await getFeatureFlag('autonomous_interview_agent');

if (Math.random() * 100 < rolloutPercentage) {
  return await runAutonomousAgent(payload);
} else {
  return await runLegacyAnalyzer(payload);
}
```

### Phase 4: Full Release (Week 5)

```typescript
// Remove legacy code, use autonomous agent exclusively
return await runAutonomousAgent(payload);
```

---

## Success Metrics

### Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Analysis Confidence | > 85% avg | Agent-reported confidence |
| User Satisfaction | > 4.2/5 | Feedback rating |
| Feedback Completeness | > 90% | All sections populated |
| Actionability | > 80% | Users report taking action |

### Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Analysis Time | < 60s | End-to-end latency |
| Iterations | < 3 avg | Agent-reported iterations |
| Token Usage | < 5000/analysis | API usage tracking |
| Success Rate | > 95% | Completed without error |

### Learning Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Episode Recording | 100% | Memory writes |
| Pattern Extraction | > 10/week | Long-term memory entries |
| Memory Utilization | > 50% | Past episodes influencing new analyses |

---

## Conclusion

The Pilot Interview Agent demonstrates all agentic patterns working together:

1. ✅ **Reasoning Layer** - Goal decomposition and plan generation
2. ✅ **State Machine** - Explicit state tracking and transitions
3. ✅ **Memory System** - Working, episodic, and long-term memory
4. ✅ **Iterative Loops** - Execute until confident
5. ✅ **Tool Selection** - Dynamic tool selection based on goal
6. ✅ **Coordination** - Event emission for downstream agents

After successful pilot deployment, apply these patterns to:
- Sentinel Agent (skill tracking)
- Architect Agent (roadmap planning)
- Action Agent (job applications)
- Strategist Agent (market analysis)

---

**Document Status:** Draft
**Dependencies:** 01-07
**Implementation Priority:** HIGH
