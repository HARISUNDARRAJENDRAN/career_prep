/**
 * Action Agent (Auto-Applier)
 *
 * Autonomous agent for job application automation.
 * Uses state machine, memory manager, reasoning layer, and tool execution.
 *
 * @see docs/agentic-improvements/08-PILOT_INTERVIEW_AGENT.md
 */

import { randomUUID } from 'crypto';
import {
  createStateMachine,
  AgentStateMachine,
  type TransitionEvent,
  type StateContext,
} from '../../core/agent-state';
import {
  AgentMemoryManager,
  createMemoryManager,
  type EpisodeContext,
} from '../../core/agent-memory';
import { GoalDecomposer, createGoalDecomposer } from '../../reasoning/goal-decomposer';
import { PlanGenerator, createPlanGenerator, type Plan } from '../../reasoning/plan-generator';
import { ConfidenceScorer, createConfidenceScorer, type ConfidenceAssessment } from '../../reasoning/confidence-scorer';
import {
  IterationController,
  createIterationController,
  type IterationState,
} from '../../reasoning/iteration-controller';
import { ToolSelector, createToolSelector, type ToolSelectionResult } from '../../tools/tool-selector';
import { ToolExecutor, createToolExecutor, type ExecutionResult } from '../../tools/tool-executor';
import { toolRegistry } from '../../tools/tool-registry';
import { messageBus, MessageTopics, type MessagePayloads } from '../../message-bus';
import { registerActionTools, getActionToolIds } from './action-tools';
import { ACTION_PROMPTS } from './action-prompts';
import type { AgentState } from '@/drizzle/schema';

// ============================================================================
// Types
// ============================================================================

export interface ActionAgentConfig {
  user_id: string;
  job_listing_id?: string;
  match_data?: {
    match_score: number;
    matching_skills: string[];
    missing_skills: string[];
  };
  mode: 'single_apply' | 'batch_apply' | 'followup_check' | 'prioritize';
  max_applications?: number;
}

export interface ActionResult {
  success: boolean;
  mode: string;
  applications_created: number;
  applications_skipped: number;
  applications?: Array<{
    id: string;
    job_id: string;
    company: string;
    role: string;
    status: string;
    cover_letter_preview: string;
  }>;
  followups?: Array<{
    application_id: string;
    should_followup: boolean;
    timing: string;
    method: string;
  }>;
  prioritized_jobs?: Array<{
    id: string;
    rank: number;
    urgency: string;
    reasoning: string;
  }>;
  stats: {
    duration_ms: number;
    iterations: number;
    tools_used: string[];
    confidence: number;
  };
  errors?: string[];
}

interface ActionContext {
  config: ActionAgentConfig;
  current_step: string;
  applications: Array<{
    id: string;
    job_id: string;
    company: string;
    role: string;
    status: string;
    cover_letter_preview: string;
  }>;
  skipped: Array<{ job_id: string; reason: string }>;
  followups: Array<{
    application_id: string;
    should_followup: boolean;
    timing: string;
    method: string;
  }>;
  prioritized: Array<{
    id: string;
    rank: number;
    urgency: string;
    reasoning: string;
  }>;
  errors: string[];
  tools_used: Set<string>;
}

// ============================================================================
// Action Agent Implementation
// ============================================================================

export class ActionAgent {
  private readonly agentId: string;
  private readonly userId: string;
  private stateMachine!: AgentStateMachine;
  private readonly memory: AgentMemoryManager;

  // Reasoning components
  private readonly goalDecomposer: GoalDecomposer;
  private readonly planGenerator: PlanGenerator;
  private readonly confidenceScorer: ConfidenceScorer;
  private readonly iterationController: IterationController;

  // Tool components
  private readonly toolSelector: ToolSelector;
  private readonly toolExecutor: ToolExecutor;

  // Execution state
  private context: ActionContext;
  private plan: Plan | null = null;
  private startTime: number = 0;
  private iterations: number = 0;

