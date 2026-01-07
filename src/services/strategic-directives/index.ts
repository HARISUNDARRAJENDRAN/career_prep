/**
 * Strategic Directives Service
 *
 * Manages the lifecycle of strategic directives issued by the Strategist Agent.
 * Directives guide the behavior of other agents (Resume, Action) over time.
 *
 * Key Functions:
 * - Issue new directives from strategic analysis
 * - Execute directives through appropriate agents
 * - Track directive completion and impact
 * - Supersede outdated directives with new ones
 */

import { db } from '@/drizzle/db';
import {
  strategicDirectives,
  directiveExecutionLog,
  type StrategicDirective,
  type NewStrategicDirective,
} from '@/drizzle/schema';
import { eq, and, desc, gte, or, isNull, inArray, count, sql } from 'drizzle-orm';
import { publishAgentEvent } from '@/lib/agents/message-bus';

// Types
export type DirectiveType =
  | 'focus_shift'
  | 'skill_priority'
  | 'application_strategy'
  | 'market_response'
  | 'rejection_insight'
  | 'ghosting_response'
  | 'success_pattern'
  | 'roadmap_adjustment'
  | 'pause_applications'
  | 'resume_rewrite'
  | 'other';

export type DirectivePriority = 'critical' | 'high' | 'medium' | 'low';
export type DirectiveStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'failed' | 'superseded';

export interface IssueDirectiveInput {
  user_id: string;
  type: DirectiveType;
  priority?: DirectivePriority;
  title: string;
  description: string;
  reasoning?: string;
  target_agent?: string;
  action_required?: string;
  context?: Record<string, unknown>;
  expires_at?: Date;
}

