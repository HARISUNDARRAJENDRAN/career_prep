/**
 * Strategist Agent Tools
 *
 * Tool definitions for strategic analysis, pattern detection, and career recommendations.
 *
 * @see docs/agentic-improvements/09-STRATEGIST_AGENT.md
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { toolRegistry, type ToolDefinition } from '../../tools/tool-registry';
import { db } from '@/drizzle/db';
import {
  jobApplications,
  interviews,
  userSkills,
  roadmaps,
  roadmapModules,
  userProfiles,
  strategicDirectives,
} from '@/drizzle/schema';
import { eq, desc, and, gte, count } from 'drizzle-orm';
import {
  STRATEGIST_PROMPTS,
  buildRejectionAnalysisPrompt,
  buildPatternDetectionPrompt,
  buildRecommendationPrompt,
  buildSynthesisPrompt,
} from './strategist-prompts';
import { PatternDetector } from './pattern-detector';
import { RejectionAnalyzer } from './rejection-analyzer';
import { VelocityTracker } from './velocity-tracker';
import { safeJsonParseOrDefault } from '../../utils/safe-json';
import {
  issueDirective,
  issueFocusShiftDirective,
  issueSkillPriorityDirective,
  issueGhostingResponseDirective,
  issueRejectionInsightDirective,
  issueResumeRewriteDirective,
  issuePauseApplicationsDirective,
  type DirectiveType,
  type DirectivePriority,
} from '@/services/strategic-directives';

// ============================================================================
// Input/Output Schemas
// ============================================================================

const PatternDetectorInput = z.object({
  user_id: z.string(),
  time_window_days: z.number().optional().default(30),
});

const PatternDetectorOutput = z.object({
  patterns: z.array(z.object({
    type: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    description: z.string(),
    detected_at: z.date(),
    recommended_action: z.string().optional(),
  })),
  total_patterns: z.number(),
  critical_count: z.number(),
  requires_intervention: z.boolean(),
});

const RejectionAnalyzerInput = z.object({
  rejection_text: z.string(),
  job_title: z.string().optional(),
  company: z.string().optional(),
});

const RejectionAnalyzerOutput = z.object({
  rejection_type: z.enum([
    'skill_gap',
    'experience_mismatch',
    'cultural_fit',
    'competition',
    'generic',
    'unknown',
  ]),
  identified_gaps: z.array(z.object({
    skill: z.string(),
    mentioned_context: z.string(),
    importance: z.enum(['critical', 'high', 'medium', 'low']),
    category: z.enum(['technical', 'soft_skill', 'experience', 'cultural_fit']),
  })),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  is_actionable: z.boolean(),
  actionable_items: z.array(z.string()),
  summary: z.string(),
  confidence: z.number(),
});

const VelocityTrackerInput = z.object({
  user_id: z.string(),
  period_days: z.number().optional().default(7),
});

const VelocityTrackerOutput = z.object({
  velocity_score: z.number(),
  overall_velocity: z.enum(['high', 'medium', 'low', 'stalled']),
  trends: z.object({
    applications: z.object({
      direction: z.enum(['accelerating', 'stable', 'decelerating', 'stalled']),
      change_percentage: z.number(),
    }),
    interviews: z.object({
      direction: z.enum(['accelerating', 'stable', 'decelerating', 'stalled']),
      change_percentage: z.number(),
    }),
    progress: z.object({
      direction: z.enum(['accelerating', 'stable', 'decelerating', 'stalled']),
      change_percentage: z.number(),
    }),
  }),
  recommendations: z.array(z.string()),
  is_stalled: z.boolean(),
});

const RecommendationGeneratorInput = z.object({
  user_id: z.string(),
  patterns: z.array(z.record(z.string(), z.unknown())),
  velocity: z.record(z.string(), z.unknown()),
  include_quick_wins: z.boolean().optional().default(true),
});

const RecommendationGeneratorOutput = z.object({
  recommendations: z.array(z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum([
      'skill_development',
      'interview_prep',
      'application_strategy',
      'networking',
      'mindset',
    ]),
    priority: z.number(),
    expected_outcome: z.string(),
    timeline: z.string().optional(),
  })),
  quick_wins: z.array(z.string()),
  focus_areas: z.array(z.object({
    area: z.string(),
    reason: z.string(),
    time_allocation: z.string().optional(),
  })),
  encouragement: z.string(),
});

const SynthesisReportInput = z.object({
  user_id: z.string(),
  include_forecast: z.boolean().optional().default(true),
});

const SynthesisReportOutput = z.object({
  overall_health: z.enum(['excellent', 'good', 'needs_attention', 'concerning']),
  health_score: z.number(),
  key_insights: z.array(z.object({
    insight: z.string(),
    importance: z.enum(['high', 'medium', 'low']),
    action_required: z.boolean(),
  })),
  strengths: z.array(z.string()),
  improvement_areas: z.array(z.object({
    area: z.string(),
    current_state: z.string(),
    target_state: z.string(),
    gap_severity: z.enum(['critical', 'high', 'medium', 'low']),
  })),
  executive_summary: z.string(),
});

const InterventionDeciderInput = z.object({
  user_id: z.string(),
  patterns: z.array(z.record(z.string(), z.unknown())),
});

const InterventionDeciderOutput = z.object({
  interventions: z.array(z.object({
    pattern_id: z.string().optional(),
    action: z.enum([
      'REPATH_ROADMAP',
      'NOTIFY_USER',
      'ADJUST_STRATEGY',
      'REQUEST_PRACTICE',
      'CELEBRATE',
      'NO_ACTION',
    ]),
    reason: z.string(),
    urgency: z.enum(['immediate', 'soon', 'when_convenient']),
    payload: z.record(z.string(), z.unknown()).optional(),
  })),
  deferred_actions: z.array(z.object({
    action: z.string(),
    trigger_condition: z.string(),
    reason: z.string(),
  })),
  requires_immediate_action: z.boolean(),
});

const StallDetectorInput = z.object({
  user_id: z.string(),
});

const StallDetectorOutput = z.object({
  is_stalled: z.boolean(),
  reason: z.string().optional(),
  days_inactive: z.number().optional(),
  last_activity_type: z.string().optional(),
  recommended_action: z.string().optional(),
});

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Pattern Detector Tool - Detects cross-domain patterns
 */
