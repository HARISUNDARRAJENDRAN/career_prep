/**
 * Strategist Agent Implementation
 *
 * Autonomous strategic oversight agent that:
 * 1. Monitors agent events globally for cross-domain patterns
 * 2. Detects skill gaps, declining trends, and milestones
 * 3. Triggers interventions (roadmap repaths, notifications, celebrations)
 * 4. Tracks career velocity and generates strategic recommendations
 *
 * @see docs/agentic-improvements/09-STRATEGIST_AGENT.md
 */

import { db } from '@/drizzle/db';
import {
  jobApplications,
  interviews,
  userSkills,
  roadmaps,
  agentEvents,
} from '@/drizzle/schema';
import { eq, desc, and, gte, count } from 'drizzle-orm';

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
} from '../../reasoning/plan-generator';
import {
  createConfidenceScorer,
  ConfidenceScorer,
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
import { registerStrategistTools, getStrategistToolIds } from './strategist-tools';
import { PatternDetector, type PatternMatch } from './pattern-detector';
import { VelocityTracker, type VelocityReport } from './velocity-tracker';
import { RejectionAnalyzer, type RejectionAnalysis } from './rejection-analyzer';

// ============================================================================
// Types
// ============================================================================

/**
 * Context for strategic analysis
 */
export interface StrategistContext {
  task_id: string;
  user_id: string;
  trigger_event?: string;
  include_recommendations?: boolean;
  include_interventions?: boolean;
}

/**
 * Strategic output with patterns and recommendations
 */
export interface StrategistOutput {
  patterns: PatternMatch[];
  velocity: VelocityMetrics;
  recommendations: StrategicRecommendation[];
  interventions: InterventionDecision[];
  health_score: number;
  overall_health: 'excellent' | 'good' | 'needs_attention' | 'concerning';
  executive_summary: string;
}

/**
 * Velocity metrics summary
 */
export interface VelocityMetrics {
  score: number;
  overall: 'high' | 'medium' | 'low' | 'stalled';
  is_stalled: boolean;
  days_inactive?: number;
  trends: {
    applications: { direction: string; change: number };
    interviews: { direction: string; change: number };
    progress: { direction: string; change: number };
  };
}

/**
 * Strategic recommendation
 */
export interface StrategicRecommendation {
  title: string;
  description: string;
  category: 'skill_development' | 'interview_prep' | 'application_strategy' | 'networking' | 'mindset';
  priority: number;
  expected_outcome: string;
  timeline?: string;
}

/**
 * Intervention decision
 */
export interface InterventionDecision {
  action: 'REPATH_ROADMAP' | 'NOTIFY_USER' | 'ADJUST_STRATEGY' | 'REQUEST_PRACTICE' | 'CELEBRATE' | 'NO_ACTION';
  reason: string;
  urgency: 'immediate' | 'soon' | 'when_convenient';
  payload?: Record<string, unknown>;
}

/**
 * Agent configuration
 */
export interface StrategistAgentConfig {
  max_iterations: number;
  confidence_threshold: number;
  timeout_ms: number;
  enable_learning: boolean;
  pattern_window_days: number;
  velocity_period_days: number;
}

/**
 * Result type
 */
export interface StrategistResult {
  success: boolean;
  output: StrategistOutput | null;
  iterations: number;
  confidence: number;
  duration_ms: number;
  reasoning_trace: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: StrategistAgentConfig = {
  max_iterations: 2,
  confidence_threshold: 0.75,
  timeout_ms: 120000, // 2 minutes
  enable_learning: true,
  pattern_window_days: 30,
  velocity_period_days: 7,
};

// ============================================================================
// Strategist Agent Class
// ============================================================================

export class StrategistAgent {
  private config: StrategistAgentConfig;
  private stateMachine: AgentStateMachine | null = null;
  private memory: AgentMemoryManager;
  private goalDecomposer: GoalDecomposer;
  private planGenerator: PlanGenerator;
  private confidenceScorer: ConfidenceScorer;
  private iterationController: IterationController;
  private toolSelector: ToolSelector;
  private toolExecutor: ToolExecutor;
  private reasoningTrace: string[] = [];

  // Strategic analysis components
  private patternDetector: PatternDetector | null = null;
  private velocityTracker: VelocityTracker | null = null;
  private rejectionAnalyzer: RejectionAnalyzer;

  constructor(
    private taskId: string,
    config: Partial<StrategistAgentConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.memory = createMemoryManager({
      agent_name: 'strategist',
      task_id: taskId,
    });

    this.goalDecomposer = createGoalDecomposer({ model: 'gpt-4o-mini' });
    this.planGenerator = createPlanGenerator({
      model: 'gpt-4o-mini',
      max_steps: 6,
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
      default_max_retries: 2,
      enable_logging: true,
    });

    this.iterationController = createIterationController(
      this.confidenceScorer,
      this.planGenerator,
      {
        conditions: {
          max_iterations: this.config.max_iterations,
          confidence_threshold: this.config.confidence_threshold,
          max_duration_ms: this.config.timeout_ms,
          convergence_threshold: 0.05,
          max_degradations: 1,
        },
        enable_adaptation: true,
        adaptation_cooldown_ms: 5000,
        checkpoint_interval: 1,
      }
    );

    // Initialize strategic components
    this.rejectionAnalyzer = new RejectionAnalyzer();

    // Register tools
    registerStrategistTools();
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Run strategic analysis for a user
   */
  async analyzeCareerProgress(context: StrategistContext): Promise<StrategistResult> {
    const startTime = Date.now();
    this.reasoningTrace = [];

    try {
      this.trace(`Starting strategic analysis for user ${context.user_id}`);

      // Initialize user-specific components
      this.patternDetector = new PatternDetector(
        context.user_id,
        this.config.pattern_window_days
      );
      this.velocityTracker = new VelocityTracker(
        context.user_id,
        this.config.velocity_period_days
      );

      // Initialize state machine
      this.stateMachine = await createStateMachine({
        agent_name: 'strategist',
        user_id: context.user_id,
        task_id: context.task_id,
      });

      await this.stateMachine.transition({
        type: 'START',
        payload: { task_id: context.task_id },
      });

      // Load memory context
      const memoryContext = await this.loadMemoryContext(context.user_id);
      this.trace(`Loaded ${memoryContext.previousAnalyses.length} previous analyses`);

      await this.memory.setWorking('analysis_context', context);

      await this.stateMachine.transition({
        type: 'INIT_COMPLETE',
        payload: { context_loaded: true },
      });

      // Phase 1: Pattern Detection
      this.trace('Phase 1: Detecting patterns...');
      const patterns = await this.patternDetector.detectAll();
      this.trace(`Detected ${patterns.length} patterns`);

      // Phase 2: Velocity Analysis
      this.trace('Phase 2: Analyzing velocity...');
      const [velocityReport, stallCheck] = await Promise.all([
        this.velocityTracker.generateReport(),
        this.velocityTracker.isStalled(),
      ]);
      this.trace(`Velocity score: ${velocityReport.velocity_score}, Stalled: ${stallCheck.stalled}`);

      // Phase 3: Synthesize recommendations
      let recommendations: StrategicRecommendation[] = [];
      if (context.include_recommendations !== false) {
        this.trace('Phase 3: Generating recommendations...');
        recommendations = await this.generateRecommendations(
          context.user_id,
          patterns,
          velocityReport
        );
        this.trace(`Generated ${recommendations.length} recommendations`);
      }

      // Phase 4: Decide interventions
      let interventions: InterventionDecision[] = [];
      if (context.include_interventions !== false) {
        this.trace('Phase 4: Deciding interventions...');
        interventions = await this.decideInterventions(patterns, velocityReport, stallCheck);
        this.trace(`Decided ${interventions.length} interventions`);
      }

      // Phase 5: Calculate health score
      const healthScore = this.calculateHealthScore(patterns, velocityReport);
      const overallHealth = this.categorizeHealth(healthScore);
      this.trace(`Health score: ${healthScore}, Overall: ${overallHealth}`);

      // Phase 6: Generate executive summary
      const executiveSummary = this.generateExecutiveSummary(
        patterns,
        velocityReport,
        healthScore,
        overallHealth
      );

      // Build output
      const output: StrategistOutput = {
        patterns,
        velocity: {
          score: velocityReport.velocity_score,
          overall: velocityReport.overall_velocity,
          is_stalled: stallCheck.stalled,
          days_inactive: stallCheck.days_inactive,
          trends: {
            applications: {
              direction: velocityReport.trends.applications.direction,
              change: velocityReport.trends.applications.change_percentage,
            },
            interviews: {
              direction: velocityReport.trends.interviews.direction,
              change: velocityReport.trends.interviews.change_percentage,
            },
            progress: {
              direction: velocityReport.trends.progress.direction,
              change: velocityReport.trends.progress.change_percentage,
            },
          },
        },
        recommendations,
        interventions,
        health_score: healthScore,
        overall_health: overallHealth,
        executive_summary: executiveSummary,
      };

      // Record learning
      if (this.config.enable_learning) {
        await this.recordLearning(context.user_id, output);
      }

      // Publish events for significant findings
      await this.publishStrategicEvents(context.user_id, output);

      // Execute immediate interventions
      await this.executeInterventions(context.user_id, interventions);

      await this.stateMachine.transition({
        type: 'EVALUATION_PASS',
        payload: { confidence: healthScore / 100 },
      });

      return {
        success: true,
        output,
        iterations: 1,
        confidence: healthScore / 100,
        duration_ms: Date.now() - startTime,
        reasoning_trace: this.reasoningTrace,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.trace(`Error: ${errorMessage}`);

      if (this.stateMachine) {
        await this.stateMachine.transition({
          type: 'STEP_FAILED',
          payload: { step_id: 'main', error: errorMessage },
        });
      }

      return {
        success: false,
        output: null,
        iterations: 0,
        confidence: 0,
        duration_ms: Date.now() - startTime,
        reasoning_trace: this.reasoningTrace,
      };
    } finally {
      await this.memory.clearWorking();
    }
  }

  /**
   * Process a specific event from the message bus
   */
  async processEvent(
    userId: string,
    eventType: string,
    eventPayload: Record<string, unknown>
  ): Promise<StrategistResult> {
    this.trace(`Processing event: ${eventType} for user ${userId}`);

    // Store event for pattern detection
    await this.memory.setWorking('current_event', {
      type: eventType,
      payload: eventPayload,
      timestamp: new Date(),
    });

    // Run full analysis
    return this.analyzeCareerProgress({
      task_id: crypto.randomUUID(),
      user_id: userId,
      trigger_event: eventType,
      include_recommendations: this.shouldGenerateRecommendations(eventType),
      include_interventions: true,
    });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async loadMemoryContext(userId: string): Promise<{
    previousAnalyses: unknown[];
    userPatterns: unknown[];
  }> {
    const [previousAnalyses, userPatterns] = await Promise.all([
      this.memory.recallEpisodes({ limit: 5 }),
      this.memory.recallFacts({ categories: ['pattern_learned'], limit: 10 }),
    ]);

    return {
      previousAnalyses: previousAnalyses || [],
      userPatterns: userPatterns || [],
    };
  }

  private async generateRecommendations(
    userId: string,
    patterns: PatternMatch[],
    velocity: VelocityReport
  ): Promise<StrategicRecommendation[]> {
    try {
      const result = await this.toolExecutor.execute('recommendation_generator', {
        user_id: userId,
        patterns: patterns.map(p => ({
          type: p.type,
          severity: p.severity,
          description: p.description,
        })),
        velocity: {
          score: velocity.velocity_score,
          overall: velocity.overall_velocity,
          recommendations: velocity.recommendations,
        },
        include_quick_wins: true,
      });

      if (result.success && result.output) {
        const output = result.output as {
          recommendations: StrategicRecommendation[];
        };
        return output.recommendations || [];
      }
    } catch (error) {
      this.trace(`Recommendation generation failed: ${error}`);
    }

    // Fallback to velocity-based recommendations
    return velocity.recommendations.map((rec, i) => ({
      title: `Action ${i + 1}`,
      description: rec,
      category: 'application_strategy' as const,
      priority: i + 1,
      expected_outcome: 'Improved career search momentum',
    }));
  }

  private async decideInterventions(
    patterns: PatternMatch[],
    velocity: VelocityReport,
    stallCheck: { stalled: boolean; days_inactive?: number }
  ): Promise<InterventionDecision[]> {
    const interventions: InterventionDecision[] = [];

    // Check for critical patterns
    const criticalPatterns = patterns.filter(p => p.severity === 'critical');
    const highPatterns = patterns.filter(p => p.severity === 'high');

    // Skill gap clusters -> REPATH_ROADMAP
    const skillGapClusters = patterns.filter(p => p.type === 'skill_gap_cluster');
    if (skillGapClusters.length > 0) {
      const mostSevere = skillGapClusters.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })[0];

      if (mostSevere.severity === 'critical' || mostSevere.severity === 'high') {
        interventions.push({
          action: 'REPATH_ROADMAP',
          reason: mostSevere.description,
          urgency: mostSevere.severity === 'critical' ? 'immediate' : 'soon',
          payload: { pattern: mostSevere.data },
        });
      }
    }

    // Declining trends -> REQUEST_PRACTICE
    const decliningTrends = patterns.filter(
      p => p.type === 'declining_trend' && p.severity !== 'low'
    );
    if (decliningTrends.length > 0) {
      interventions.push({
        action: 'REQUEST_PRACTICE',
        reason: 'Interview performance is declining - practice recommended',
        urgency: 'soon',
      });
    }

    // Stall detection -> NOTIFY_USER
    if (stallCheck.stalled) {
      interventions.push({
        action: 'NOTIFY_USER',
        reason: `No activity detected for ${stallCheck.days_inactive || 7}+ days`,
        urgency: (stallCheck.days_inactive || 7) > 14 ? 'immediate' : 'soon',
        payload: { days_inactive: stallCheck.days_inactive },
      });
    }

    // Velocity drop -> NOTIFY_USER
    const velocityDrops = patterns.filter(p => p.type === 'velocity_drop');
    if (velocityDrops.length > 0) {
      interventions.push({
        action: 'NOTIFY_USER',
        reason: 'Application velocity has dropped significantly',
        urgency: 'soon',
        payload: { pattern: velocityDrops[0].data },
      });
    }

    // Milestones -> CELEBRATE
    const milestones = patterns.filter(p => p.type === 'milestone');
    for (const milestone of milestones) {
      interventions.push({
        action: 'CELEBRATE',
        reason: milestone.description,
        urgency: 'when_convenient',
        payload: { milestone: milestone.data },
      });
    }

    // No critical issues -> NO_ACTION (only if no other interventions)
    if (interventions.length === 0) {
      interventions.push({
        action: 'NO_ACTION',
        reason: 'Career search is progressing well - no intervention needed',
        urgency: 'when_convenient',
      });
    }

    return interventions;
  }

  private calculateHealthScore(patterns: PatternMatch[], velocity: VelocityReport): number {
    let score = 50; // Base score

    // Velocity contribution (0-30 points)
    score += Math.min(30, velocity.velocity_score * 0.3);

    // Pattern penalties
    for (const pattern of patterns) {
      if (pattern.type === 'milestone') {
        score += 5; // Milestones add points
      } else if (pattern.severity === 'critical') {
        score -= 15;
      } else if (pattern.severity === 'high') {
        score -= 10;
      } else if (pattern.severity === 'medium') {
        score -= 5;
      }
    }

    // Trend bonuses/penalties
    if (velocity.trends.applications.direction === 'accelerating') score += 5;
    if (velocity.trends.applications.direction === 'decelerating') score -= 5;
    if (velocity.trends.interviews.direction === 'accelerating') score += 5;
    if (velocity.trends.interviews.direction === 'decelerating') score -= 5;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private categorizeHealth(score: number): 'excellent' | 'good' | 'needs_attention' | 'concerning' {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'needs_attention';
    return 'concerning';
  }

  private generateExecutiveSummary(
    patterns: PatternMatch[],
    velocity: VelocityReport,
    healthScore: number,
    overallHealth: string
  ): string {
    const criticalPatterns = patterns.filter(p => p.severity === 'critical').length;
    const highPatterns = patterns.filter(p => p.severity === 'high').length;
    const milestones = patterns.filter(p => p.type === 'milestone').length;

    let summary = `Career search health: ${overallHealth} (${healthScore}/100). `;

    if (velocity.overall_velocity === 'stalled') {
      summary += 'Activity has stalled - re-engagement needed. ';
    } else if (velocity.overall_velocity === 'high') {
      summary += 'Strong momentum with consistent activity. ';
    } else if (velocity.overall_velocity === 'low') {
      summary += 'Activity levels are below optimal. ';
    }

    if (criticalPatterns > 0) {
      summary += `${criticalPatterns} critical issue(s) require immediate attention. `;
    }
    if (highPatterns > 0) {
      summary += `${highPatterns} high-priority area(s) to address. `;
    }
    if (milestones > 0) {
      summary += `Congratulations on ${milestones} milestone(s) achieved! `;
    }

    if (velocity.recommendations.length > 0) {
      summary += `Top priority: ${velocity.recommendations[0]}`;
    }

    return summary;
  }

  private shouldGenerateRecommendations(eventType: string): boolean {
    // Generate recommendations for significant events
    const significantEvents = [
      'REJECTION_RECEIVED',
      'INTERVIEW_COMPLETED',
      'MODULE_COMPLETED',
      'SKILL_VERIFIED',
      'MARKET_UPDATE',
    ];
    return significantEvents.includes(eventType);
  }

  private async publishStrategicEvents(
    userId: string,
    output: StrategistOutput
  ): Promise<void> {
    // Publish critical pattern detected event
    const criticalPatterns = output.patterns.filter(p => p.severity === 'critical');
    if (criticalPatterns.length > 0) {
      await publishAgentEvent({
        type: 'CRITICAL_PATTERN_DETECTED',
        payload: {
          user_id: userId,
          patterns: criticalPatterns.map(p => ({
            type: p.type,
            description: p.description,
          })),
          health_score: output.health_score,
        },
      });
    }

    // Publish milestone events
    const milestones = output.patterns.filter(p => p.type === 'milestone');
    for (const milestone of milestones) {
      await publishAgentEvent({
        type: 'MILESTONE_ACHIEVED',
        payload: {
          user_id: userId,
          milestone_type: (milestone.data as { type?: string })?.type || 'unknown',
          description: milestone.description,
        },
      });
    }

    // Publish stall detection event
    if (output.velocity.is_stalled) {
      await publishAgentEvent({
        type: 'USER_STALLED',
        payload: {
          user_id: userId,
          days_inactive: output.velocity.days_inactive,
          last_velocity_score: output.velocity.score,
        },
      });
    }
  }

  private async executeInterventions(
    userId: string,
    interventions: InterventionDecision[]
  ): Promise<void> {
    for (const intervention of interventions) {
      if (intervention.urgency !== 'immediate') continue;

      switch (intervention.action) {
        case 'REPATH_ROADMAP':
          // Trigger roadmap regeneration
          await publishAgentEvent({
            type: 'ROADMAP_REPATH_REQUESTED',
            payload: {
              user_id: userId,
              reason: intervention.reason,
              trigger: 'strategist_intervention',
              ...intervention.payload,
            },
          });
          this.trace(`Triggered roadmap repath for user ${userId}`);
          break;

        case 'NOTIFY_USER':
          // Would integrate with notification system
          this.trace(`User notification queued: ${intervention.reason}`);
          break;

        case 'REQUEST_PRACTICE':
          // Trigger practice session recommendation
          await publishAgentEvent({
            type: 'PRACTICE_RECOMMENDED',
            payload: {
              user_id: userId,
              reason: intervention.reason,
            },
          });
          this.trace(`Practice session recommended for user ${userId}`);
          break;

        case 'CELEBRATE':
          // Would trigger celebration UI/notification
          this.trace(`Celebration triggered: ${intervention.reason}`);
          break;
      }
    }
  }

  private async recordLearning(userId: string, output: StrategistOutput): Promise<void> {
    await this.memory.recordEpisode({
      episode_type: 'strategic_analysis',
      action_taken: 'analyze_career_progress',
      context: {
        trigger_event: 'strategist_execution',
        input_summary: `User: ${userId}`,
      },
      outcome: {
        success: true,
        result_summary: `Health: ${output.overall_health}, Score: ${output.health_score}`,
        metrics: {
          health_score: output.health_score,
          patterns_detected: output.patterns.length,
          interventions: output.interventions.length,
        },
      },
    });

    // Store strategic fact
    await this.memory.rememberFact({
      category: 'pattern_learned',
      fact: `User health score: ${output.health_score}, Status: ${output.overall_health}`,
      confidence: output.health_score / 100,
      metadata: {
        tags: ['strategic_insight', userId],
        related_facts: [],
      },
    });
  }

  private trace(message: string): void {
    const timestamp = new Date().toISOString();
    this.reasoningTrace.push(`[${timestamp}] ${message}`);
    console.log(`[StrategistAgent] ${message}`);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createStrategistAgent(
  taskId: string,
  config?: Partial<StrategistAgentConfig>
): StrategistAgent {
  return new StrategistAgent(taskId, config);
}

/**
 * Quick career analysis function
 */
export async function analyzeCareerProgress(
  userId: string,
  options: {
    include_recommendations?: boolean;
    include_interventions?: boolean;
    config?: Partial<StrategistAgentConfig>;
  } = {}
): Promise<StrategistResult> {
  const taskId = crypto.randomUUID();
  const agent = createStrategistAgent(taskId, options.config);

  return agent.analyzeCareerProgress({
    task_id: taskId,
    user_id: userId,
    include_recommendations: options.include_recommendations,
    include_interventions: options.include_interventions,
  });
}

/**
 * Process a single event from the message bus
 */
export async function processStrategicEvent(
  userId: string,
  eventType: string,
  eventPayload: Record<string, unknown>,
  config?: Partial<StrategistAgentConfig>
): Promise<StrategistResult> {
  const taskId = crypto.randomUUID();
  const agent = createStrategistAgent(taskId, config);

  return agent.processEvent(userId, eventType, eventPayload);
}
