/**
 * Directive Checker Utility
 *
 * Provides a consistent way for agents to check and respond to strategic directives.
 * Used by Action Agent, Resume Agent, and other agents to check for blocking directives
 * before performing actions.
 */

import { db } from '@/drizzle/db';
import { strategicDirectives } from '@/drizzle/schema';
import { eq, and, gte, inArray, or, isNull, desc } from 'drizzle-orm';

// Directive types that can block actions
export type BlockingDirectiveType =
  | 'pause_applications'
  | 'focus_shift'
  | 'skill_priority'
  | 'resume_rewrite'
  | 'application_strategy'
  | 'ghosting_response'
  | 'rejection_insight';

export interface DirectiveCheckResult {
  blocked: boolean;
  directive?: {
    id: string;
    type: string;
    priority: string;
    title: string;
    description: string;
    reasoning: string | null;
    target_agent: string | null;
    action_required: string | null;
    expires_at: Date | null;
  };
  reason?: string;
  requiredAction?: string;
  recommendations?: string[];
}

export interface DirectiveCheckOptions {
  userId: string;
  agentType: 'action' | 'resume' | 'architect' | 'sentinel' | 'strategist';
  operation: 'apply' | 'update_resume' | 'update_roadmap' | 'scrape' | 'analyze';
}

// Mapping of which directive types block which operations
const BLOCKING_RULES: Record<string, BlockingDirectiveType[]> = {
  'action:apply': ['pause_applications', 'focus_shift'],
  'resume:update_resume': [], // resume_rewrite doesn't block, it guides
  'architect:update_roadmap': ['skill_priority', 'rejection_insight'],
  'sentinel:scrape': [],
  'strategist:analyze': [],
};

// Directive types that modify behavior (don't block, but provide guidance)
const GUIDING_RULES: Record<string, BlockingDirectiveType[]> = {
  'action:apply': ['application_strategy', 'skill_priority'],
  'resume:update_resume': ['resume_rewrite', 'skill_priority'],
  'architect:update_roadmap': [],
};

/**
 * Check if any active directives block the given operation
 */
export async function checkDirectivesForOperation(
  options: DirectiveCheckOptions
): Promise<DirectiveCheckResult> {
  const { userId, agentType, operation } = options;
  const ruleKey = `${agentType}:${operation}`;

  // Get blocking directive types for this operation
  const blockingTypes = BLOCKING_RULES[ruleKey] || [];
  const guidingTypes = GUIDING_RULES[ruleKey] || [];
  const allRelevantTypes = [...blockingTypes, ...guidingTypes];

  if (allRelevantTypes.length === 0) {
    return { blocked: false };
  }

  // Fetch active directives for this user
  const directives = await db
    .select()
    .from(strategicDirectives)
    .where(
      and(
        eq(strategicDirectives.user_id, userId),
        inArray(strategicDirectives.status, ['pending', 'active']),
        or(
          isNull(strategicDirectives.expires_at),
          gte(strategicDirectives.expires_at, new Date())
        )
      )
    )
    .orderBy(desc(strategicDirectives.priority), desc(strategicDirectives.issued_at));

  // Filter to relevant types
  const relevantDirectives = directives.filter((d) =>
    allRelevantTypes.includes(d.type as BlockingDirectiveType)
  );

  if (relevantDirectives.length === 0) {
    return { blocked: false };
  }

  // Find first blocking directive
  for (const directive of relevantDirectives) {
    if (blockingTypes.includes(directive.type as BlockingDirectiveType)) {
      return {
        blocked: true,
        directive: {
          id: directive.id,
          type: directive.type,
          priority: directive.priority,
          title: directive.title,
          description: directive.description,
          reasoning: directive.reasoning,
          target_agent: directive.target_agent,
          action_required: directive.action_required,
          expires_at: directive.expires_at,
        },
        reason: directive.description,
        requiredAction: directive.action_required || undefined,
      };
    }
  }

  // No blocking directives, but may have guiding directives
  const guidingDirectives = relevantDirectives.filter((d) =>
    guidingTypes.includes(d.type as BlockingDirectiveType)
  );

  if (guidingDirectives.length > 0) {
    const recommendations = guidingDirectives.map((d) => {
      if (d.action_required) {
        return `${d.title}: ${d.action_required}`;
      }
      return d.description;
    });

    return {
      blocked: false,
      directive: {
        id: guidingDirectives[0].id,
        type: guidingDirectives[0].type,
        priority: guidingDirectives[0].priority,
        title: guidingDirectives[0].title,
        description: guidingDirectives[0].description,
        reasoning: guidingDirectives[0].reasoning,
        target_agent: guidingDirectives[0].target_agent,
        action_required: guidingDirectives[0].action_required,
        expires_at: guidingDirectives[0].expires_at,
      },
      reason: 'Guidance available from active directives',
      recommendations,
    };
  }

  return { blocked: false };
}

