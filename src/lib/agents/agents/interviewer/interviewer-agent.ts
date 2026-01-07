/**
 * Interviewer Agent Implementation
 *
 * A fully autonomous agent that:
 * 1. Reasons about how to analyze interviews
 * 2. Selects appropriate tools dynamically
 * 3. Iterates until confident in output
 * 4. Learns from past analyses
 * 5. Coordinates with other agents
 *
 * @see docs/agentic-improvements/08-PILOT_INTERVIEW_AGENT.md
 */

import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

import { createStateMachine, AgentStateMachine } from '../../core/agent-state';
import { createMemoryManager, AgentMemoryManager } from '../../core/agent-memory';
import {
  createGoalDecomposer,
  GoalDecomposer,
  type Goal,
} from '../../reasoning/goal-decomposer';
import {
  createPlanGenerator,
  PlanGenerator,
  type Plan,
  type PlanStep,
} from '../../reasoning/plan-generator';
import {
  createConfidenceScorer,
  ConfidenceScorer,
  type ConfidenceAssessment,
} from '../../reasoning/confidence-scorer';
import {
  createIterationController,
  IterationController,
  type IterationLoopResult,
} from '../../reasoning/iteration-controller';
import {
  createToolExecutor,
  ToolExecutor,
  createToolSelector,
  ToolSelector,
} from '../../tools';
import { publishAgentEvent } from '../../message-bus';
import { buildPrompt, INTERVIEWER_PROMPTS } from './interviewer-prompts';
import { registerInterviewerTools, getInterviewerToolIds } from './interviewer-tools';

// ============================================================================
// Types
// ============================================================================

/**
 * Context for an interview analysis
 */
export interface InterviewContext {
  interview_id: string;
  user_id: string;
  transcript: string;
  interview_type: 'behavioral' | 'technical' | 'case' | 'mixed';
  duration_minutes: number;
  job_role?: string;
  company?: string;
}

/**
 * Output of the interview analysis
 */
export interface AnalysisOutput {
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

/**
 * Agent configuration
 */
export interface InterviewerAgentConfig {
  max_iterations: number;
  confidence_threshold: number;
  timeout_ms: number;
  enable_learning: boolean;
}

/**
 * Result of the analysis
 */
export interface AnalysisResult {
  success: boolean;
  analysis: AnalysisOutput | null;
  iterations: number;
  confidence: number;
  duration_ms: number;
  reasoning_trace: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: InterviewerAgentConfig = {
  max_iterations: 3,
  confidence_threshold: 0.85,
  timeout_ms: 120000, // 2 minutes
  enable_learning: true,
};

// ============================================================================
// Interviewer Agent Class
// ============================================================================

/**
 * InterviewerAgent - First fully autonomous agent implementation
 */
export class InterviewerAgent {
  private config: InterviewerAgentConfig;
  private context: InterviewContext;

  // Core components
  private stateMachine: AgentStateMachine | null = null;
  private memory: AgentMemoryManager;
  private goalDecomposer: GoalDecomposer;
  private planGenerator: PlanGenerator;
  private confidenceScorer: ConfidenceScorer;
  private iterationController: IterationController;
  private toolSelector: ToolSelector;
  private toolExecutor: ToolExecutor;

  // Execution state
  private reasoningTrace: string[] = [];
  private currentPlan: Plan | null = null;

  constructor(
    context: InterviewContext,
    config: Partial<InterviewerAgentConfig> = {}
  ) {
    this.context = context;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.memory = createMemoryManager({
      agent_name: 'interviewer',
      task_id: context.interview_id,
      user_id: context.user_id,
    });

    this.goalDecomposer = createGoalDecomposer({ model: 'gpt-4o-mini' });
    this.planGenerator = createPlanGenerator({
      model: 'gpt-4o-mini',
      max_steps: 8,
      default_confidence_threshold: this.config.confidence_threshold,
      default_max_iterations: this.config.max_iterations,
    });
    this.confidenceScorer = createConfidenceScorer({
      model: 'gpt-4o-mini',
      default_threshold: this.config.confidence_threshold,
      strict_mode: false,
    });
    this.toolSelector = createToolSelector({ model: 'gpt-4o-mini' });
    this.toolExecutor = createToolExecutor({
      default_timeout_ms: 30000,
      default_max_retries: 1,
      enable_logging: true,
    });

    // Create iteration controller (needs scorer and planGenerator)
    this.iterationController = createIterationController(
      this.confidenceScorer,
      this.planGenerator,
      {
        conditions: {
          max_iterations: this.config.max_iterations,
          confidence_threshold: this.config.confidence_threshold,
          max_duration_ms: this.config.timeout_ms,
          convergence_threshold: 0.02,
          max_degradations: 2,
        },
        enable_adaptation: true,
        adaptation_cooldown_ms: 5000,
        checkpoint_interval: 1,
      }
    );

    // Register tools
    registerInterviewerTools();
  }

