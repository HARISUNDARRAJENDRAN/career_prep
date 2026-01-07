/**
 * Strategic Directives Service
 *
 * High-level service for creating, managing, and executing strategic directives.
 */

import { db } from '@/drizzle/db';
import {
  strategicDirectives,
  directiveExecutionLog,
  type StrategicDirective,
  type NewStrategicDirective,
  type DirectiveExecutionLog,
} from '@/drizzle/schema';
import { eq, and, desc, gte, lte, inArray } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

export interface CreateDirectiveInput {
  userId: string;
  type: StrategicDirective['type'];
  priority?: StrategicDirective['priority'];
  title: string;
  description: string;
  reasoning?: string;
  targetAgent?: string;
  actionRequired?: string;
  context?: Record<string, unknown>;
  expiresAt?: Date;
}

export interface ExecuteDirectiveResult {
  success: boolean;
  directiveId: string;
  executionLogId: string;
  message: string;
  result?: Record<string, unknown>;
}

// ============================================================================
// Core CRUD Operations
// ============================================================================

/**
 * Create a new strategic directive
 */
export async function createDirective(
  input: CreateDirectiveInput
): Promise<StrategicDirective> {
  const [directive] = await db
    .insert(strategicDirectives)
    .values({
      user_id: input.userId,
      type: input.type,
      priority: input.priority || 'medium',
      title: input.title,
      description: input.description,
      reasoning: input.reasoning,
      target_agent: input.targetAgent,
      action_required: input.actionRequired,
      context: input.context,
      expires_at: input.expiresAt,
      issued_at: new Date(),
    })
    .returning();

  return directive;
}

/**
 * Get directive by ID
 */
export async function getDirective(
  directiveId: string
): Promise<StrategicDirective | null> {
  const directive = await db.query.strategicDirectives.findFirst({
    where: eq(strategicDirectives.id, directiveId),
    with: {
      executionLogs: {
        orderBy: [desc(directiveExecutionLog.started_at)],
        limit: 10,
      },
    },
  });

  return directive || null;
}

/**
 * Get all directives for a user
 */
export async function getUserDirectives(
  userId: string,
  filters?: {
    status?: StrategicDirective['status'] | StrategicDirective['status'][];
    type?: StrategicDirective['type'];
    priority?: StrategicDirective['priority'];
    includeExpired?: boolean;
  }
): Promise<StrategicDirective[]> {
  const conditions = [eq(strategicDirectives.user_id, userId)];

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(inArray(strategicDirectives.status, filters.status));
    } else {
      conditions.push(eq(strategicDirectives.status, filters.status));
    }
  }

  if (filters?.type) {
    conditions.push(eq(strategicDirectives.type, filters.type));
  }

  if (filters?.priority) {
    conditions.push(eq(strategicDirectives.priority, filters.priority));
  }

  if (!filters?.includeExpired) {
    // Exclude expired directives
    conditions.push(
      gte(strategicDirectives.expires_at, new Date())
    );
  }

  const directives = await db.query.strategicDirectives.findMany({
    where: and(...conditions),
    orderBy: [desc(strategicDirectives.created_at)],
    with: {
      executionLogs: {
        orderBy: [desc(directiveExecutionLog.started_at)],
        limit: 3,
      },
    },
  });

  return directives;
}

/**
 * Get pending directives for execution
 */
export async function getPendingDirectives(
  userId: string,
  targetAgent?: string
): Promise<StrategicDirective[]> {
  const conditions = [
    eq(strategicDirectives.user_id, userId),
    eq(strategicDirectives.status, 'pending'),
  ];

  if (targetAgent) {
    conditions.push(eq(strategicDirectives.target_agent, targetAgent));
  }

  const directives = await db.query.strategicDirectives.findMany({
    where: and(...conditions),
    orderBy: [
      desc(strategicDirectives.priority),
      desc(strategicDirectives.issued_at),
    ],
  });

  // Filter out expired directives
  const now = new Date();
  return directives.filter(
    (d) => !d.expires_at || d.expires_at > now
  );
}

/**
 * Update directive status
 */
export async function updateDirectiveStatus(
  directiveId: string,
  status: StrategicDirective['status'],
  result?: Record<string, unknown>,
  impactMetrics?: Record<string, unknown>
): Promise<void> {
  const updates: Partial<NewStrategicDirective> = {
    status,
    updated_at: new Date(),
  };

  if (status === 'active' || status === 'completed') {
    updates.executed_at = new Date();
  }

  if (result) {
    updates.result = result;
  }

  if (impactMetrics) {
    updates.impact_metrics = impactMetrics;
  }

  await db
    .update(strategicDirectives)
    .set(updates)
    .where(eq(strategicDirectives.id, directiveId));
}

/**
 * Cancel a directive
 */
export async function cancelDirective(directiveId: string): Promise<void> {
  await updateDirectiveStatus(directiveId, 'cancelled');
}