/**
 * Get all active directives relevant to an agent
 */
export async function getAgentDirectives(
  userId: string,
  agentType: 'action' | 'resume' | 'architect' | 'sentinel' | 'strategist'
): Promise<
  Array<{
    id: string;
    type: string;
    priority: string;
    title: string;
    description: string;
    target_agent: string | null;
    action_required: string | null;
    expires_at: Date | null;
  }>
> {
  const directives = await db
    .select()
    .from(strategicDirectives)
    .where(
      and(
        eq(strategicDirectives.user_id, userId),
        inArray(strategicDirectives.status, ['pending', 'active']),
        or(
          isNull(strategicDirectives.target_agent),
          eq(strategicDirectives.target_agent, agentType)
        ),
        or(
          isNull(strategicDirectives.expires_at),
          gte(strategicDirectives.expires_at, new Date())
        )
      )
    )
    .orderBy(desc(strategicDirectives.priority));

  return directives.map((d) => ({
    id: d.id,
    type: d.type,
    priority: d.priority,
    title: d.title,
    description: d.description,
    target_agent: d.target_agent,
    action_required: d.action_required,
    expires_at: d.expires_at,
  }));
}

/**
 * Check if a specific directive type is active
 */
export async function isDirectiveActive(
  userId: string,
  directiveType: BlockingDirectiveType
): Promise<{
  active: boolean;
  directive?: {
    id: string;
    title: string;
    description: string;
    action_required: string | null;
    expires_at: Date | null;
  };
}> {
  const directives = await db
    .select()
    .from(strategicDirectives)
    .where(
      and(
        eq(strategicDirectives.user_id, userId),
        eq(strategicDirectives.type, directiveType),
        inArray(strategicDirectives.status, ['pending', 'active']),
        or(
          isNull(strategicDirectives.expires_at),
          gte(strategicDirectives.expires_at, new Date())
        )
      )
    )
    .limit(1);

  if (directives.length > 0) {
    return {
      active: true,
      directive: {
        id: directives[0].id,
        title: directives[0].title,
        description: directives[0].description,
        action_required: directives[0].action_required,
        expires_at: directives[0].expires_at,
      },
    };
  }

  return { active: false };
}

/**
 * Get all blocking directives for a user
 */
export async function getBlockingDirectives(userId: string): Promise<
  Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    action_required: string | null;
    expires_at: Date | null;
  }>
> {
  const blockingTypes: BlockingDirectiveType[] = ['pause_applications', 'focus_shift'];

  const directives = await db
    .select()
    .from(strategicDirectives)
    .where(
      and(
        eq(strategicDirectives.user_id, userId),
        inArray(strategicDirectives.type, blockingTypes),
        inArray(strategicDirectives.status, ['pending', 'active']),
        or(
          isNull(strategicDirectives.expires_at),
          gte(strategicDirectives.expires_at, new Date())
        )
      )
    )
    .orderBy(desc(strategicDirectives.priority));

  return directives.map((d) => ({
    id: d.id,
    type: d.type,
    title: d.title,
    description: d.description,
    action_required: d.action_required,
    expires_at: d.expires_at,
  }));
}