export interface DirectiveWithLogs extends StrategicDirective {
  execution_logs?: Array<{
    id: string;
    executed_by: string;
    execution_status: string;
    logs: string | null;
    error_message: string | null;
    started_at: Date;
    completed_at: Date | null;
  }>;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Issue a new strategic directive
 */
export async function issueDirective(
  input: IssueDirectiveInput
): Promise<StrategicDirective> {
  const { user_id, type, priority = 'medium', title, description, reasoning, target_agent, action_required, context, expires_at } = input;

  // Check for existing pending/active directives of the same type
  const existingDirectives = await db
    .select()
    .from(strategicDirectives)
    .where(
      and(
        eq(strategicDirectives.user_id, user_id),
        eq(strategicDirectives.type, type),
        inArray(strategicDirectives.status, ['pending', 'active'])
      )
    );

  // Supersede existing directives of the same type
  if (existingDirectives.length > 0) {
    await db
      .update(strategicDirectives)
      .set({
        status: 'superseded',
        updated_at: new Date(),
      })
      .where(
        and(
          eq(strategicDirectives.user_id, user_id),
          eq(strategicDirectives.type, type),
          inArray(strategicDirectives.status, ['pending', 'active'])
        )
      );

    console.log(`[Directives] Superseded ${existingDirectives.length} existing ${type} directive(s)`);
  }

  // Create new directive
  const [directive] = await db
    .insert(strategicDirectives)
    .values({
      user_id,
      type,
      priority,
      status: 'pending',
      title,
      description,
      reasoning,
      target_agent,
      action_required,
      context,
      expires_at,
    })
    .returning();

  console.log(`[Directives] Issued new ${type} directive: ${title}`);

  // Publish event for directive issuance
  await publishAgentEvent({
    type: 'DIRECTIVE_ISSUED',
    payload: {
      user_id,
      directive_id: directive.id,
      directive_type: type,
      priority,
      target_agent,
    },
  });

  return directive;
}

/**
 * Get all active directives for a user
 */
export async function getActiveDirectives(
  user_id: string,
  options?: {
    type?: DirectiveType;
    priority?: DirectivePriority;
    target_agent?: string;
  }
): Promise<StrategicDirective[]> {
  const conditions = [
    eq(strategicDirectives.user_id, user_id),
    inArray(strategicDirectives.status, ['pending', 'active']),
    or(
      isNull(strategicDirectives.expires_at),
      gte(strategicDirectives.expires_at, new Date())
    ),
  ];

  if (options?.type) {
    conditions.push(eq(strategicDirectives.type, options.type));
  }

  if (options?.target_agent) {
    conditions.push(eq(strategicDirectives.target_agent, options.target_agent));
  }

  const directives = await db
    .select()
    .from(strategicDirectives)
    .where(and(...conditions))
    .orderBy(
      // Order by priority then date
      desc(strategicDirectives.priority),
      desc(strategicDirectives.issued_at)
    );

  // Filter by priority in application code (enum comparison)
  if (options?.priority) {
    const priorityOrder = ['critical', 'high', 'medium', 'low'];
    const minPriorityIndex = priorityOrder.indexOf(options.priority);
    return directives.filter((d) => {
      const directivePriorityIndex = priorityOrder.indexOf(d.priority);
      return directivePriorityIndex <= minPriorityIndex;
    });
  }

  return directives;
}

/**
 * Get directive by ID with execution logs
 */
export async function getDirectiveWithLogs(
  directive_id: string
): Promise<DirectiveWithLogs | null> {
  const [directive] = await db
    .select()
    .from(strategicDirectives)
    .where(eq(strategicDirectives.id, directive_id))
    .limit(1);

  if (!directive) return null;

  const logs = await db
    .select()
    .from(directiveExecutionLog)
    .where(eq(directiveExecutionLog.directive_id, directive_id))
    .orderBy(desc(directiveExecutionLog.started_at));

  return {
    ...directive,
    execution_logs: logs,
  };
}

/**
 * Start executing a directive
 */
export async function startDirectiveExecution(
  directive_id: string,
  executed_by: string
): Promise<{ log_id: string }> {
  // Update directive status to active
  await db
    .update(strategicDirectives)
    .set({
      status: 'active',
      updated_at: new Date(),
    })
    .where(eq(strategicDirectives.id, directive_id));

  // Create execution log entry
  const [log] = await db
    .insert(directiveExecutionLog)
    .values({
      directive_id,
      executed_by,
      execution_status: 'running',
    })
    .returning();

  return { log_id: log.id };
}

/**
 * Complete directive execution
 */
export async function completeDirectiveExecution(
  directive_id: string,
  log_id: string,
  result: {
    success: boolean;
    logs?: string;
    error_message?: string;
    result?: Record<string, unknown>;
    impact_metrics?: Record<string, unknown>;
    execution_time_ms?: number;
  }
): Promise<void> {
  const now = new Date();

  // Update execution log
  await db
    .update(directiveExecutionLog)
    .set({
      execution_status: result.success ? 'completed' : 'failed',
      logs: result.logs,
      error_message: result.error_message,
      execution_time_ms: result.execution_time_ms?.toString(),
      completed_at: now,
    })
    .where(eq(directiveExecutionLog.id, log_id));

  // Update directive status
  await db
    .update(strategicDirectives)
    .set({
      status: result.success ? 'completed' : 'failed',
      executed_at: now,
      result: result.result,
      impact_metrics: result.impact_metrics,
      updated_at: now,
    })
    .where(eq(strategicDirectives.id, directive_id));

  // Publish completion event
  const [directive] = await db
    .select()
    .from(strategicDirectives)
    .where(eq(strategicDirectives.id, directive_id))
    .limit(1);

  if (directive) {
    await publishAgentEvent({
      type: 'DIRECTIVE_COMPLETED',
      payload: {
        user_id: directive.user_id,
        directive_id,
        directive_type: directive.type,
        success: result.success,
        impact_metrics: result.impact_metrics,
      },
    });
  }
}

/**
 * Cancel a directive
 */
export async function cancelDirective(
  directive_id: string,
  reason?: string
): Promise<void> {
  await db
    .update(strategicDirectives)
    .set({
      status: 'cancelled',
      result: { cancelled_reason: reason },
      updated_at: new Date(),
    })
    .where(eq(strategicDirectives.id, directive_id));
}

/**
 * Get directive history for a user
 */
export async function getDirectiveHistory(
  user_id: string,
  options?: {
    limit?: number;
    offset?: number;
    type?: DirectiveType;
    status?: DirectiveStatus;
  }
): Promise<{ directives: StrategicDirective[]; total: number }> {
  const { limit = 20, offset = 0 } = options || {};

  const conditions = [eq(strategicDirectives.user_id, user_id)];

  if (options?.type) {
    conditions.push(eq(strategicDirectives.type, options.type));
  }

  if (options?.status) {
    conditions.push(eq(strategicDirectives.status, options.status));
  }

  const directives = await db
    .select()
    .from(strategicDirectives)
    .where(and(...conditions))
    .orderBy(desc(strategicDirectives.issued_at))
    .limit(limit)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ count: count() })
    .from(strategicDirectives)
    .where(and(...conditions));

  return {
    directives,
    total: Number(countResult[0]?.count ?? 0),
  };
}

// =============================================================================
// Directive Templates
// =============================================================================

/**
 * Issue a "focus shift" directive when market conditions change
 */
export async function issueFocusShiftDirective(
  user_id: string,
  params: {
    from_role: string;
    to_role: string;
    reason: string;
    market_data?: Record<string, unknown>;
  }
): Promise<StrategicDirective> {
  return issueDirective({
    user_id,
    type: 'focus_shift',
    priority: 'high',
    title: `Shift Focus: ${params.from_role} → ${params.to_role}`,
    description: `Strategic recommendation to pivot job search focus from ${params.from_role} to ${params.to_role}.`,
    reasoning: params.reason,
    target_agent: 'action',
    action_required: `Update job search filters to prioritize ${params.to_role} positions. Update resume targeting for new role.`,
    context: {
      from_role: params.from_role,
      to_role: params.to_role,
      market_data: params.market_data,
    },
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  });
}

/**
 * Issue a "skill priority" directive based on market demand
 */