/**
 * Mark directive as superseded (replaced by newer directive)
 */
export async function supersededDirective(
  directiveId: string,
  supersededBy: string
): Promise<void> {
  await db
    .update(strategicDirectives)
    .set({
      status: 'superseded',
      updated_at: new Date(),
      result: { superseded_by: supersededBy },
    })
    .where(eq(strategicDirectives.id, directiveId));
}

// ============================================================================
// Execution Logging
// ============================================================================

/**
 * Log directive execution start
 */
export async function logDirectiveExecutionStart(
  directiveId: string,
  executedBy: string
): Promise<string> {
  const [log] = await db
    .insert(directiveExecutionLog)
    .values({
      directive_id: directiveId,
      executed_by: executedBy,
      execution_status: 'running',
      started_at: new Date(),
    })
    .returning();

  return log.id;
}

/**
 * Log directive execution completion
 */
export async function logDirectiveExecutionComplete(
  executionLogId: string,
  success: boolean,
  logs?: string,
  errorMessage?: string,
  executionTimeMs?: number,
  resourcesUsed?: Record<string, unknown>
): Promise<void> {
  await db
    .update(directiveExecutionLog)
    .set({
      execution_status: success ? 'completed' : 'failed',
      logs,
      error_message: errorMessage,
      execution_time_ms: executionTimeMs?.toString(),
      resources_used: resourcesUsed,
      completed_at: new Date(),
    })
    .where(eq(directiveExecutionLog.id, executionLogId));
}

// ============================================================================
// Directive Templates
// ============================================================================

/**
 * Create a focus shift directive (change target roles/industries)
 */
export async function createFocusShiftDirective(
  userId: string,
  newFocus: { roles?: string[]; industries?: string[]; reasoning: string }
): Promise<StrategicDirective> {
  return createDirective({
    userId,
    type: 'focus_shift',
    priority: 'high',
    title: 'Shift Career Focus',
    description: `Adjust focus to: ${newFocus.roles?.join(', ') || 'N/A'} roles in ${newFocus.industries?.join(', ') || 'N/A'} industries`,
    reasoning: newFocus.reasoning,
    targetAgent: 'resume-architect',
    actionRequired: 'Update resume templates and job search criteria',
    context: newFocus,
  });
}

/**
 * Create a skill priority directive (emphasize certain skills)
 */
export async function createSkillPriorityDirective(
  userId: string,
  skills: string[],
  reasoning: string
): Promise<StrategicDirective> {
  return createDirective({
    userId,
    type: 'skill_priority',
    priority: 'medium',
    title: 'Prioritize Skills',
    description: `Emphasize these skills: ${skills.join(', ')}`,
    reasoning,
    targetAgent: 'resume-architect',
    actionRequired: 'Reorder skills section and highlight in experience bullets',
    context: { prioritized_skills: skills },
  });
}

/**
 * Create an application strategy directive (volume vs quality)
 */
export async function createApplicationStrategyDirective(
  userId: string,
  strategy: 'volume' | 'quality' | 'selective',
  reasoning: string
): Promise<StrategicDirective> {
  const descriptions = {
    volume: 'Apply to 20+ jobs per week with minimal customization',
    quality: 'Apply to 5-10 highly targeted jobs with full customization',
    selective: 'Apply only to top-tier opportunities (1-5 per week)',
  };

  return createDirective({
    userId,
    type: 'application_strategy',
    priority: 'high',
    title: `Switch to ${strategy.toUpperCase()} strategy`,
    description: descriptions[strategy],
    reasoning,
    targetAgent: 'action',
    actionRequired: 'Adjust application criteria and customization level',
    context: { strategy },
  });
}

/**
 * Create a rejection insight directive (learn from rejections)
 */
export async function createRejectionInsightDirective(
  userId: string,
  insight: {
    pattern: string;
    affectedApplications: number;
    recommendation: string;
  }
): Promise<StrategicDirective> {
  return createDirective({
    userId,
    type: 'rejection_insight',
    priority: 'medium',
    title: 'Address Rejection Pattern',
    description: insight.pattern,
    reasoning: `Identified pattern across ${insight.affectedApplications} applications`,
    targetAgent: 'strategist',
    actionRequired: insight.recommendation,
    context: insight,
  });
}

/**
 * Create a ghosting response directive
 */
export async function createGhostingResponseDirective(
  userId: string,
  ghostedCount: number,
  averageDaysSinceApplication: number,
  recommendation: string
): Promise<StrategicDirective> {
  return createDirective({
    userId,
    type: 'ghosting_response',
    priority: 'medium',
    title: 'Respond to Ghosting Pattern',
    description: `${ghostedCount} applications ghosted (avg ${averageDaysSinceApplication} days)`,
    reasoning: 'High ghosting rate detected, strategic adjustment needed',
    targetAgent: 'strategist',
    actionRequired: recommendation,
    context: { ghostedCount, averageDaysSinceApplication },
  });
}
