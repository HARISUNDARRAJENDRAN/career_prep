/**
 * Workflow Patterns
 *
 * Common patterns for multi-agent workflow execution:
 * - Fan-Out/Fan-In: Parallel execution with aggregation
 * - Pipeline: Sequential processing with data transformation
 * - Scatter-Gather: Broadcast to multiple agents, collect results
 * - Saga: Long-running workflows with compensation
 *
 * @see docs/agentic-improvements/05-AGENT_COORDINATOR.md
 */

import { randomUUID } from 'crypto';
import { messageBus, MessageTopics } from '../message-bus';

// ============================================================================
// Types
// ============================================================================

export interface FanOutConfig<T, R> {
  name: string;
  inputs: T[];
  executor: (input: T, index: number) => Promise<R>;
  concurrency?: number;
  timeout_ms?: number;
  on_partial?: (completed: number, total: number) => void;
}

export interface FanOutResult<R> {
  success: boolean;
  results: R[];
  errors: Array<{ index: number; error: string }>;
  duration_ms: number;
  completed: number;
  failed: number;
}

export interface AggregationStrategy<R, A> {
  name: string;
  aggregate: (results: R[]) => A;
}

export interface PipelineStage<I, O> {
  name: string;
  transform: (input: I) => Promise<O>;
  on_error?: 'fail' | 'skip' | 'default';
  default_value?: O;
}

export interface SagaStep<T> {
  name: string;
  execute: (context: T) => Promise<T>;
  compensate: (context: T) => Promise<T>;
  on_error?: 'compensate' | 'fail';
}

export interface ScatterGatherConfig<I, R> {
  name: string;
  input: I;
  handlers: Array<{
    name: string;
    handler: (input: I) => Promise<R>;
    weight?: number;
  }>;
  aggregation: 'first' | 'all' | 'weighted' | 'consensus';
  timeout_ms?: number;
}

// ============================================================================
// Fan-Out/Fan-In Pattern
// ============================================================================

/**
 * Execute tasks in parallel with controlled concurrency
 * Fan-out: Distribute work across parallel executions
 * Fan-in: Aggregate results back together
 */