const patternDetectorTool: ToolDefinition<
  z.infer<typeof PatternDetectorInput>,
  z.infer<typeof PatternDetectorOutput>
> = {
  id: 'pattern_detector',
  name: 'Pattern Detector',
  description: 'Detect patterns across rejections, interviews, and career progress',
  version: '1.0.0',
  category: 'analysis',
  tags: ['patterns', 'analysis', 'strategy', 'detection'],
  input_schema: PatternDetectorInput,
  output_schema: PatternDetectorOutput,
  handler: async (input) => {
    const detector = new PatternDetector(input.user_id, input.time_window_days);
    const patterns = await detector.detectAll();

    const criticalCount = patterns.filter(p => p.severity === 'critical').length;
    const highCount = patterns.filter(p => p.severity === 'high').length;

    return {
      patterns: patterns.map(p => ({
        type: p.type,
        severity: p.severity,
        description: p.description,
        detected_at: p.detected_at,
        recommended_action: p.recommended_action,
      })),
      total_patterns: patterns.length,
      critical_count: criticalCount,
      requires_intervention: criticalCount > 0 || highCount >= 2,
    };
  },
  cost: { latency_ms: 2000, tokens: 0 },
  requires: [],
  best_for: [
    'Detecting skill gap clusters across rejections',
    'Identifying declining performance trends',
    'Finding milestones to celebrate',
    'Detecting application velocity drops',
  ],
  not_suitable_for: [
    'Real-time monitoring',
    'Individual rejection analysis',
  ],
  examples: [
    {
      goal: 'Find patterns in career progress',
      input: { user_id: 'user_123', time_window_days: 30 },
      output: {
        patterns: [{ type: 'skill_gap_cluster', severity: 'high', description: 'System design mentioned 5 times' }],
        total_patterns: 1,
        critical_count: 0,
        requires_intervention: false,
      },
    },
  ],
  enabled: true,
};

/**
 * Rejection Analyzer Tool - AI-powered rejection analysis
 */
const rejectionAnalyzerTool: ToolDefinition<
  z.infer<typeof RejectionAnalyzerInput>,
  z.infer<typeof RejectionAnalyzerOutput>
