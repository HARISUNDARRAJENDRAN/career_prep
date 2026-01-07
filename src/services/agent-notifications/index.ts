/**
 * Agent Notification Service
 *
 * Creates notifications for agent activities and status updates.
 * Integrates with the main notification system.
 */

import { createNotification, type NotificationPriority } from '@/services/notifications';

// Agent notification types
export type AgentNotificationType =
  | 'sprint_complete'
  | 'directive_issued'
  | 'ghosting_detected'
  | 'rejection_insight'
  | 'application_submitted'
  | 'resume_updated'
  | 'approval_needed';

interface AgentNotificationInput {
  user_id: string;
  type: AgentNotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  action_url?: string;
  action_label?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create an agent-related notification
 */
export async function createAgentNotification(
  input: AgentNotificationInput
): Promise<{ id: string }> {
  return createNotification({
    user_id: input.user_id,
    type: 'system', // All agent notifications use the 'system' type
    priority: input.priority || 'normal',
    title: input.title,
    message: input.message,
    action_url: input.action_url,
    action_label: input.action_label,
    metadata: {
      ...input.metadata,
      agent_notification_type: input.type,
      source: 'agent_system',
    },
  });
}

/**
 * Notify user when a sprint completes
 */
export async function notifySprintComplete(
  user_id: string,
  results: {
    applications_created: number;
    health_score: number;
    directives_issued: number;
  }
): Promise<void> {
  await createAgentNotification({
    user_id,
    type: 'sprint_complete',
    title: '🏃 Weekly Career Sprint Complete',
    message: `Created ${results.applications_created} application(s). Health score: ${results.health_score}%.`,
    priority: 'normal',
    action_url: '/agent-requests',
    action_label: 'View Results',
    metadata: results,
  });
}

/**
 * Notify user when a strategic directive is issued
 */
export async function notifyDirectiveIssued(
  user_id: string,
  directive: {
    id: string;
    title: string;
    type: string;
    priority: string;
  }
): Promise<void> {
  const priority: NotificationPriority =
    directive.priority === 'critical' ? 'urgent' :
    directive.priority === 'high' ? 'high' : 'normal';

  await createAgentNotification({
    user_id,
    type: 'directive_issued',
    title: '🎯 New Strategic Focus',
    message: directive.title,
    priority,
    action_url: '/agent-requests?tab=directives',
    action_label: 'View Directive',
    metadata: {
      directive_id: directive.id,
      directive_type: directive.type,
    },
  });
}

/**
 * Notify user when ghosting is detected
 */
export async function notifyGhostingDetected(
  user_id: string,
  count: number,
  companies: string[]
): Promise<void> {
  const companyList = companies.slice(0, 3).join(', ');
  const message = count === 1
    ? `${companyList} may have ghosted your application.`
    : `${count} applications appear to be ghosted: ${companyList}${count > 3 ? '...' : ''}`;

  await createAgentNotification({
    user_id,
    type: 'ghosting_detected',
    title: '👻 Ghosting Alert',
    message,
    priority: 'normal',
    action_url: '/jobs/applications?filter=at-risk',
    action_label: 'Review Applications',
    metadata: {
      ghosted_count: count,
      companies,
    },
  });
}

/**
 * Notify user of rejection insights
 */
export async function notifyRejectionInsight(
  user_id: string,
  insights: {
    skill_gaps: string[];
    pattern_detected?: string;
    company?: string;
  }
): Promise<void> {
  const skillList = insights.skill_gaps.slice(0, 3).join(', ');
  const message = insights.company
    ? `Analysis of ${insights.company} rejection found areas for improvement: ${skillList}`
    : `Rejection analysis found ${insights.skill_gaps.length} skill gap(s): ${skillList}`;

  await createAgentNotification({
    user_id,
    type: 'rejection_insight',
    title: '💡 Rejection Insights Available',
    message,
    priority: 'normal',
    action_url: '/agent-requests?tab=directives',
    action_label: 'View Insights',
    metadata: insights,
  });
}

/**
 * Notify user when an application is auto-submitted
 */
export async function notifyApplicationSubmitted(
  user_id: string,
  application: {
    company: string;
    role: string;
    match_score?: number;
    auto_submitted: boolean;
  }
): Promise<void> {
  const prefix = application.auto_submitted ? '🤖 Auto-Applied:' : '✅ Applied:';
  const matchInfo = application.match_score ? ` (${application.match_score}% match)` : '';

  await createAgentNotification({
    user_id,
    type: 'application_submitted',
    title: `${prefix} ${application.role}`,
    message: `${application.company}${matchInfo}`,
    priority: 'low',
    action_url: '/jobs/applications',
    action_label: 'View Applications',
    metadata: application,
  });
}

/**
 * Notify user when approval is needed
 */
export async function notifyApprovalNeeded(
  user_id: string,
  count: number
): Promise<void> {
  await createAgentNotification({
    user_id,
    type: 'approval_needed',
    title: '📋 Applications Ready for Review',
    message: `${count} draft application(s) are waiting for your approval.`,
    priority: 'high',
    action_url: '/agent-requests?tab=approvals',
    action_label: 'Review Now',
    metadata: {
      pending_count: count,
    },
  });
}

/**
 * Notify user when resume is updated
 */
export async function notifyResumeUpdated(
  user_id: string,
  changes: {
    skills_added?: string[];
    sections_updated?: string[];
    tailored_for?: string;
  }
): Promise<void> {
  let message = 'Your resume has been updated';
  if (changes.tailored_for) {
    message = `Resume tailored for ${changes.tailored_for}`;
  } else if (changes.skills_added?.length) {
    message = `Added skills: ${changes.skills_added.slice(0, 3).join(', ')}`;
  }

  await createAgentNotification({
    user_id,
    type: 'resume_updated',
    title: '📄 Resume Updated',
    message,
    priority: 'low',
    action_url: '/resume/builder',
    action_label: 'View Resume',
    metadata: changes,
  });
}