export async function fanOutFanIn<T, R>(
  config: FanOutConfig<T, R>
): Promise<FanOutResult<R>> {
  const startTime = Date.now();
  const results: R[] = [];
  const errors: Array<{ index: number; error: string }> = [];
  const concurrency = config.concurrency || 5;
  const timeout = config.timeout_ms || 30000;

  console.log(`[FanOut] Starting ${config.name} with ${config.inputs.length} tasks, concurrency ${concurrency}`);

  // Create chunked execution
  const chunks: T[][] = [];
  for (let i = 0; i < config.inputs.length; i += concurrency) {
    chunks.push(config.inputs.slice(i, i + concurrency));
  }

  let completed = 0;

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async (input, chunkIndex) => {
      const globalIndex = completed + chunkIndex;

      try {
        const result = await Promise.race([
          config.executor(input, globalIndex),
          createTimeoutPromise<R>(timeout, `Task ${globalIndex} timed out`),
        ]);
        return { success: true as const, result, index: globalIndex };
      } catch (error) {
        return {
          success: false as const,
          error: (error as Error).message,
          index: globalIndex,
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);

    for (const result of chunkResults) {
      if (result.success) {
        results.push(result.result);
      } else {
        errors.push({ index: result.index, error: result.error });
      }
    }

    completed += chunk.length;
    config.on_partial?.(completed, config.inputs.length);
  }

  const duration = Date.now() - startTime;
  console.log(`[FanOut] ${config.name} completed: ${results.length} success, ${errors.length} failed in ${duration}ms`);

  return {
    success: errors.length === 0,
    results,
    errors,
    duration_ms: duration,
    completed: results.length,
    failed: errors.length,
  };
}

/**
 * Aggregate results using a strategy
 */
export function aggregate<R, A>(
  results: R[],
  strategy: AggregationStrategy<R, A>
): A {
  console.log(`[Aggregate] Using strategy: ${strategy.name}`);
  return strategy.aggregate(results);
}

// ============================================================================
// Common Aggregation Strategies
// ============================================================================

export const AggregationStrategies = {
  /**
   * Merge arrays into single array
   */
  flattenArrays: <T>(): AggregationStrategy<T[], T[]> => ({
    name: 'flatten_arrays',
    aggregate: (results) => results.flat(),
  }),

  /**
   * Sum numeric values
   */
  sum: (): AggregationStrategy<number, number> => ({
    name: 'sum',
    aggregate: (results) => results.reduce((a, b) => a + b, 0),
  }),

  /**
   * Average numeric values
   */
  average: (): AggregationStrategy<number, number> => ({
    name: 'average',
    aggregate: (results) => {
      if (results.length === 0) return 0;
      return results.reduce((a, b) => a + b, 0) / results.length;
    },
  }),

  /**
   * Find maximum value
   */
  max: (): AggregationStrategy<number, number> => ({
    name: 'max',
    aggregate: (results) => Math.max(...results),
  }),

  /**
   * Merge objects (later objects override earlier)
   */
  mergeObjects: <T extends Record<string, unknown>>(): AggregationStrategy<T, T> => ({
    name: 'merge_objects',
    aggregate: (results) => Object.assign({}, ...results),
  }),

  /**
   * Group by key
   */
  groupBy: <T, K extends keyof T>(key: K): AggregationStrategy<T, Map<T[K], T[]>> => ({
    name: `group_by_${String(key)}`,
    aggregate: (results) => {
      const map = new Map<T[K], T[]>();
      for (const item of results) {
        const k = item[key];
        if (!map.has(k)) {
          map.set(k, []);
        }
        map.get(k)!.push(item);
      }
      return map;
    },
  }),

  /**
   * Take first N results
   */
  takeFirst: <T>(n: number): AggregationStrategy<T, T[]> => ({
    name: `take_first_${n}`,
    aggregate: (results) => results.slice(0, n),
  }),

  /**
   * Filter and deduplicate
   */
  unique: <T>(keyFn: (item: T) => string): AggregationStrategy<T, T[]> => ({
    name: 'unique',
    aggregate: (results) => {
      const seen = new Set<string>();
      return results.filter((item) => {
        const key = keyFn(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
  }),

  /**
   * Majority vote for enum/boolean values
   */
  majorityVote: <T>(): AggregationStrategy<T, T | null> => ({
    name: 'majority_vote',
    aggregate: (results) => {
      const counts = new Map<T, number>();
      for (const result of results) {
        counts.set(result, (counts.get(result) || 0) + 1);
      }

      let maxCount = 0;
      let winner: T | null = null;

      for (const [value, count] of counts) {
        if (count > maxCount) {
          maxCount = count;
          winner = value;
        }
      }

      return winner;
    },
  }),

  /**
   * Weighted average with confidence
   */
  weightedConfidence: (): AggregationStrategy<
    { value: number; confidence: number },
    number
  > => ({
    name: 'weighted_confidence',
    aggregate: (results) => {
      const totalWeight = results.reduce((sum, r) => sum + r.confidence, 0);
      if (totalWeight === 0) return 0;

      return results.reduce(
        (sum, r) => sum + (r.value * r.confidence) / totalWeight,
        0
      );
    },
  }),
};

// ============================================================================
// Pipeline Pattern
// ============================================================================

/**
 * Execute stages sequentially, passing output to next stage
 */
export async function pipeline<T>(
  input: T,
  stages: PipelineStage<unknown, unknown>[]
): Promise<{ result: unknown; stages_completed: number }> {
  let current: unknown = input;
  let stagesCompleted = 0;

  console.log(`[Pipeline] Starting with ${stages.length} stages`);

  for (const stage of stages) {
    try {
      console.log(`[Pipeline] Executing stage: ${stage.name}`);
      current = await stage.transform(current);
      stagesCompleted++;
    } catch (error) {
      console.error(`[Pipeline] Stage ${stage.name} failed:`, error);

      switch (stage.on_error) {
        case 'skip':
          console.log(`[Pipeline] Skipping stage ${stage.name}`);
          continue;
        case 'default':
          if (stage.default_value !== undefined) {
            current = stage.default_value;
            stagesCompleted++;
          }
          continue;
        case 'fail':
        default:
          throw error;
      }
    }
  }

  return { result: current, stages_completed: stagesCompleted };
}

// ============================================================================
// Scatter-Gather Pattern
// ============================================================================

/**
 * Broadcast input to multiple handlers, gather and aggregate results
 */
export async function scatterGather<I, R>(
  config: ScatterGatherConfig<I, R>
): Promise<{
  result: R | R[] | null;
  responses: Array<{ handler: string; result: R | null; error?: string }>;
  duration_ms: number;
}> {
  const startTime = Date.now();
  const timeout = config.timeout_ms || 10000;

  console.log(`[ScatterGather] ${config.name} broadcasting to ${config.handlers.length} handlers`);

  // Execute all handlers in parallel
  const promises = config.handlers.map(async (h) => {
    try {
      const result = await Promise.race([
        h.handler(config.input),
        createTimeoutPromise<R>(timeout, `Handler ${h.name} timed out`),
      ]);
      return { handler: h.name, result, weight: h.weight || 1 };
    } catch (error) {
      return { handler: h.name, result: null as R | null, error: (error as Error).message };
    }
  });

  const responses = await Promise.all(promises);
  const successfulResponses = responses.filter((r) => r.result !== null);

  let finalResult: R | R[] | null = null;

  switch (config.aggregation) {
    case 'first':
      finalResult = successfulResponses[0]?.result ?? null;
      break;

    case 'all':
      finalResult = successfulResponses.map((r) => r.result!);
      break;

    case 'weighted':
      if (successfulResponses.length > 0 && typeof successfulResponses[0].result === 'number') {
        const totalWeight = successfulResponses.reduce((sum, r) => sum + (r.weight || 1), 0);
        const weightedSum = successfulResponses.reduce(
          (sum, r) => sum + ((r.result as unknown as number) * (r.weight || 1)),
          0
        );
        finalResult = (weightedSum / totalWeight) as unknown as R;
      }
      break;

    case 'consensus':
      // Find most common result
      const counts = new Map<string, { count: number; result: R }>();
      for (const r of successfulResponses) {
        const key = JSON.stringify(r.result);
        const existing = counts.get(key);
        if (existing) {
          existing.count++;
        } else {
          counts.set(key, { count: 1, result: r.result! });
        }
      }

      let maxCount = 0;
      for (const [, value] of counts) {
        if (value.count > maxCount) {
          maxCount = value.count;
          finalResult = value.result;
        }
      }
      break;
  }

  const duration = Date.now() - startTime;
  console.log(`[ScatterGather] ${config.name} completed in ${duration}ms`);

  return {
    result: finalResult,
    responses: responses.map((r) => ({
      handler: r.handler,
      result: r.result,
      error: 'error' in r ? r.error : undefined,
    })),
    duration_ms: duration,
  };
}

// ============================================================================
// Saga Pattern
// ============================================================================

/**
 * Execute long-running workflow with compensation for failures
 */
export async function saga<T>(
  initialContext: T,
  steps: SagaStep<T>[]
): Promise<{
  success: boolean;
  context: T;
  completed_steps: string[];
  compensated_steps: string[];
  error?: string;
}> {
  let context = initialContext;
  const completedSteps: string[] = [];
  const compensatedSteps: string[] = [];

  console.log(`[Saga] Starting saga with ${steps.length} steps`);

  try {
    for (const step of steps) {
      console.log(`[Saga] Executing step: ${step.name}`);
      context = await step.execute(context);
      completedSteps.push(step.name);
    }

    return {
      success: true,
      context,
      completed_steps: completedSteps,
      compensated_steps: [],
    };
  } catch (error) {
    console.error(`[Saga] Step failed, starting compensation:`, error);

    // Compensate in reverse order
    const stepsToCompensate = steps
      .filter((s) => completedSteps.includes(s.name))
      .reverse();

    for (const step of stepsToCompensate) {
      if (step.on_error === 'fail') continue;

      try {
        console.log(`[Saga] Compensating step: ${step.name}`);
        context = await step.compensate(context);
        compensatedSteps.push(step.name);
      } catch (compensationError) {
        console.error(`[Saga] Compensation failed for ${step.name}:`, compensationError);
      }
    }

    return {
      success: false,
      context,
      completed_steps: completedSteps,
      compensated_steps: compensatedSteps,
      error: (error as Error).message,
    };
  }
}

// ============================================================================
// Agent-Specific Patterns
// ============================================================================

/**
 * Fan-out job matching across multiple users
 */
export async function fanOutJobMatching(
  userIds: string[],
  matcherFn: (userId: string) => Promise<{ user_id: string; matches: unknown[] }>
): Promise<FanOutResult<{ user_id: string; matches: unknown[] }>> {
  return fanOutFanIn({
    name: 'job_matching_fanout',
    inputs: userIds,
    executor: matcherFn,
    concurrency: 10,
    timeout_ms: 30000,
    on_partial: (completed, total) => {
      console.log(`[JobMatching] Progress: ${completed}/${total} users processed`);
    },
  });
}

/**
 * Fan-out skill extraction across multiple job listings
 */
export async function fanOutSkillExtraction(
  jobListings: Array<{ id: string; description: string }>,
  extractorFn: (job: { id: string; description: string }) => Promise<{ job_id: string; skills: string[] }>
): Promise<FanOutResult<{ job_id: string; skills: string[] }>> {
  return fanOutFanIn({
    name: 'skill_extraction_fanout',
    inputs: jobListings,
    executor: extractorFn,
    concurrency: 5,
    timeout_ms: 10000,
  });
}

/**
 * Pipeline for interview analysis
 */
export async function interviewAnalysisPipeline(
  sessionId: string,
  stages: {
    fetchTranscript: () => Promise<unknown>;
    analyzeSkills: (transcript: unknown) => Promise<unknown>;
    scoreCommunication: (transcript: unknown) => Promise<unknown>;
    generateFeedback: (analysis: unknown) => Promise<unknown>;
  }
): Promise<unknown> {
  const result = await pipeline(sessionId, [
    {
      name: 'fetch_transcript',
      transform: stages.fetchTranscript,
      on_error: 'fail',
    },
    {
      name: 'analyze_skills',
      transform: stages.analyzeSkills,
      on_error: 'fail',
    },
    {
      name: 'score_communication',
      transform: stages.scoreCommunication,
      on_error: 'skip',
    },
    {
      name: 'generate_feedback',
      transform: stages.generateFeedback,
      on_error: 'fail',
    },
  ]);

  return result.result;
}

/**
 * Scatter-gather for multi-source job scraping
 */
export async function multiSourceJobScrape(
  query: { keywords: string[]; location?: string },
  scrapers: Array<{
    name: string;
    scraper: (query: { keywords: string[]; location?: string }) => Promise<unknown[]>;
  }>
): Promise<unknown[]> {
  const result = await scatterGather({
    name: 'multi_source_scrape',
    input: query,
    handlers: scrapers.map((s) => ({
      name: s.name,
      handler: s.scraper,
    })),
    aggregation: 'all',
    timeout_ms: 60000,
  });

  // Flatten and deduplicate results
  const allJobs = (result.result as unknown[][]).flat();
  return allJobs;
}

// ============================================================================
// Utilities
// ============================================================================

function createTimeoutPromise<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Batch processor for large datasets
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];
  const batches: T[][] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  console.log(`[BatchProcessor] Processing ${items.length} items in ${batches.length} batches`);

  for (let i = 0; i < batches.length; i++) {
    const batchResults = await processor(batches[i]);
    results.push(...batchResults);
    console.log(`[BatchProcessor] Completed batch ${i + 1}/${batches.length}`);
  }

  return results;
}

export default {
  fanOutFanIn,
  aggregate,
  pipeline,
  scatterGather,
  saga,
  AggregationStrategies,
  fanOutJobMatching,
  fanOutSkillExtraction,
  interviewAnalysisPipeline,
  multiSourceJobScrape,
  processBatches,
};