> = {
  id: 'rejection_analyzer',
  name: 'Rejection Analyzer',
  description: 'Analyze rejection feedback to extract skill gaps and actionable insights',
  version: '1.0.0',
  category: 'analysis',
  tags: ['rejection', 'feedback', 'skills', 'ai'],
  input_schema: RejectionAnalyzerInput,
  output_schema: RejectionAnalyzerOutput,
  handler: async (input) => {
    const analyzer = new RejectionAnalyzer();
    const analysis = await analyzer.analyze(input.rejection_text);

    return {
      rejection_type: analysis.rejection_type,
      identified_gaps: analysis.identified_gaps,
      sentiment: analysis.sentiment,
      is_actionable: analysis.is_actionable,
      actionable_items: analysis.actionable_items,
      summary: analysis.summary,
      confidence: analysis.confidence,
    };
  },
  cost: { latency_ms: 2000, tokens: 500 },
  requires: [],
  best_for: [
    'Extracting skill gaps from rejection emails',
    'Identifying actionable feedback from recruiters',
    'Categorizing rejection reasons',
  ],
  not_suitable_for: [
    'Batch processing many rejections',
    'Pattern detection across rejections',
  ],
  examples: [
    {
      goal: 'Analyze rejection feedback',
      input: {
        rejection_text: 'We decided to proceed with candidates who have more experience in distributed systems.',
        job_title: 'Senior Backend Engineer',
      },
      output: {
        rejection_type: 'skill_gap',
        identified_gaps: [{ skill: 'distributed_systems', importance: 'high' }],
        is_actionable: true,
      },
    },
  ],
  enabled: true,
};

/**
 * Velocity Tracker Tool - Track career velocity metrics
 */
const velocityTrackerTool: ToolDefinition<
  z.infer<typeof VelocityTrackerInput>,
  z.infer<typeof VelocityTrackerOutput>
> = {
  id: 'velocity_tracker',
  name: 'Velocity Tracker',
  description: 'Track and analyze career progression velocity over time',
  version: '1.0.0',
  category: 'analysis',
  tags: ['velocity', 'metrics', 'progress', 'tracking'],
  input_schema: VelocityTrackerInput,
  output_schema: VelocityTrackerOutput,
  handler: async (input) => {
    const tracker = new VelocityTracker(input.user_id, input.period_days);
    const [report, stallCheck] = await Promise.all([
      tracker.generateReport(),
      tracker.isStalled(),
    ]);

    return {
      velocity_score: report.velocity_score,
      overall_velocity: report.overall_velocity,
      trends: {
        applications: {
          direction: report.trends.applications.direction,
          change_percentage: report.trends.applications.change_percentage,
        },
        interviews: {
          direction: report.trends.interviews.direction,
          change_percentage: report.trends.interviews.change_percentage,
        },
        progress: {
          direction: report.trends.progress.direction,
          change_percentage: report.trends.progress.change_percentage,
        },
      },
      recommendations: report.recommendations,
      is_stalled: stallCheck.stalled,
    };
  },
  cost: { latency_ms: 1000, tokens: 0 },
  requires: [],
  best_for: [
    'Measuring weekly application velocity',
    'Detecting activity stalls',
    'Comparing period-over-period performance',
  ],
  not_suitable_for: [
    'Real-time activity tracking',
    'Detailed pattern analysis',
  ],
  examples: [
    {
      goal: 'Check career velocity',
      input: { user_id: 'user_123', period_days: 7 },
      output: {
        velocity_score: 75,
        overall_velocity: 'high',
        is_stalled: false,
      },
    },
  ],
  enabled: true,
};

/**
 * Recommendation Generator Tool - AI-powered strategic recommendations
 */
const recommendationGeneratorTool: ToolDefinition<
  z.infer<typeof RecommendationGeneratorInput>,
  z.infer<typeof RecommendationGeneratorOutput>