  /**
   * Main entry point - run the autonomous analysis
   */
  async analyze(): Promise<AnalysisResult> {
    const startTime = Date.now();
    this.reasoningTrace = [];

    try {
      // ═══════════════════════════════════════════════════════════════
      // PHASE 1: INITIALIZATION
      // ═══════════════════════════════════════════════════════════════

      this.trace('Started interview analysis');

      // Initialize state machine
      this.stateMachine = await createStateMachine({
        agent_name: 'interviewer',
        user_id: this.context.user_id,
        task_id: this.context.interview_id,
      });

      await this.stateMachine.transition({
        type: 'START',
        payload: { task_id: this.context.interview_id },
      });

      // Load context from memory
      const memoryContext = await this.loadMemoryContext();
      this.trace(
        `Loaded ${memoryContext.pastAnalyses.length} past analyses, ` +
          `${memoryContext.userPatterns.length} user patterns`
      );

      // Store context in working memory
      await this.memory.setWorking('interview_context', this.context);
      await this.memory.setWorking('memory_context', memoryContext);

      await this.stateMachine.transition({
        type: 'INIT_COMPLETE',
        payload: { context_loaded: true },
      });

      // ═══════════════════════════════════════════════════════════════
      // PHASE 2: GOAL DECOMPOSITION
      // ═══════════════════════════════════════════════════════════════

      const mainGoal = this.createMainGoal();
      const decomposition = await this.goalDecomposer.decompose(mainGoal);

      this.trace(
        `Decomposed goal into ${decomposition.length} sub-goals: ` +
          decomposition.map((g) => g.description.slice(0, 30)).join(', ')
      );

      // ═══════════════════════════════════════════════════════════════
      // PHASE 3: PLAN GENERATION
      // ═══════════════════════════════════════════════════════════════

      this.trace('Starting plan generation...');
      
      this.currentPlan = await this.planGenerator.generate(mainGoal, {
        working_memory: {
          interview_type: this.context.interview_type,
          has_past_data: memoryContext.pastAnalyses.length > 0,
        },
      });

      this.trace(`Generated plan with ${this.currentPlan.steps.length} steps:`);
      this.currentPlan.steps.forEach((step, i) => {
        this.trace(`  Step ${i + 1}: ${step.action} (tool: ${step.tool_id})`);
      });

      await this.memory.setWorking('current_plan', this.currentPlan);

      await this.stateMachine.transition({
        type: 'PLAN_COMPLETE',
        payload: { plan_id: this.currentPlan.id, steps: this.currentPlan.steps.length },
      });

      // ═══════════════════════════════════════════════════════════════
      // PHASE 4: ITERATIVE EXECUTION
      // ═══════════════════════════════════════════════════════════════

      const iterationResult = await this.runIterativeExecution(
        mainGoal,
        this.currentPlan,
        memoryContext
      );

      // ═══════════════════════════════════════════════════════════════
      // PHASE 5: POST-PROCESSING & LEARNING
      // ═══════════════════════════════════════════════════════════════

      // Check if we have valid output - accept it even if confidence threshold wasn't met
      // This provides graceful degradation when max iterations is reached
      const hasValidOutput = iterationResult.final_output && 
        this.isValidAnalysisOutput(iterationResult.final_output);
      
      if (hasValidOutput) {
        const analysis = iterationResult.final_output as AnalysisOutput;
        const confidenceScore = iterationResult.final_assessment?.overall_score || 0;
        const metThreshold = iterationResult.success;

        if (!metThreshold) {
          this.trace(
            `Analysis completed with lower confidence (${(confidenceScore * 100).toFixed(1)}% < ${(this.config.confidence_threshold * 100).toFixed(1)}% threshold) after ${iterationResult.total_iterations} iterations. Using best available output.`
          );
        }

        // Record episode for learning
        if (this.config.enable_learning) {
          await this.recordLearning(analysis, iterationResult);
        }

        // Emit completion event with required payload
        // Note: duration_minutes estimated from analysis context
        const durationMinutes = Math.round((Date.now() - startTime) / 60000);
        await publishAgentEvent({
          type: 'INTERVIEW_COMPLETED',
          payload: {
            interview_id: this.context.interview_id,
            user_id: this.context.user_id,
            duration_minutes: durationMinutes,
            interview_type: this.context.interview_type as 'reality_check' | 'weekly_sprint' | 'skill_deep_dive',
          },
        });

        this.trace(
          `Analysis completed after ${iterationResult.total_iterations} iterations (confidence: ${(confidenceScore * 100).toFixed(1)}%)`
        );

        // Transition to success
        await this.stateMachine.transition({
          type: 'EVALUATION_PASS',
          payload: {
            confidence: confidenceScore,
          },
        });

        return {
          success: true, // Mark as success if we have valid output
          analysis,
          iterations: iterationResult.total_iterations,
          confidence: confidenceScore,
          duration_ms: Date.now() - startTime,
          reasoning_trace: this.reasoningTrace,
        };
      }

      // Analysis truly failed - no valid output produced
      this.trace(`Analysis failed: ${iterationResult.termination_reason}`);

      await this.stateMachine.transition({
        type: 'STEP_FAILED',
        payload: { step_id: 'final', error: iterationResult.termination_reason },
      });

      return {
        success: false,
        analysis: null,
        iterations: iterationResult.total_iterations,
        confidence: iterationResult.final_assessment?.overall_score || 0,
        duration_ms: Date.now() - startTime,
        reasoning_trace: this.reasoningTrace,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.trace(`Error: ${errorMessage}`);

      if (this.stateMachine) {
        await this.stateMachine.transition({
          type: 'STEP_FAILED',
          payload: { step_id: 'main', error: errorMessage },
        });
      }

      return {
        success: false,
        analysis: null,
        iterations: 0,
        confidence: 0,
        duration_ms: Date.now() - startTime,
        reasoning_trace: this.reasoningTrace,
      };
    } finally {
      // Clean up working memory
      await this.memory.clearWorking();
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Check if an output is a valid AnalysisOutput structure
   */
  private isValidAnalysisOutput(output: unknown): output is AnalysisOutput {
    if (!output || typeof output !== 'object') {
      return false;
    }
    
    const analysis = output as Partial<AnalysisOutput>;
    
    // Check for required fields with meaningful content
    const hasScore = typeof analysis.overall_score === 'number' && analysis.overall_score > 0;
    const hasStrengths = Array.isArray(analysis.strengths) && analysis.strengths.length > 0;
    const hasImprovements = Array.isArray(analysis.improvements);
    const hasDetailedFeedback = !!(analysis.detailed_feedback && 
      typeof analysis.detailed_feedback === 'object');
    
    // Valid if we have at least a score and some content
    return hasScore && (hasStrengths || hasImprovements || hasDetailedFeedback);
  }

  /**
   * Load relevant context from memory
   */
  private async loadMemoryContext(): Promise<{
    pastAnalyses: unknown[];
    userPatterns: unknown[];
    learnedInsights: unknown[];
  }> {
    const [pastAnalyses, userPatterns, learnedInsights] = await Promise.all([
      this.memory.recallEpisodes({
        limit: 5,
      }),
      this.memory.recallFacts({
        categories: ['user_preference'],
        limit: 5,
      }),
      this.memory.recallFacts({
        categories: ['pattern_learned'],
        limit: 5,
      }),
    ]);

    return {
      pastAnalyses: pastAnalyses || [],
      userPatterns: userPatterns || [],
      learnedInsights: learnedInsights || [],
    };
  }

  /**
   * Create the main goal for analysis
   */
  private createMainGoal(): Goal {
    const roleContext = this.context.job_role
      ? ` for ${this.context.job_role} position`
      : '';
    const companyContext = this.context.company
      ? ` at ${this.context.company}`
      : '';

    return {
      id: `goal-${this.context.interview_id}`,
      description: `Provide comprehensive, actionable interview feedback for a ${this.context.interview_type} interview${roleContext}${companyContext}`,
      success_criteria: [
        'Identify at least 3 specific strengths with evidence',
        'Identify at least 2 improvement areas with actionable suggestions',
        'Provide detailed feedback on communication, technical skills, and problem-solving',
        'Generate personalized action items with timelines',
        'Include tips tailored to the candidate\'s performance patterns',
      ],
      priority: 'high',
    };
  }

  /**
   * Run iterative execution loop
   */
  private async runIterativeExecution(
    goal: Goal,
    plan: Plan,
    memoryContext: unknown
  ): Promise<IterationLoopResult> {
    const executePlan = async (
      currentPlan: Plan,
      context: Record<string, unknown>
    ): Promise<{ output: unknown; feedback: Array<{ step_id: string; success: boolean; output?: unknown; error?: string }> }> => {
      const feedback: Array<{ step_id: string; success: boolean; output?: unknown; error?: string }> = [];
      const stepOutputs: Record<string, unknown> = {};

      for (const step of currentPlan.steps) {
        await this.stateMachine?.transition({
          type: 'STEP_COMPLETE',
          payload: { step_id: step.step_id, output: null },
        });

        try {
          const result = await this.toolExecutor.execute(
            step.tool_id,
            this.buildStepInput(step, stepOutputs)
          );

          if (result.success) {
            stepOutputs[step.step_id] = result.output;
            feedback.push({
              step_id: step.step_id,
              success: true,
              output: result.output,
            });
          } else {
            feedback.push({
              step_id: step.step_id,
              success: false,
              error: result.error,
            });
          }
        } catch (error) {
          feedback.push({
            step_id: step.step_id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Synthesize final output
      const output = await this.synthesizeOutput(stepOutputs, memoryContext);

      return { output, feedback };
    };

    return this.iterationController.runLoop(
      goal,
      plan,
      executePlan,
      { memory_context: memoryContext }
    );
  }

  /**
   * Build input for a plan step
   */
  private buildStepInput(
    step: PlanStep,
    previousOutputs: Record<string, unknown>
  ): Record<string, unknown> {
    const input: Record<string, unknown> = { ...step.tool_input };

    // Add transcript if needed
    if (step.tool_id === 'transcript_parser' || step.tool_id.includes('analyzer')) {
      input.transcript = this.context.transcript;
    }

    // Add interview type
    input.interview_type = this.context.interview_type;

    // Add previous outputs if referenced
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        const stepRef = value.slice(1);
        input[key] = previousOutputs[stepRef];
      }
    }

    return input;
  }

  /**
   * Synthesize final analysis from step outputs
   */
  private async synthesizeOutput(
    stepOutputs: Record<string, unknown>,
    memoryContext: unknown
  ): Promise<AnalysisOutput> {
    const result = await this.toolExecutor.execute('feedback_generator', {
      analysis: stepOutputs,
      interview_type: this.context.interview_type,
      user_patterns: (memoryContext as { learnedInsights?: unknown[] })?.learnedInsights || [],
    });

    if (result.success && result.output) {
      return result.output as AnalysisOutput;
    }

    // Return minimal output if synthesis fails
    return {
      overall_score: 0,
      strengths: [],
      improvements: [],
      detailed_feedback: {
        communication: { score: 0, notes: '' },
        technical: { score: 0, notes: '' },
        problem_solving: { score: 0, notes: '' },
        cultural_fit: { score: 0, notes: '' },
      },
      action_items: [],
      personalized_tips: [],
    };
  }

  /**
   * Record learning from successful analysis
   */
  private async recordLearning(
    analysis: AnalysisOutput,
    iterationResult: IterationLoopResult
  ): Promise<void> {
    // Record episode
    await this.memory.recordEpisode({
      episode_type: `${this.context.interview_type}_interview_analysis`,
      action_taken: 'analyzed_interview',
      context: {
        input_summary: `Interview ID: ${this.context.interview_id}`,
      },
      outcome: {
        success: iterationResult.success,
        result_summary: `Iterations: ${iterationResult.total_iterations}`,
        metrics: {
          iterations: iterationResult.total_iterations,
          confidence: iterationResult.final_assessment?.overall_score ?? 0,
        },
      },
    });

    // Learn from high-performing patterns
    if (analysis.overall_score >= 70) {
      await this.memory.rememberFact({
        category: 'pattern_learned',
        fact: `${this.context.interview_type} interview patterns: ${analysis.strengths.map((s) => s.category).join(', ')}`,
        confidence: 0.7,
        evidence: {
          source_episodes: [this.context.interview_id],
        },
      });
    }
  }

  /**
   * Add entry to reasoning trace
   */
  private trace(message: string): void {
    const timestamp = new Date().toISOString();
    this.reasoningTrace.push(`[${timestamp}] ${message}`);
    console.log(`[InterviewerAgent] ${message}`);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an interviewer agent instance
 */
export function createInterviewerAgent(
  context: InterviewContext,
  config?: Partial<InterviewerAgentConfig>
): InterviewerAgent {
  return new InterviewerAgent(context, config);
}

/**
 * Quick analysis function
 */
export async function analyzeInterview(
  interview_id: string,
  user_id: string,
  transcript: string,
  options: {
    interview_type?: 'behavioral' | 'technical' | 'case' | 'mixed';
    job_role?: string;
    company?: string;
    config?: Partial<InterviewerAgentConfig>;
  } = {}
): Promise<AnalysisResult> {
  const agent = createInterviewerAgent(
    {
      interview_id,
      user_id,
      transcript,
      interview_type: options.interview_type || 'mixed',
      duration_minutes: Math.ceil(transcript.split(/\s+/).length / 150), // Estimate
      job_role: options.job_role,
      company: options.company,
    },
    options.config
  );

  return agent.analyze();
}