export async function issueSkillPriorityDirective(
  user_id: string,
  params: {
    priority_skills: string[];
    reason: string;
    skill_gaps?: string[];
  }
): Promise<StrategicDirective> {
  return issueDirective({
    user_id,
    type: 'skill_priority',
    priority: 'medium',
    title: `Prioritize Skills: ${params.priority_skills.slice(0, 3).join(', ')}`,
    description: `Focus learning roadmap on high-demand skills: ${params.priority_skills.join(', ')}.`,
    reasoning: params.reason,
    target_agent: 'architect',
    action_required: 'Repath learning roadmap to prioritize these skills.',
    context: {
      priority_skills: params.priority_skills,
      skill_gaps: params.skill_gaps,
    },
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
  });
}

/**
 * Issue a "ghosting response" directive when applications go silent
 */
export async function issueGhostingResponseDirective(
  user_id: string,
  params: {
    ghosted_applications: Array<{ company: string; role: string; days_since_applied: number }>;
    recommended_actions: string[];
  }
): Promise<StrategicDirective> {
  const companies = params.ghosted_applications.map((a) => a.company).join(', ');

  return issueDirective({
    user_id,
    type: 'ghosting_response',
    priority: 'medium',
    title: `Address Ghosting: ${params.ghosted_applications.length} Applications`,
    description: `${params.ghosted_applications.length} applications appear to have been ghosted. Companies: ${companies}`,
    reasoning: 'No response received within expected timeframe. Statistical analysis suggests these applications are unlikely to progress.',
    target_agent: 'action',
    action_required: params.recommended_actions.join('\n'),
    context: {
      ghosted_applications: params.ghosted_applications,
      recommended_actions: params.recommended_actions,
    },
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });
}

/**
 * Issue a "rejection insight" directive from rejection analysis
 */
export async function issueRejectionInsightDirective(
  user_id: string,
  params: {
    rejection_patterns: string[];
    skill_gaps: string[];
    recommendations: string[];
  }
): Promise<StrategicDirective> {
  return issueDirective({
    user_id,
    type: 'rejection_insight',
    priority: 'high',
    title: 'Rejection Pattern Detected',
    description: `Analysis of recent rejections reveals patterns: ${params.rejection_patterns.join(', ')}`,
    reasoning: `Identified ${params.skill_gaps.length} skill gaps that appear frequently in rejection feedback.`,
    target_agent: 'architect',
    action_required: params.recommendations.join('\n'),
    context: {
      rejection_patterns: params.rejection_patterns,
      skill_gaps: params.skill_gaps,
      recommendations: params.recommendations,
    },
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
  });
}

/**
 * Issue a "resume rewrite" directive when response rates are low
 */
export async function issueResumeRewriteDirective(
  user_id: string,
  params: {
    response_rate: number;
    suggested_changes: string[];
    target_keywords?: string[];
  }
): Promise<StrategicDirective> {
  return issueDirective({
    user_id,
    type: 'resume_rewrite',
    priority: params.response_rate < 5 ? 'critical' : 'high',
    title: `Resume Revision Needed (${params.response_rate}% Response Rate)`,
    description: `Current resume response rate is ${params.response_rate}%. Industry average is ~10%. Major revision recommended.`,
    reasoning: 'Low response rate indicates resume may not be effectively communicating your qualifications.',
    target_agent: 'resume',
    action_required: params.suggested_changes.join('\n'),
    context: {
      response_rate: params.response_rate,
      suggested_changes: params.suggested_changes,
      target_keywords: params.target_keywords,
    },
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });
}

/**
 * Issue a "pause applications" directive when burnout is detected
 */
export async function issuePauseApplicationsDirective(
  user_id: string,
  params: {
    reason: 'burnout_risk' | 'market_conditions' | 'skill_building' | 'strategy_review';
    recommended_duration_days: number;
    activities_to_focus: string[];
  }
): Promise<StrategicDirective> {
  const reasons = {
    burnout_risk: 'High application velocity detected with declining quality. Taking a strategic pause.',
    market_conditions: 'Current market conditions suggest waiting may yield better opportunities.',
    skill_building: 'Focusing on skill development will improve application success rate.',
    strategy_review: 'Reviewing and refining job search strategy before continuing.',
  };

  return issueDirective({
    user_id,
    type: 'pause_applications',
    priority: 'high',
    title: `Strategic Pause: ${params.recommended_duration_days} Days`,
    description: reasons[params.reason],
    reasoning: `Recommended ${params.recommended_duration_days}-day pause to ${params.activities_to_focus.join(', ')}.`,
    target_agent: 'action',
    action_required: `Pause auto-apply for ${params.recommended_duration_days} days. Focus on: ${params.activities_to_focus.join(', ')}`,
    context: {
      reason: params.reason,
      recommended_duration_days: params.recommended_duration_days,
      activities_to_focus: params.activities_to_focus,
    },
    expires_at: new Date(Date.now() + params.recommended_duration_days * 24 * 60 * 60 * 1000),
  });
}