> = {
  id: 'recommendation_generator',
  name: 'Recommendation Generator',
  description: 'Generate strategic recommendations based on patterns and velocity',
  version: '1.0.0',
  category: 'analysis',
  tags: ['recommendations', 'strategy', 'ai', 'planning'],
  input_schema: RecommendationGeneratorInput,
  output_schema: RecommendationGeneratorOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    // Get user context
    const [skillsResult, roadmapResult] = await Promise.all([
      db.select({ count: count() })
        .from(userSkills)
        .where(eq(userSkills.user_id, input.user_id)),
      db.query.roadmaps.findFirst({
        where: eq(roadmaps.user_id, input.user_id),
        orderBy: [desc(roadmaps.created_at)],
      }),
    ]);

    const userContext = {
      total_skills: skillsResult[0]?.count || 0,
      has_roadmap: !!roadmapResult,
      target_role: roadmapResult?.target_role || 'Unknown',
    };

    const prompt = buildRecommendationPrompt({
      patterns: input.patterns,
      velocity: input.velocity,
      userContext,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: STRATEGIST_PROMPTS.SYSTEM_CONTEXT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from recommendation generator');
    }

    const parsed = safeJsonParseOrDefault<{
      recommendations?: Array<{
        title: string;
        description: string;
        category: string;
        priority: number;
        expected_outcome: string;
        timeline?: string;
      }>;
      quick_wins?: string[];
      focus_areas?: Array<{
        area: string;
        reason: string;
        time_allocation?: string;
      }>;
      encouragement?: string;
    }>(content, {});

    return {
      recommendations: (parsed.recommendations || []).map(r => ({
        title: r.title,
        description: r.description,
        category: r.category as 'skill_development' | 'interview_prep' | 'application_strategy' | 'networking' | 'mindset',
        priority: r.priority,
        expected_outcome: r.expected_outcome,
        timeline: r.timeline,
      })),
      quick_wins: parsed.quick_wins || [],
      focus_areas: parsed.focus_areas || [],
      encouragement: parsed.encouragement || 'Keep pushing forward - every application brings you closer to your goal!',
    };
  },
  cost: { latency_ms: 3000, tokens: 800 },
  requires: [],
  best_for: [
    'Generating personalized career recommendations',
    'Creating action plans from detected patterns',
    'Identifying quick wins for motivation',
  ],
  not_suitable_for: [
    'Pattern detection',
    'Data collection',
  ],
  examples: [],
  enabled: true,
};

/**
 * Synthesis Report Tool - Comprehensive strategic insight report
 */
const synthesisReportTool: ToolDefinition<
  z.infer<typeof SynthesisReportInput>,
  z.infer<typeof SynthesisReportOutput>