  constructor(config: ActionAgentConfig) {
    this.agentId = `action-${randomUUID().slice(0, 8)}`;
    this.userId = config.user_id;

    // Initialize memory manager
    this.memory = createMemoryManager({
      agent_name: 'action',
      task_id: this.agentId,
      user_id: this.userId,
    });

    // Initialize reasoning components
    this.goalDecomposer = createGoalDecomposer({ model: 'gpt-4o-mini' });
    this.planGenerator = createPlanGenerator({
      model: 'gpt-4o-mini',
      max_steps: 10,
      default_confidence_threshold: 0.6,
      default_max_iterations: 10,
    });
    this.confidenceScorer = createConfidenceScorer({
      model: 'gpt-4o-mini',
      default_threshold: 0.6,
      strict_mode: false,
    });

    // Initialize tool components
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
          max_iterations: 10,
          confidence_threshold: 0.6,
          max_duration_ms: 180000, // 3 minutes
          convergence_threshold: 0.02,
          max_degradations: 2,
        },
        enable_adaptation: true,
        adaptation_cooldown_ms: 5000,
        checkpoint_interval: 2,
      }
    );

    // Initialize context
    this.context = {
      config,
      current_step: 'init',
      applications: [],
      skipped: [],
      followups: [],
      prioritized: [],
      errors: [],
      tools_used: new Set(),
    };

    // Register tools
    registerActionTools();

    // Subscribe to job match events
    this.subscribeToEvents();
  }

  /**
   * Subscribe to relevant message bus events
   */
  private subscribeToEvents(): void {
    messageBus.subscribe(MessageTopics.JOB_MATCH_FOUND, async (payload: MessagePayloads['job_match_found']) => {
      if (payload.user_id === this.userId) {
        console.log(`[Action:${this.agentId}] Received job match event for ${payload.job_id}`);
        // Could trigger auto-apply workflow here
      }
    });
  }

  /**
   * Execute single job application
   */
  async applyToJob(): Promise<ActionResult> {
    this.startTime = Date.now();
    this.iterations = 0;

    const config = this.context.config;
    if (!config.job_listing_id || !config.match_data) {
      throw new Error('job_listing_id and match_data required for single_apply mode');
    }

    console.log(`[Action:${this.agentId}] Starting job application for ${config.job_listing_id}`);

    try {
      // Initialize state machine
      this.stateMachine = await createStateMachine({
        agent_name: 'action',
        user_id: this.userId,
        task_id: this.agentId,
      });

      // Transition to START
      await this.stateMachine.transition({
        type: 'START',
        payload: { task_id: this.agentId },
      });

      // Load relevant memories
      await this.loadMemories();

      // Transition to INIT_COMPLETE
      await this.stateMachine.transition({
        type: 'INIT_COMPLETE',
        payload: { context_loaded: true },
      });

      // Phase 1: Validation checks
      this.context.current_step = 'validation';
      const validation = await this.runValidationChecks(config.job_listing_id);
      if (!validation.can_proceed) {
        this.context.skipped.push({
          job_id: config.job_listing_id,
          reason: validation.reason,
        });
        return this.buildResult();
      }

      // Phase 2: Evaluate application
      this.context.current_step = 'evaluation';
      const evaluation = await this.evaluateApplication(
        config.job_listing_id,
        config.match_data
      );

      if (evaluation.should_apply === 'no') {
        this.context.skipped.push({
          job_id: config.job_listing_id,
          reason: `Evaluation: ${evaluation.reasons.join(', ')}`,
        });
        return this.buildResult();
      }

      // Phase 3: Generate cover letter
      this.context.current_step = 'cover_letter';
      const coverLetter = await this.generateCoverLetter(
        config.job_listing_id,
        config.match_data
      );

      // Phase 4: Create application
      this.context.current_step = 'create_application';
      const application = await this.createApplication(
        config.job_listing_id,
        coverLetter,
        config.match_data.match_score,
        evaluation.should_apply === 'yes' ? 'applied' : 'draft'
      );

      this.context.applications.push(application);

      // Store episode
      await this.storeEpisode('application_created', {
        job_id: config.job_listing_id,
        application_id: application.id,
        match_score: config.match_data.match_score,
        status: application.status,
      });

      // Publish event
      await messageBus.publish(MessageTopics.APPLICATION_SUBMITTED, {
        user_id: this.userId,
        application_id: application.id,
        job_id: config.job_listing_id,
        company: application.company,
        status: application.status,
      });

      // Transition to EVALUATION_PASS (success)
      await this.stateMachine.transition({
        type: 'EVALUATION_PASS',
        payload: { confidence: 0.9 },
      });

      return this.buildResult();
    } catch (error) {
      await this.handleError(error as Error);
      return this.buildResult();
    }
  }

  /**
   * Apply to multiple jobs in batch
   */
  async batchApply(jobIds: string[]): Promise<ActionResult> {
    this.startTime = Date.now();
    this.iterations = 0;
    const maxApplications = this.context.config.max_applications || 5;

    console.log(`[Action:${this.agentId}] Starting batch apply for ${jobIds.length} jobs`);

    try {
      // Initialize state machine
      this.stateMachine = await createStateMachine({
        agent_name: 'action',
        user_id: this.userId,
        task_id: this.agentId,
      });

      // Transition to START
      await this.stateMachine.transition({
        type: 'START',
        payload: { task_id: this.agentId },
      });

      await this.stateMachine.transition({
        type: 'INIT_COMPLETE',
        payload: { context_loaded: true },
      });

      // Check daily limit
      const limitCheck = await this.executeTool('daily_limit_checker', {
        user_id: this.userId,
      });

      if (!limitCheck.success) {
        this.context.errors.push(`Daily limit check failed: ${limitCheck.error || 'Unknown error'}`);
        return this.buildResult();
      }

      const limitOutput = limitCheck.output as { can_apply: boolean; remaining: number } | undefined;
      if (!limitOutput?.can_apply) {
        this.context.errors.push('Daily application limit reached');
        return this.buildResult();
      }

      const remainingCapacity = Math.min(
        limitOutput.remaining,
        maxApplications
      );

      // Prioritize jobs first
      const prioritization = await this.executeTool('application_prioritizer', {
        user_id: this.userId,
        job_ids: jobIds.slice(0, 10),
      });

      // Handle prioritization failure gracefully - use original order
      const prioritizationOutput = prioritization.success
        ? (prioritization.output as { prioritized: Array<{ id: string; rank: number; apply_urgency: string; reasoning: string }> } | undefined)
        : undefined;
      const prioritizedJobs = prioritizationOutput?.prioritized || jobIds.map((id, idx) => ({ id, rank: idx + 1, apply_urgency: 'medium', reasoning: 'Default order (prioritization unavailable)' }));

      // Apply to top priority jobs up to limit
      let applied = 0;
      for (const priorityJob of prioritizedJobs) {
        if (applied >= remainingCapacity) break;

        const jobId = priorityJob.id;

        // Run validation
        const validation = await this.runValidationChecks(jobId);
        if (!validation.can_proceed) {
          this.context.skipped.push({
            job_id: jobId,
            reason: validation.reason,
          });
          continue;
        }

        // For batch, we need to calculate match data
        // In production, this would come from the sentinel agent
        const matchData = {
          match_score: 75, // Would be calculated
          matching_skills: [],
          missing_skills: [],
        };

        // Evaluate
        const evaluation = await this.evaluateApplication(jobId, matchData);
        if (evaluation.should_apply === 'no') {
          this.context.skipped.push({
            job_id: jobId,
            reason: evaluation.reasons[0] || 'Not recommended',
          });
          continue;
        }

        // Generate cover letter and create application
        const coverLetter = await this.generateCoverLetter(jobId, matchData);
        const application = await this.createApplication(
          jobId,
          coverLetter,
          matchData.match_score,
          'applied'
        );

        this.context.applications.push(application);
        applied++;

        // Respect rate limits
        await this.sleep(500);
      }

      // Store prioritized list
      interface PrioritizedJob {
        id: string;
        rank: number;
        apply_urgency: string;
        reasoning: string;
      }
      this.context.prioritized = prioritizedJobs.map((p: PrioritizedJob) => ({
        id: p.id,
        rank: p.rank,
        urgency: p.apply_urgency,
        reasoning: p.reasoning,
      }));

      await this.stateMachine.transition({
        type: 'EVALUATION_PASS',
        payload: { confidence: 0.85 },
      });

      return this.buildResult();
    } catch (error) {
      await this.handleError(error as Error);
      return this.buildResult();
    }
  }

  /**
   * Analyze follow-up opportunities
   */
  async analyzeFollowUps(applicationIds: string[]): Promise<ActionResult> {
    this.startTime = Date.now();
    this.iterations = 0;

    console.log(`[Action:${this.agentId}] Analyzing follow-ups for ${applicationIds.length} applications`);

    try {
      // Initialize state machine
      this.stateMachine = await createStateMachine({
        agent_name: 'action',
        user_id: this.userId,
        task_id: this.agentId,
      });

      await this.stateMachine.transition({
        type: 'START',
        payload: { task_id: this.agentId },
      });

      await this.stateMachine.transition({
        type: 'INIT_COMPLETE',
        payload: { context_loaded: true },
      });

      for (const appId of applicationIds) {
        try {
          const analysis = await this.executeTool('followup_analyzer', {
            application_id: appId,
          });

          if (!analysis.success) {
            this.context.errors.push(`Follow-up analysis failed for ${appId}: ${analysis.error || 'Tool execution failed'}`);
            continue;
          }

          const analysisOutput = analysis.output as { should_followup: boolean; timing: string; method: string } | undefined;
          if (analysisOutput) {
            this.context.followups.push({
              application_id: appId,
              should_followup: analysisOutput.should_followup,
              timing: analysisOutput.timing,
              method: analysisOutput.method,
            });
          }
        } catch (error) {
          this.context.errors.push(`Follow-up analysis failed for ${appId}: ${(error as Error).message}`);
        }
      }

      await this.stateMachine.transition({
        type: 'EVALUATION_PASS',
        payload: { confidence: 0.8 },
      });

      return this.buildResult();
    } catch (error) {
      await this.handleError(error as Error);
      return this.buildResult();
    }
  }

  /**
   * Prioritize job opportunities
   */
  async prioritizeJobs(jobIds: string[]): Promise<ActionResult> {
    this.startTime = Date.now();
    this.iterations = 0;

    console.log(`[Action:${this.agentId}] Prioritizing ${jobIds.length} jobs`);

    try {
      // Initialize state machine
      this.stateMachine = await createStateMachine({
        agent_name: 'action',
        user_id: this.userId,
        task_id: this.agentId,
      });

      await this.stateMachine.transition({
        type: 'START',
        payload: { task_id: this.agentId },
      });

      await this.stateMachine.transition({
        type: 'INIT_COMPLETE',
        payload: { context_loaded: true },
      });

      const result = await this.executeTool('application_prioritizer', {
        user_id: this.userId,
        job_ids: jobIds,
      });

      interface PrioritizedResult {
        id: string;
        rank: number;
        apply_urgency: string;
        reasoning: string;
      }
      const prioritizeOutput = result.output as { prioritized: PrioritizedResult[] } | undefined;
      if (prioritizeOutput) {
        this.context.prioritized = prioritizeOutput.prioritized.map((p: PrioritizedResult) => ({
          id: p.id,
          rank: p.rank,
          urgency: p.apply_urgency,
          reasoning: p.reasoning,
        }));
      }

      await this.stateMachine.transition({
        type: 'EVALUATION_PASS',
        payload: { confidence: 0.9 },
      });

      return this.buildResult();
    } catch (error) {
      await this.handleError(error as Error);
      return this.buildResult();
    }
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  private async loadMemories(): Promise<void> {
    // Load recent application episodes
    const episodes = await this.memory.recallEpisodes({
      limit: 10,
      min_importance: 0.3,
    });

    // Extract patterns from recent applications
    const recentCompanies = new Set<string>();
    for (const episode of episodes) {
      if (episode.outcome?.result_summary) {
        // Parse company from result
        const match = episode.outcome.result_summary.match(/company: (\w+)/);
        if (match) {
          recentCompanies.add(match[1]);
        }
      }
    }

    // Store in working memory for later use
    await this.memory.setWorking('recent_companies', Array.from(recentCompanies));
    await this.memory.setWorking('application_procedure', [
      {
        order: 1,
        action: 'Check daily limit',
        params: { tool: 'daily_limit_checker' },
        success_criteria: 'can_apply === true',
      },
      {
        order: 2,
        action: 'Check duplicates',
        params: { tool: 'duplicate_checker' },
        success_criteria: 'already_applied === false',
      },
      {
        order: 3,
        action: 'Check company exclusion',
        params: { tool: 'company_exclusion_checker' },
        success_criteria: 'is_excluded === false',
      },
      {
        order: 4,
        action: 'Evaluate application fit',
        params: { tool: 'application_evaluator' },
        success_criteria: 'should_apply !== "no"',
      },
      {
        order: 5,
        action: 'Generate cover letter',
        params: { tool: 'cover_letter_generator' },
        success_criteria: 'cover_letter.length > 100',
      },
      {
        order: 6,
        action: 'Create application',
        params: { tool: 'application_creator' },
        success_criteria: 'success === true',
      },
    ]);
  }

  private async runValidationChecks(jobId: string): Promise<{
    can_proceed: boolean;
    reason: string;
  }> {
    // Check daily limit
    const limitResult = await this.executeTool('daily_limit_checker', {
      user_id: this.userId,
    });

    const limitOutput = limitResult.output as { can_apply: boolean } | undefined;
    if (!limitOutput?.can_apply) {
      return { can_proceed: false, reason: 'Daily application limit reached' };
    }

    // Check duplicates
    const dupResult = await this.executeTool('duplicate_checker', {
      user_id: this.userId,
      job_listing_id: jobId,
    });

    const dupOutput = dupResult.output as { already_applied: boolean } | undefined;
    if (dupOutput?.already_applied) {
      return { can_proceed: false, reason: 'Already applied to this job' };
    }

    // Check company exclusion (would need job data)
    // For now, skip this check or implement separately

    return { can_proceed: true, reason: 'All validation checks passed' };
  }

  private async evaluateApplication(
    jobId: string,
    matchData: { match_score: number; matching_skills: string[]; missing_skills: string[] }
  ): Promise<{
    should_apply: 'yes' | 'no' | 'maybe';
    confidence: number;
    reasons: string[];
    concerns: string[];
    suggested_approach: string;
    priority: string;
  }> {
    const result = await this.executeTool('application_evaluator', {
      user_id: this.userId,
      job_listing_id: jobId,
      match_score: matchData.match_score,
      matching_skills: matchData.matching_skills,
      missing_skills: matchData.missing_skills,
    });

    type EvalOutput = {
      should_apply: 'yes' | 'no' | 'maybe';
      confidence: number;
      reasons: string[];
      concerns: string[];
      suggested_approach: string;
      priority: string;
    };
    return (result.output as EvalOutput) || {
      should_apply: 'no',
      confidence: 0,
      reasons: ['Evaluation failed'],
      concerns: [],
      suggested_approach: 'wait',
      priority: 'low',
    };
  }

  private async generateCoverLetter(
    jobId: string,
    matchData: { match_score: number; matching_skills: string[]; missing_skills: string[] }
  ): Promise<string> {
    const result = await this.executeTool('cover_letter_generator', {
      user_id: this.userId,
      job_listing_id: jobId,
      matching_skills: matchData.matching_skills,
      missing_skills: matchData.missing_skills,
      match_score: matchData.match_score,
    });

    const coverOutput = result.output as { cover_letter: string } | undefined;
    return coverOutput?.cover_letter || '';
  }

  private async createApplication(
    jobId: string,
    coverLetter: string,
    matchScore: number,
    status: 'draft' | 'applied'
  ): Promise<{
    id: string;
    job_id: string;
    company: string;
    role: string;
    status: string;
    cover_letter_preview: string;
  }> {
    const result = await this.executeTool('application_creator', {
      user_id: this.userId,
      job_listing_id: jobId,
      cover_letter: coverLetter,
      status,
      match_score: matchScore,
    });

    const createOutput = result.output as { application_id: string } | undefined;
    // Fetch created application for details
    return {
      id: createOutput?.application_id || '',
      job_id: jobId,
      company: 'Company', // Would be fetched from job
      role: 'Role',
      status,
      cover_letter_preview: coverLetter.slice(0, 200),
    };
  }

  private async executeTool(
    toolId: string,
    params: Record<string, unknown>
  ): Promise<ExecutionResult> {
    this.context.tools_used.add(toolId);
    this.iterations++;

    const result = await this.toolExecutor.execute(
      toolId,
      params,
      {
        timeout_ms: 30000,
        max_retries: 1,
      }
    );

    if (!result.success) {
      console.error(`[Action:${this.agentId}] Tool ${toolId} failed:`, result.error);
    }

    return result;
  }

  private async storeEpisode(eventType: string, metadata: Record<string, unknown>): Promise<void> {
    await this.memory.recordEpisode({
      episode_type: eventType,
      action_taken: `Action agent: ${eventType}`,
      context: {
        trigger_event: this.context.config.mode,
        input_summary: JSON.stringify(metadata).slice(0, 200),
        tools_used: Array.from(this.context.tools_used),
      },
      outcome: {
        success: true,
        result_summary: `${eventType} completed for job ${metadata.job_id}`,
        artifacts_created: metadata.application_id ? [metadata.application_id as string] : undefined,
      },
      confidence_score: 0.8,
    });
  }

  private async handleError(error: Error): Promise<void> {
    console.error(`[Action:${this.agentId}] Error:`, error);
    this.context.errors.push(error.message);

    try {
      await this.stateMachine.transition({
        type: 'STEP_FAILED',
        payload: { step_id: this.context.current_step, error: error.message },
      });
    } catch (e) {
      // State machine might not be initialized
      console.warn(`[Action:${this.agentId}] Could not transition state:`, e);
    }

    await this.memory.recordEpisode({
      episode_type: 'error',
      action_taken: `Action agent error in ${this.context.current_step}`,
      context: {
        trigger_event: this.context.config.mode,
        input_summary: error.message,
        tools_used: Array.from(this.context.tools_used),
      },
      outcome: {
        success: false,
        result_summary: `Error: ${error.message}`,
      },
      confidence_score: 0.3,
    });
  }

  private buildResult(): ActionResult {
    const duration = Date.now() - this.startTime;

    // Calculate confidence from components
    const baseConfidence = this.context.applications.length > 0 ? 0.8 : 0.5;
    const errorPenalty = this.context.errors.length * 0.1;
    const confidence = Math.max(0, Math.min(1, baseConfidence - errorPenalty));

    return {
      success: this.context.errors.length === 0,
      mode: this.context.config.mode,
      applications_created: this.context.applications.length,
      applications_skipped: this.context.skipped.length,
      applications: this.context.applications.length > 0 ? this.context.applications : undefined,
      followups: this.context.followups.length > 0 ? this.context.followups : undefined,
      prioritized_jobs: this.context.prioritized.length > 0 ? this.context.prioritized : undefined,
      stats: {
        duration_ms: duration,
        iterations: this.iterations,
        tools_used: Array.from(this.context.tools_used),
        confidence,
      },
      errors: this.context.errors.length > 0 ? this.context.errors : undefined,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return this.stateMachine.getState();
  }

  /**
   * Get agent ID
   */
  getId(): string {
    return this.agentId;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create Action Agent for single job application
 */
export function createApplicationAgent(
  userId: string,
  jobId: string,
  matchData: {
    match_score: number;
    matching_skills: string[];
    missing_skills: string[];
  }
): ActionAgent {
  return new ActionAgent({
    user_id: userId,
    job_listing_id: jobId,
    match_data: matchData,
    mode: 'single_apply',
  });
}

/**
 * Create Action Agent for batch applications
 */
export function createBatchApplicationAgent(
  userId: string,
  maxApplications: number = 5
): ActionAgent {
  return new ActionAgent({
    user_id: userId,
    mode: 'batch_apply',
    max_applications: maxApplications,
  });
}

/**
 * Create Action Agent for follow-up analysis
 */
export function createFollowUpAgent(userId: string): ActionAgent {
  return new ActionAgent({
    user_id: userId,
    mode: 'followup_check',
  });
}

/**
 * Create Action Agent for job prioritization
 */
export function createPrioritizationAgent(userId: string): ActionAgent {
  return new ActionAgent({
    user_id: userId,
    mode: 'prioritize',
  });
}

export default ActionAgent;
