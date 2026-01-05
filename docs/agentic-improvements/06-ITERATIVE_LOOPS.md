# Iterative Loops

> **Document Version:** 1.0
> **Created:** January 5, 2026
> **Depends On:** 01-AGENTIC_ARCHITECTURE_OVERVIEW.md, 02-REASONING_LAYER_INTEGRATION.md, 03-AGENT_STATE_MACHINE.md
> **Purpose:** Implement loop-until-satisfied execution patterns

---

## Table of Contents

1. [Overview](#overview)
2. [Loop Patterns](#loop-patterns)
3. [Termination Conditions](#termination-conditions)
4. [Implementation](#implementation)
5. [Safety Guards](#safety-guards)
6. [Integration with Existing Code](#integration-with-existing-code)
7. [Examples](#examples)

---

## Overview

### The Problem

Current agents run exactly once per trigger:

```typescript
// Current: Single-pass execution
export const interviewAnalyzer = task({
  run: async (payload) => {
    const result = await analyze(payload);
    return result;  // Done. No iteration. Hope it's good enough!
  }
});
```

**Issues:**
- If output quality is low, user gets low-quality output
- No self-correction mechanism
- No way to refine based on intermediate results
- No adaptation when initial approach fails

### The Solution

Agents that loop until satisfied:

```
┌────────────────────────────────────────────────────────────────────┐
│                    ITERATIVE EXECUTION LOOP                         │
│                                                                     │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐                   │
│   │  Execute │────►│ Evaluate │────►│ Satisfied│──► YES ──► Return │
│   │   Step   │     │  Output  │     │    ?     │                   │
│   └──────────┘     └──────────┘     └────┬─────┘                   │
│        ▲                                 │                          │
│        │                                 NO                         │
│        │                                 │                          │
│        │           ┌──────────┐          │                          │
│        └───────────│  Adapt   │◄─────────┘                          │
│                    │  Plan    │                                     │
│                    └──────────┘                                     │
│                                                                     │
│   Termination: confidence >= threshold OR max_iterations reached    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Loop Patterns

### Pattern 1: Confidence Loop

Loop until output confidence exceeds threshold:

```
Execute ──► Evaluate ──► confidence >= 0.85? ──► YES ──► Done
                              │
                              NO
                              │
                              ▼
                         Adapt & Retry
```

**Use Cases:**
- Interview analysis (ensure comprehensive feedback)
- Resume parsing (ensure all skills extracted)
- Job matching (ensure high relevance)

### Pattern 2: Improvement Loop

Loop while output is improving:

```
Execute ──► Evaluate ──► better than last? ──► YES ──► Save & Continue
                              │
                              NO (plateau)
                              │
                              ▼
                           Return Best
```

**Use Cases:**
- Response generation (iterative refinement)
- Roadmap optimization
- Skill gap analysis

### Pattern 3: Checklist Loop

Loop until all requirements satisfied:

```
Execute ──► Check Requirements
              │
              ├── [A] ✓
              ├── [B] ✓
              ├── [C] ✗ ──► Fix C ──► Re-check
              └── [D] ✓
              
All ✓? ──► Done
```

**Use Cases:**
- Application submission (all fields valid)
- Interview prep completeness
- Profile completion

### Pattern 4: Multi-Strategy Loop

Try different approaches until one works:

```
Strategy A ──► Evaluate ──► Success? ──► YES ──► Done
                               │
                               NO
                               │
Strategy B ──► Evaluate ──► Success? ──► YES ──► Done
                               │
                               NO
                               │
Strategy C ──► ... 
```

**Use Cases:**
- Information extraction (try multiple parsers)
- API calls (fallback endpoints)
- Search queries (broaden if no results)

---

## Termination Conditions

### 1. Confidence Threshold

```typescript
interface ConfidenceTermination {
  type: 'confidence';
  threshold: number;        // 0.0 - 1.0
  min_iterations: number;   // At least N iterations before terminating
}

// Example
const termination: ConfidenceTermination = {
  type: 'confidence',
  threshold: 0.85,
  min_iterations: 1,
};
```

### 2. Max Iterations

```typescript
interface MaxIterationsTermination {
  type: 'max_iterations';
  limit: number;
}

// Example
const termination: MaxIterationsTermination = {
  type: 'max_iterations',
  limit: 5,
};
```

### 3. Timeout

```typescript
interface TimeoutTermination {
  type: 'timeout';
  duration_ms: number;
}

// Example
const termination: TimeoutTermination = {
  type: 'timeout',
  duration_ms: 60000,  // 1 minute
};
```

### 4. No Improvement

```typescript
interface NoImprovementTermination {
  type: 'no_improvement';
  patience: number;  // Stop after N iterations without improvement
}

// Example
const termination: NoImprovementTermination = {
  type: 'no_improvement',
  patience: 2,
};
```

### 5. Combined (AND/OR)

```typescript
interface CombinedTermination {
  type: 'combined';
  operator: 'AND' | 'OR';
  conditions: TerminationCondition[];
}

// Example: Stop if confident OR max iterations reached
const termination: CombinedTermination = {
  type: 'combined',
  operator: 'OR',
  conditions: [
    { type: 'confidence', threshold: 0.9, min_iterations: 1 },
    { type: 'max_iterations', limit: 5 },
    { type: 'timeout', duration_ms: 120000 },
  ],
};
```

---

## Implementation

### File: `src/lib/agents/core/iteration-loop.ts`

```typescript
/**
 * Iteration Loop Controller
 * 
 * Manages execute-evaluate-adapt loops with configurable termination.
 * Tracks iteration history for debugging and learning.
 */

import { AgentStateMachine } from './agent-state';
import { AgentMemoryManager } from './agent-memory';
import { ConfidenceScorer } from '../reasoning/confidence-scorer';

// Termination condition types
type TerminationCondition =
  | { type: 'confidence'; threshold: number; min_iterations: number }
  | { type: 'max_iterations'; limit: number }
  | { type: 'timeout'; duration_ms: number }
  | { type: 'no_improvement'; patience: number }
  | { type: 'combined'; operator: 'AND' | 'OR'; conditions: TerminationCondition[] };

// Iteration result
interface IterationResult<T> {
  output: T;
  confidence: number;
  iteration: number;
  duration_ms: number;
  adaptation?: string;  // What was changed from previous iteration
}

// Loop configuration
interface LoopConfig<TInput, TOutput> {
  name: string;
  
  // Core functions
  execute: (input: TInput, context: LoopContext) => Promise<TOutput>;
  evaluate: (output: TOutput, context: LoopContext) => Promise<EvaluationResult>;
  adapt: (output: TOutput, evaluation: EvaluationResult, context: LoopContext) => Promise<TInput>;
  
  // Termination
  termination: TerminationCondition;
  
  // Hooks
  onIterationComplete?: (result: IterationResult<TOutput>) => void;
  onTerminate?: (reason: string, results: IterationResult<TOutput>[]) => void;
}

interface LoopContext {
  iteration: number;
  start_time: Date;
  history: IterationResult<unknown>[];
  memory: AgentMemoryManager;
  state: AgentStateMachine;
}

interface EvaluationResult {
  confidence: number;
  passed: boolean;
  feedback: string;
  improvements?: string[];
}

export class IterationLoop<TInput, TOutput> {
  private config: LoopConfig<TInput, TOutput>;
  private confidenceScorer: ConfidenceScorer;

  constructor(config: LoopConfig<TInput, TOutput>) {
    this.config = config;
    this.confidenceScorer = new ConfidenceScorer();
  }

  /**
   * Run the iteration loop
   */
  async run(
    initialInput: TInput,
    memory: AgentMemoryManager,
    state: AgentStateMachine
  ): Promise<{
    success: boolean;
    output: TOutput | null;
    iterations: number;
    termination_reason: string;
    history: IterationResult<TOutput>[];
  }> {
    const context: LoopContext = {
      iteration: 0,
      start_time: new Date(),
      history: [],
      memory,
      state,
    };

    let currentInput = initialInput;
    let bestOutput: TOutput | null = null;
    let bestConfidence = 0;
    let lastConfidence = 0;
    let noImprovementCount = 0;

    while (true) {
      context.iteration++;

      // Check termination before executing
      const terminationCheck = this.checkTermination(context, lastConfidence, noImprovementCount);
      if (terminationCheck.shouldTerminate) {
        this.config.onTerminate?.(terminationCheck.reason, context.history as IterationResult<TOutput>[]);
        return {
          success: bestConfidence >= this.getConfidenceThreshold(),
          output: bestOutput,
          iterations: context.iteration - 1,
          termination_reason: terminationCheck.reason,
          history: context.history as IterationResult<TOutput>[],
        };
      }

      // Transition state
      if (context.iteration === 1) {
        await state.transition({ type: 'PLAN_COMPLETE', payload: { plan_id: this.config.name, steps: 1 } });
      }

      const iterationStart = Date.now();

      try {
        // Execute
        await state.transition({ type: 'STEP_COMPLETE', payload: { step_id: `iteration_${context.iteration}`, output: null } });
        const output = await this.config.execute(currentInput, context);

        // Evaluate
        const evaluation = await this.config.evaluate(output, context);

        // Track iteration
        const iterationResult: IterationResult<TOutput> = {
          output,
          confidence: evaluation.confidence,
          iteration: context.iteration,
          duration_ms: Date.now() - iterationStart,
        };
        context.history.push(iterationResult as IterationResult<unknown>);
        this.config.onIterationComplete?.(iterationResult);

        // Store in working memory
        await memory.setWorking(`iteration_${context.iteration}`, {
          confidence: evaluation.confidence,
          feedback: evaluation.feedback,
        });

        // Update best
        if (evaluation.confidence > bestConfidence) {
          bestOutput = output;
          bestConfidence = evaluation.confidence;
          noImprovementCount = 0;
        } else {
          noImprovementCount++;
        }

        // Check if we should continue
        if (evaluation.passed) {
          await state.transition({ type: 'EVALUATION_PASS', payload: { confidence: evaluation.confidence } });
          return {
            success: true,
            output,
            iterations: context.iteration,
            termination_reason: 'confidence_threshold_met',
            history: context.history as IterationResult<TOutput>[],
          };
        }

        // Adapt for next iteration
        await state.transition({ type: 'EVALUATION_FAIL', payload: { confidence: evaluation.confidence, reason: evaluation.feedback } });
        currentInput = await this.config.adapt(output, evaluation, context);
        
        iterationResult.adaptation = evaluation.improvements?.join(', ') || 'General refinement';
        lastConfidence = evaluation.confidence;

        await state.transition({ type: 'ADAPTATION_COMPLETE', payload: { new_plan_id: `adapted_${context.iteration}` } });

      } catch (error) {
        // Record failed iteration
        const iterationResult: IterationResult<TOutput> = {
          output: null as unknown as TOutput,
          confidence: 0,
          iteration: context.iteration,
          duration_ms: Date.now() - iterationStart,
          adaptation: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
        };
        context.history.push(iterationResult as IterationResult<unknown>);

        // Don't fail immediately, try to continue with best output
        if (bestOutput && bestConfidence > 0.5) {
          continue;
        }

        throw error;
      }
    }
  }

  /**
   * Check if loop should terminate
   */
  private checkTermination(
    context: LoopContext,
    lastConfidence: number,
    noImprovementCount: number
  ): { shouldTerminate: boolean; reason: string } {
    return this.evaluateCondition(this.config.termination, context, lastConfidence, noImprovementCount);
  }

  private evaluateCondition(
    condition: TerminationCondition,
    context: LoopContext,
    lastConfidence: number,
    noImprovementCount: number
  ): { shouldTerminate: boolean; reason: string } {
    switch (condition.type) {
      case 'confidence':
        if (context.iteration < condition.min_iterations) {
          return { shouldTerminate: false, reason: '' };
        }
        if (lastConfidence >= condition.threshold) {
          return { shouldTerminate: true, reason: `confidence_reached: ${lastConfidence}` };
        }
        return { shouldTerminate: false, reason: '' };

      case 'max_iterations':
        if (context.iteration > condition.limit) {
          return { shouldTerminate: true, reason: `max_iterations: ${condition.limit}` };
        }
        return { shouldTerminate: false, reason: '' };

      case 'timeout':
        const elapsed = Date.now() - context.start_time.getTime();
        if (elapsed > condition.duration_ms) {
          return { shouldTerminate: true, reason: `timeout: ${condition.duration_ms}ms` };
        }
        return { shouldTerminate: false, reason: '' };

      case 'no_improvement':
        if (noImprovementCount >= condition.patience) {
          return { shouldTerminate: true, reason: `no_improvement: ${condition.patience} iterations` };
        }
        return { shouldTerminate: false, reason: '' };

      case 'combined':
        const results = condition.conditions.map(c => 
          this.evaluateCondition(c, context, lastConfidence, noImprovementCount)
        );
        
        if (condition.operator === 'OR') {
          const terminated = results.find(r => r.shouldTerminate);
          return terminated || { shouldTerminate: false, reason: '' };
        } else {
          // AND
          const allTerminated = results.every(r => r.shouldTerminate);
          return allTerminated 
            ? { shouldTerminate: true, reason: results.map(r => r.reason).join(' AND ') }
            : { shouldTerminate: false, reason: '' };
        }

      default:
        return { shouldTerminate: false, reason: '' };
    }
  }

  /**
   * Get confidence threshold from termination config
   */
  private getConfidenceThreshold(): number {
    const findThreshold = (condition: TerminationCondition): number => {
      if (condition.type === 'confidence') {
        return condition.threshold;
      }
      if (condition.type === 'combined') {
        const thresholds = condition.conditions
          .map(c => findThreshold(c))
          .filter(t => t > 0);
        return Math.max(...thresholds, 0.8); // Default to 0.8
      }
      return 0.8;
    };
    return findThreshold(this.config.termination);
  }
}

// Factory function
export function createIterationLoop<TInput, TOutput>(
  config: LoopConfig<TInput, TOutput>
): IterationLoop<TInput, TOutput> {
  return new IterationLoop(config);
}
```

---

## Safety Guards

### Guard 1: Hard Iteration Limit

```typescript
const ABSOLUTE_MAX_ITERATIONS = 10;

// In run() method:
if (context.iteration > ABSOLUTE_MAX_ITERATIONS) {
  throw new Error(`Safety limit: exceeded ${ABSOLUTE_MAX_ITERATIONS} iterations`);
}
```

### Guard 2: Budget Tracker

```typescript
interface BudgetConfig {
  max_tokens: number;
  max_api_calls: number;
  max_cost_usd: number;
}

class BudgetTracker {
  private tokensUsed = 0;
  private apiCalls = 0;
  private costUsd = 0;
  
  constructor(private config: BudgetConfig) {}
  
  track(tokens: number, calls: number, cost: number): void {
    this.tokensUsed += tokens;
    this.apiCalls += calls;
    this.costUsd += cost;
  }
  
  checkBudget(): { exceeded: boolean; reason?: string } {
    if (this.tokensUsed > this.config.max_tokens) {
      return { exceeded: true, reason: `Token limit exceeded: ${this.tokensUsed}` };
    }
    if (this.apiCalls > this.config.max_api_calls) {
      return { exceeded: true, reason: `API call limit exceeded: ${this.apiCalls}` };
    }
    if (this.costUsd > this.config.max_cost_usd) {
      return { exceeded: true, reason: `Cost limit exceeded: $${this.costUsd}` };
    }
    return { exceeded: false };
  }
}
```

### Guard 3: Infinite Loop Detection

```typescript
class InfiniteLoopDetector {
  private outputHashes: Set<string> = new Set();
  
  checkForLoop(output: unknown): boolean {
    const hash = this.hashOutput(output);
    if (this.outputHashes.has(hash)) {
      return true;  // Detected repeated output
    }
    this.outputHashes.add(hash);
    return false;
  }
  
  private hashOutput(output: unknown): string {
    return crypto.createHash('md5')
      .update(JSON.stringify(output))
      .digest('hex');
  }
}

// In run() method:
if (loopDetector.checkForLoop(output)) {
  return {
    success: false,
    output: bestOutput,
    termination_reason: 'infinite_loop_detected',
    ...
  };
}
```

### Guard 4: Degradation Detection

```typescript
// Detect if confidence is dropping instead of improving

class DegradationDetector {
  private confidenceHistory: number[] = [];
  
  addConfidence(confidence: number): void {
    this.confidenceHistory.push(confidence);
  }
  
  isDegradiing(windowSize: number = 3): boolean {
    if (this.confidenceHistory.length < windowSize) return false;
    
    const recent = this.confidenceHistory.slice(-windowSize);
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] >= recent[i - 1]) return false;
    }
    return true;  // All recent iterations got worse
  }
}
```

---

## Integration with Existing Code

### Wrapping Interview Analyzer

```typescript
// src/trigger/jobs/interview-analyzer.ts

import { createIterationLoop, IterationLoop } from '@/lib/agents/core/iteration-loop';
import { createAgentStateMachine } from '@/lib/agents/core/agent-state';
import { createMemoryManager } from '@/lib/agents/core/agent-memory';

interface AnalysisInput {
  transcript: string;
  interview_type: string;
  previous_feedback?: string;
  focus_areas?: string[];
}

interface AnalysisOutput {
  overall_score: number;
  strengths: string[];
  improvements: string[];
  detailed_feedback: string;
  action_items: string[];
}

// Create the iteration loop
const analysisLoop = createIterationLoop<AnalysisInput, AnalysisOutput>({
  name: 'interview_analysis_loop',
  
  execute: async (input, context) => {
    // Call GPT-4 for analysis
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert interview coach. Analyze this interview transcript.
            ${input.previous_feedback ? `Previous feedback to improve on: ${input.previous_feedback}` : ''}
            ${input.focus_areas?.length ? `Focus on: ${input.focus_areas.join(', ')}` : ''}`
        },
        { role: 'user', content: input.transcript }
      ],
      response_format: { type: 'json_object' },
    });
    
    return JSON.parse(response.choices[0].message.content) as AnalysisOutput;
  },
  
  evaluate: async (output, context) => {
    // Score the output quality
    const hasStrengths = output.strengths.length >= 2;
    const hasImprovements = output.improvements.length >= 2;
    const hasActionItems = output.action_items.length >= 1;
    const detailedEnough = output.detailed_feedback.length >= 200;
    
    const checks = [hasStrengths, hasImprovements, hasActionItems, detailedEnough];
    const passedChecks = checks.filter(Boolean).length;
    const confidence = passedChecks / checks.length;
    
    const improvements: string[] = [];
    if (!hasStrengths) improvements.push('Need more strengths identified');
    if (!hasImprovements) improvements.push('Need more areas for improvement');
    if (!hasActionItems) improvements.push('Need actionable next steps');
    if (!detailedEnough) improvements.push('Feedback needs more detail');
    
    return {
      confidence,
      passed: confidence >= 0.85,
      feedback: improvements.length ? improvements.join('; ') : 'Analysis is comprehensive',
      improvements,
    };
  },
  
  adapt: async (output, evaluation, context) => {
    // Generate improved input for next iteration
    return {
      transcript: context.history[0]?.output 
        ? (context.history[0] as any).transcript 
        : '',
      interview_type: 'behavioral',  // Preserve original
      previous_feedback: evaluation.feedback,
      focus_areas: evaluation.improvements,
    };
  },
  
  termination: {
    type: 'combined',
    operator: 'OR',
    conditions: [
      { type: 'confidence', threshold: 0.85, min_iterations: 1 },
      { type: 'max_iterations', limit: 3 },
      { type: 'timeout', duration_ms: 60000 },
      { type: 'no_improvement', patience: 2 },
    ],
  },
  
  onIterationComplete: (result) => {
    console.log(`Iteration ${result.iteration}: confidence=${result.confidence}, time=${result.duration_ms}ms`);
  },
});

// The actual Trigger.dev job
export const interviewAnalyzer = task({
  id: 'interview.analyze',
  run: async (payload: { interview_id: string; user_id: string; transcript: string }) => {
    const { interview_id, user_id, transcript } = payload;
    
    // Initialize state and memory
    const state = createAgentStateMachine({
      agentName: 'interviewer',
      userId: user_id,
      taskId: interview_id,
    });
    
    const memory = createMemoryManager({
      agentName: 'interviewer',
      userId: user_id,
      taskId: interview_id,
    });
    
    // Start state machine
    await state.transition({ type: 'START', payload: { task_id: interview_id } });
    await state.transition({ type: 'INIT_COMPLETE', payload: { context_loaded: true } });
    
    // Run iterative analysis
    const result = await analysisLoop.run(
      { transcript, interview_type: 'behavioral' },
      memory,
      state
    );
    
    // Record episode in memory
    await memory.recordEpisode({
      actionType: 'interview_analysis',
      actionDescription: `Analyzed interview ${interview_id} over ${result.iterations} iterations`,
      outcome: result.success ? 'success' : 'partial',
      confidenceScore: result.history[result.history.length - 1]?.confidence || 0,
    });
    
    // Clean up
    await memory.clearWorking();
    
    return {
      success: result.success,
      analysis: result.output,
      iterations: result.iterations,
      termination_reason: result.termination_reason,
    };
  },
});
```

---

## Examples

### Example 1: Resume Parsing with Retries

```typescript
const resumeParsingLoop = createIterationLoop<
  { resume_text: string; extraction_hints?: string[] },
  { skills: string[]; experience: object[]; education: object[] }
>({
  name: 'resume_parsing',
  
  execute: async (input) => {
    return await parseResumeWithHints(input.resume_text, input.extraction_hints);
  },
  
  evaluate: async (output) => {
    const hasSkills = output.skills.length >= 3;
    const hasExperience = output.experience.length >= 1;
    const confidence = (hasSkills ? 0.5 : 0) + (hasExperience ? 0.5 : 0);
    
    return {
      confidence,
      passed: confidence >= 0.8,
      feedback: !hasSkills ? 'Need more skills' : !hasExperience ? 'Need experience' : 'OK',
      improvements: [],
    };
  },
  
  adapt: async (output, evaluation, context) => {
    // Try different extraction strategies
    const strategies = ['detailed', 'keyword-focused', 'section-by-section'];
    const nextStrategy = strategies[context.iteration % strategies.length];
    
    return {
      resume_text: context.history[0]?.output ? '' : '', // Keep original
      extraction_hints: [nextStrategy],
    };
  },
  
  termination: {
    type: 'combined',
    operator: 'OR',
    conditions: [
      { type: 'confidence', threshold: 0.8, min_iterations: 1 },
      { type: 'max_iterations', limit: 3 },
    ],
  },
});
```

### Example 2: Job Matching Refinement

```typescript
const jobMatchingLoop = createIterationLoop<
  { user_skills: string[]; preferences: object; min_relevance: number },
  { jobs: JobMatch[]; avg_relevance: number }
>({
  name: 'job_matching',
  
  execute: async (input) => {
    const jobs = await searchJobs(input.user_skills, input.preferences);
    const relevantJobs = jobs.filter(j => j.relevance >= input.min_relevance);
    return {
      jobs: relevantJobs,
      avg_relevance: relevantJobs.reduce((a, j) => a + j.relevance, 0) / relevantJobs.length,
    };
  },
  
  evaluate: async (output) => {
    const hasEnoughJobs = output.jobs.length >= 5;
    const highQuality = output.avg_relevance >= 0.7;
    const confidence = (hasEnoughJobs ? 0.5 : 0) + (highQuality ? 0.5 : 0);
    
    return {
      confidence,
      passed: hasEnoughJobs && highQuality,
      feedback: !hasEnoughJobs ? 'Need more matches' : 'Low relevance',
      improvements: !hasEnoughJobs ? ['broaden search'] : ['increase relevance threshold'],
    };
  },
  
  adapt: async (output, evaluation, context) => {
    const currentMinRelevance = context.iteration === 1 ? 0.8 : 0.6;
    
    // Adjust search parameters based on results
    if (output.jobs.length < 5) {
      // Broaden search
      return {
        ...context.history[0]?.output as any,
        min_relevance: currentMinRelevance - 0.1,
      };
    } else {
      // Narrow search for quality
      return {
        ...context.history[0]?.output as any,
        min_relevance: currentMinRelevance + 0.05,
      };
    }
  },
  
  termination: {
    type: 'combined',
    operator: 'OR',
    conditions: [
      { type: 'confidence', threshold: 0.9, min_iterations: 1 },
      { type: 'max_iterations', limit: 4 },
      { type: 'no_improvement', patience: 2 },
    ],
  },
});
```

---

## Next Document

Continue to **07-TOOL_SELECTION.md** for dynamic tool selection.

---

**Document Status:** Draft
**Dependencies:** 01, 02, 03
**Next:** 07-TOOL_SELECTION.md