> = {
  id: 'synthesis_report',
  name: 'Synthesis Report',
  description: 'Generate comprehensive strategic insight report for career progress',
  version: '1.0.0',
  category: 'analysis',
  tags: ['report', 'synthesis', 'insights', 'strategy'],
  input_schema: SynthesisReportInput,
  output_schema: SynthesisReportOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    // Gather all data
    const detector = new PatternDetector(input.user_id, 30);
    const velocityTracker = new VelocityTracker(input.user_id, 7);
    const rejectionAnalyzer = new RejectionAnalyzer();

    const [patterns, velocityReport] = await Promise.all([
      detector.detectAll(),
      velocityTracker.generateReport(),
    ]);

    // Get recent rejections for analysis
    const recentRejections = await db.query.jobApplications.findMany({
      where: and(
        eq(jobApplications.user_id, input.user_id),
        eq(jobApplications.status, 'rejected'),
        gte(jobApplications.created_at, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      ),
      limit: 10,
    });

    const rejectionAnalyses = await rejectionAnalyzer.analyzeBatch(
      recentRejections.map(r => {
        const rawData = r.raw_data as { interview_notes?: string; email_threads?: Array<{ body: string }> } | null;
        let text = '';
        if (rawData?.interview_notes) {
          text = rawData.interview_notes;
        } else if (rawData?.email_threads?.length) {
          text = rawData.email_threads.map(e => e.body).join(' ');
        }
        return { id: r.id, text };
      })
    );

    const aggregatedRejections = rejectionAnalyzer.aggregateInsights(
      rejectionAnalyses.map(r => r.analysis)
    );

    // Get milestones
    const milestones = patterns.filter(p => p.type === 'milestone');

    const prompt = buildSynthesisPrompt({
      patterns,
      rejectionAnalysis: aggregatedRejections,
      velocityReport,
      milestones,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: STRATEGIST_PROMPTS.SYSTEM_CONTEXT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from synthesis report');
    }

    const parsed = safeJsonParseOrDefault<{
      overall_health?: string;
      health_score?: number;
      key_insights?: Array<{
        insight: string;
        importance: string;
        action_required: boolean;
      }>;
      strengths?: string[];
      improvement_areas?: Array<{
        area: string;
        current_state: string;
        target_state: string;
        gap_severity: string;
      }>;
      executive_summary?: string;
    }>(content, {});

    return {
      overall_health: (parsed.overall_health || 'needs_attention') as 'excellent' | 'good' | 'needs_attention' | 'concerning',
      health_score: parsed.health_score || 50,
      key_insights: (parsed.key_insights || []).map(i => ({
        insight: i.insight,
        importance: i.importance as 'high' | 'medium' | 'low',
        action_required: i.action_required,
      })),
      strengths: parsed.strengths || [],
      improvement_areas: (parsed.improvement_areas || []).map(a => ({
        area: a.area,
        current_state: a.current_state,
        target_state: a.target_state,
        gap_severity: a.gap_severity as 'critical' | 'high' | 'medium' | 'low',
      })),
      executive_summary: parsed.executive_summary || 'Career search is in progress. Continue consistent effort for best results.',
    };
  },
  cost: { latency_ms: 5000, tokens: 1500 },
  requires: [],
  best_for: [
    'Generating executive summaries of career progress',
    'Providing holistic view of career search health',
    'Identifying key strengths and improvement areas',
  ],
  not_suitable_for: [
    'Real-time monitoring',
    'Quick status checks',
  ],
  examples: [],
  enabled: true,
};

/**
 * Intervention Decider Tool - Decide what interventions to trigger
 */
const interventionDeciderTool: ToolDefinition<
  z.infer<typeof InterventionDeciderInput>,
  z.infer<typeof InterventionDeciderOutput>
> = {
  id: 'intervention_decider',
  name: 'Intervention Decider',
  description: 'Decide what interventions to trigger based on detected patterns',
  version: '1.0.0',
  category: 'decision',
  tags: ['intervention', 'decision', 'action', 'strategy'],
  input_schema: InterventionDeciderInput,
  output_schema: InterventionDeciderOutput,
  handler: async (input) => {
    const interventions: z.infer<typeof InterventionDeciderOutput>['interventions'] = [];
    const deferredActions: z.infer<typeof InterventionDeciderOutput>['deferred_actions'] = [];

    // Process each pattern and decide intervention
    for (const pattern of input.patterns) {
      const type = pattern.type as string;
      const severity = pattern.severity as string;
      const recommendedAction = pattern.recommended_action as string | undefined;

      if (type === 'skill_gap_cluster' && (severity === 'critical' || severity === 'high')) {
        interventions.push({
          pattern_id: pattern.id as string,
          action: 'REPATH_ROADMAP',
          reason: 'Significant skill gap detected across multiple sources',
          urgency: severity === 'critical' ? 'immediate' : 'soon',
          payload: { skill: pattern.skill, occurrences: pattern.occurrences },
        });
      } else if (type === 'declining_trend' && severity === 'high') {
        interventions.push({
          action: 'REQUEST_PRACTICE',
          reason: 'Interview performance is declining',
          urgency: 'soon',
        });
      } else if (type === 'stall' || type === 'velocity_drop') {
        interventions.push({
          action: 'NOTIFY_USER',
          reason: 'Activity has stalled or dropped significantly',
          urgency: severity === 'high' ? 'immediate' : 'soon',
          payload: { message: pattern.description },
        });
      } else if (type === 'milestone') {
        interventions.push({
          action: 'CELEBRATE',
          reason: 'User achieved a milestone',
          urgency: 'when_convenient',
          payload: { milestone: pattern.description },
        });
      } else if (recommendedAction === 'REVIEW_RESUME_AND_TARGETING') {
        deferredActions.push({
          action: 'ADJUST_STRATEGY',
          trigger_condition: 'Next application submission',
          reason: 'High rejection rate suggests resume or targeting issues',
        });
      }
    }

    // If no interventions needed
    if (interventions.length === 0 && input.patterns.length > 0) {
      interventions.push({
        action: 'NO_ACTION',
        reason: 'No patterns require immediate intervention',
        urgency: 'when_convenient',
      });
    }

    const hasImmediateAction = interventions.some(i => i.urgency === 'immediate');

    return {
      interventions,
      deferred_actions: deferredActions,
      requires_immediate_action: hasImmediateAction,
    };
  },
  cost: { latency_ms: 100, tokens: 0 },
  requires: [],
  best_for: [
    'Deciding what actions to take based on patterns',
    'Prioritizing interventions by urgency',
    'Triggering appropriate agent responses',
  ],
  not_suitable_for: [
    'Pattern detection',
    'Analysis',
  ],
  examples: [],
  enabled: true,
};

/**
 * Stall Detector Tool - Quick check if user is stalled
 */
const stallDetectorTool: ToolDefinition<
  z.infer<typeof StallDetectorInput>,
  z.infer<typeof StallDetectorOutput>
> = {
  id: 'stall_detector',
  name: 'Stall Detector',
  description: 'Quickly detect if a user has stalled in their career search',
  version: '1.0.0',
  category: 'analysis',
  tags: ['stall', 'detection', 'activity', 'monitoring'],
  input_schema: StallDetectorInput,
  output_schema: StallDetectorOutput,
  handler: async (input) => {
    const tracker = new VelocityTracker(input.user_id, 7);
    const result = await tracker.isStalled();

    let recommendedAction: string | undefined;
    if (result.stalled) {
      if (result.days_inactive && result.days_inactive > 14) {
        recommendedAction = 'Send re-engagement email and schedule check-in';
      } else if (result.days_inactive && result.days_inactive > 7) {
        recommendedAction = 'Send motivational notification with quick wins';
      } else {
        recommendedAction = 'Show gentle reminder in dashboard';
      }
    }

    return {
      is_stalled: result.stalled,
      reason: result.reason,
      days_inactive: result.days_inactive,
      last_activity_type: undefined, // Could be enhanced to track this
      recommended_action: recommendedAction,
    };
  },
  cost: { latency_ms: 500, tokens: 0 },
  requires: [],
  best_for: [
    'Quick stall detection for notifications',
    'Dashboard activity indicators',
    'Triggering re-engagement flows',
  ],
  not_suitable_for: [
    'Detailed velocity analysis',
    'Pattern detection',
  ],
  examples: [
    {
      goal: 'Check if user is stalled',
      input: { user_id: 'user_123' },
      output: {
        is_stalled: true,
        reason: 'No activity in the last 7 days',
        days_inactive: 10,
        recommended_action: 'Send motivational notification',
      },
    },
  ],
  enabled: true,
};

// ============================================================================
// Directive Emitter Tools (Commander Capabilities)
// ============================================================================

const DirectiveEmitterInput = z.object({
  user_id: z.string(),
  directive_type: z.enum([
    'focus_shift',
    'skill_priority',
    'application_strategy',
    'market_response',
    'rejection_insight',
    'ghosting_response',
    'success_pattern',
    'roadmap_adjustment',
    'pause_applications',
    'resume_rewrite',
  ]),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  title: z.string(),
  description: z.string(),
  reasoning: z.string().optional(),
  target_agent: z.enum(['action', 'resume', 'architect', 'sentinel']).optional(),
  action_required: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  expires_in_days: z.number().optional().default(14),
});

const DirectiveEmitterOutput = z.object({
  success: z.boolean(),
  directive_id: z.string(),
  directive_type: z.string(),
  priority: z.string(),
  message: z.string(),
  superseded_count: z.number(),
});

/**
 * Strategy Directive Emitter - Allows Strategist to issue commands to other agents
 */
const strategyDirectiveEmitterTool: ToolDefinition<
  z.infer<typeof DirectiveEmitterInput>,
  z.infer<typeof DirectiveEmitterOutput>
> = {
  id: 'strategy_directive_emitter',
  name: 'Strategy Directive Emitter',
  description: 'Issue strategic directives to other agents (Action, Resume, Architect) to change their behavior',
  version: '1.0.0',
  category: 'decision',
  tags: ['directive', 'command', 'strategy', 'control'],
  input_schema: DirectiveEmitterInput,
  output_schema: DirectiveEmitterOutput,
  handler: async (input) => {
    try {
      const expiresAt = input.expires_in_days
        ? new Date(Date.now() + input.expires_in_days * 24 * 60 * 60 * 1000)
        : undefined;

      const directive = await issueDirective({
        user_id: input.user_id,
        type: input.directive_type as DirectiveType,
        priority: input.priority as DirectivePriority,
        title: input.title,
        description: input.description,
        reasoning: input.reasoning,
        target_agent: input.target_agent,
        action_required: input.action_required,
        context: input.context,
        expires_at: expiresAt,
      });

      // Count how many directives were superseded (same type that were pending/active)
      const supersededResult = await db
        .select({ count: count() })
        .from(strategicDirectives)
        .where(
          and(
            eq(strategicDirectives.user_id, input.user_id),
            eq(strategicDirectives.type, input.directive_type),
            eq(strategicDirectives.status, 'superseded')
          )
        );

      return {
        success: true,
        directive_id: directive.id,
        directive_type: directive.type,
        priority: directive.priority,
        message: `Directive "${input.title}" issued successfully to ${input.target_agent || 'all agents'}`,
        superseded_count: Number(supersededResult[0]?.count ?? 0),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        directive_id: '',
        directive_type: input.directive_type,
        priority: input.priority,
        message: `Failed to issue directive: ${errorMessage}`,
        superseded_count: 0,
      };
    }
  },
  cost: { latency_ms: 200, tokens: 0 },
  requires: [],
  best_for: [
    'Pausing applications when user needs skill development',
    'Triggering resume rewrites based on low response rates',
    'Shifting focus to different roles based on market conditions',
    'Issuing skill priority changes to the Architect agent',
  ],
  not_suitable_for: [
    'Real-time blocking of individual applications',
    'Immediate action execution',
  ],
  examples: [
    {
      goal: 'Pause applications for skill building',
      input: {
        user_id: 'user_123',
        directive_type: 'pause_applications',
        priority: 'high',
        title: 'Pause for System Design Prep',
        description: 'User failed 3 system design interviews. Pause applications until practice complete.',
        target_agent: 'action',
        expires_in_days: 7,
      },
      output: {
        success: true,
        directive_id: 'dir_abc123',
        directive_type: 'pause_applications',
        priority: 'high',
        message: 'Directive issued successfully',
        superseded_count: 0,
      },
    },
  ],
  enabled: true,
};

const SearchCriteriaTunerInput = z.object({
  user_id: z.string(),
  adjustments: z.object({
    min_salary_adjustment_percent: z.number().min(-50).max(50).optional(),
    add_keywords: z.array(z.string()).optional(),
    remove_keywords: z.array(z.string()).optional(),
    add_locations: z.array(z.string()).optional(),
    remove_locations: z.array(z.string()).optional(),
    expand_to_remote: z.boolean().optional(),
    adjust_match_threshold: z.number().min(-20).max(20).optional(),
  }),
  reason: z.string(),
});

const SearchCriteriaTunerOutput = z.object({
  success: z.boolean(),
  changes_applied: z.array(z.string()),
  previous_values: z.record(z.string(), z.unknown()),
  new_values: z.record(z.string(), z.unknown()),
  directive_issued: z.boolean(),
  message: z.string(),
});

/**
 * Search Criteria Tuner - Adjusts job search parameters based on market feedback
 */
const searchCriteriaTunerTool: ToolDefinition<
  z.infer<typeof SearchCriteriaTunerInput>,
  z.infer<typeof SearchCriteriaTunerOutput>
> = {
  id: 'search_criteria_tuner',
  name: 'Search Criteria Tuner',
  description: 'Adjust job search criteria (salary, keywords, locations) based on market feedback and rejection patterns',
  version: '1.0.0',
  category: 'decision',
  tags: ['search', 'tuning', 'criteria', 'adjustment'],
  input_schema: SearchCriteriaTunerInput,
  output_schema: SearchCriteriaTunerOutput,
  handler: async (input) => {
    const changesApplied: string[] = [];
    const previousValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    try {
      // Fetch current user profile
      const profile = await db.query.userProfiles.findFirst({
        where: eq(userProfiles.user_id, input.user_id),
      });

      if (!profile) {
        return {
          success: false,
          changes_applied: [],
          previous_values: {},
          new_values: {},
          directive_issued: false,
          message: `User profile not found for ${input.user_id}`,
        };
      }

      const updates: Partial<typeof profile> = {};

      // Apply salary adjustment
      if (input.adjustments.min_salary_adjustment_percent !== undefined && profile.salary_expectation_min) {
        const adjustmentFactor = 1 + (input.adjustments.min_salary_adjustment_percent / 100);
        const newMinSalary = Math.round(profile.salary_expectation_min * adjustmentFactor);

        previousValues.salary_expectation_min = profile.salary_expectation_min;
        updates.salary_expectation_min = newMinSalary;
        newValues.salary_expectation_min = newMinSalary;
        changesApplied.push(`Adjusted min salary from $${profile.salary_expectation_min.toLocaleString()} to $${newMinSalary.toLocaleString()} (${input.adjustments.min_salary_adjustment_percent > 0 ? '+' : ''}${input.adjustments.min_salary_adjustment_percent}%)`);
      }

      // Apply location adjustments
      if (input.adjustments.add_locations?.length || input.adjustments.remove_locations?.length) {
        let currentLocations = profile.preferred_locations || [];
        previousValues.preferred_locations = [...currentLocations];

        if (input.adjustments.add_locations?.length) {
          currentLocations = [...currentLocations, ...input.adjustments.add_locations];
          changesApplied.push(`Added locations: ${input.adjustments.add_locations.join(', ')}`);
        }

        if (input.adjustments.remove_locations?.length) {
          currentLocations = currentLocations.filter(
            loc => !input.adjustments.remove_locations!.includes(loc)
          );
          changesApplied.push(`Removed locations: ${input.adjustments.remove_locations.join(', ')}`);
        }

        if (input.adjustments.expand_to_remote && !currentLocations.includes('Remote')) {
          currentLocations.push('Remote');
          changesApplied.push('Expanded search to include Remote positions');
        }

        updates.preferred_locations = currentLocations;
        newValues.preferred_locations = currentLocations;
      }

      // Apply match threshold adjustment
      if (input.adjustments.adjust_match_threshold !== undefined) {
        const currentThreshold = profile.auto_apply_threshold || 75;
        const newThreshold = Math.max(50, Math.min(100, currentThreshold + input.adjustments.adjust_match_threshold));

        previousValues.auto_apply_threshold = currentThreshold;
        updates.auto_apply_threshold = newThreshold;
        newValues.auto_apply_threshold = newThreshold;
        changesApplied.push(`Adjusted match threshold from ${currentThreshold}% to ${newThreshold}%`);
      }

      // Apply updates to database
      if (Object.keys(updates).length > 0) {
        await db
          .update(userProfiles)
          .set({
            ...updates,
            updated_at: new Date(),
          })
          .where(eq(userProfiles.user_id, input.user_id));
      }

      // Issue a directive to document the change
      let directiveIssued = false;
      if (changesApplied.length > 0) {
        await issueDirective({
          user_id: input.user_id,
          type: 'market_response',
          priority: 'medium',
          title: 'Search Criteria Adjusted',
          description: `Strategist adjusted search criteria: ${changesApplied.join('; ')}`,
          reasoning: input.reason,
          target_agent: 'action',
          action_required: 'Use updated search criteria for future job matching',
          context: {
            adjustments: input.adjustments,
            previous_values: previousValues,
            new_values: newValues,
          },
        });
        directiveIssued = true;
      }

      return {
        success: true,
        changes_applied: changesApplied,
        previous_values: previousValues,
        new_values: newValues,
        directive_issued: directiveIssued,
        message: changesApplied.length > 0
          ? `Applied ${changesApplied.length} adjustment(s) to search criteria`
          : 'No changes were applied',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        changes_applied: [],
        previous_values: previousValues,
        new_values: newValues,
        directive_issued: false,
        message: `Failed to tune search criteria: ${errorMessage}`,
      };
    }
  },
  cost: { latency_ms: 300, tokens: 0 },
  requires: [],
  best_for: [
    'Widening search when no matches are found',
    'Lowering salary expectations after many rejections',
    'Adding Remote as an option when local market is tight',
    'Adjusting match threshold based on application success rate',
  ],
  not_suitable_for: [
    'Making decisions about individual applications',
    'One-time job searches',
  ],
  examples: [
    {
      goal: 'Widen search after 50 applications with no interviews',
      input: {
        user_id: 'user_123',
        adjustments: {
          min_salary_adjustment_percent: -10,
          expand_to_remote: true,
          adjust_match_threshold: -5,
        },
        reason: 'No interviews after 50 applications. Widening search criteria to increase match rate.',
      },
      output: {
        success: true,
        changes_applied: [
          'Adjusted min salary from $120,000 to $108,000 (-10%)',
          'Expanded search to include Remote positions',
          'Adjusted match threshold from 75% to 70%',
        ],
        previous_values: { salary_expectation_min: 120000 },
        new_values: { salary_expectation_min: 108000 },
        directive_issued: true,
        message: 'Applied 3 adjustments to search criteria',
      },
    },
  ],
  enabled: true,
};

// ============================================================================
// Registration
// ============================================================================

/**
 * Register all Strategist agent tools
 */
export function registerStrategistTools(): void {
  const tools = [
    patternDetectorTool,
    rejectionAnalyzerTool,
    velocityTrackerTool,
    recommendationGeneratorTool,
    synthesisReportTool,
    interventionDeciderTool,
    stallDetectorTool,
    // Commander Tools (Directive System)
    strategyDirectiveEmitterTool,
    searchCriteriaTunerTool,
  ] as const;

  for (const tool of tools) {
    if (!toolRegistry.has(tool.id)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toolRegistry.register(tool as any);
    }
  }

  console.log(`[Strategist] Registered ${tools.length} tools`);
}

/**
 * Get IDs of all Strategist tools
 */
export function getStrategistToolIds(): string[] {
  return [
    'pattern_detector',
    'rejection_analyzer',
    'velocity_tracker',
    'recommendation_generator',
    'synthesis_report',
    'intervention_decider',
    'stall_detector',
    // Commander Tools
    'strategy_directive_emitter',
    'search_criteria_tuner',
  ];
}

export default {
  registerStrategistTools,
  getStrategistToolIds,
};
