/**
 * Real-time Event Broadcasting Service
 *
 * Provides functions to broadcast real-time events to connected clients via SSE.
 * Used by agent services to push live updates to the frontend.
 */

// Event types that can be broadcast
export type AgentEventType =
  | 'sprint_started'
  | 'sprint_progress'
  | 'sprint_complete'
  | 'directive_issued'
  | 'directive_completed'
  | 'directive_dismissed'
  | 'application_submitted'
  | 'application_draft_created'
  | 'application_blocked_by_directive'
  | 'application_progress'
  | 'ghosting_detected'
  | 'rejection_analyzed'
  | 'approval_needed'
  | 'resume_updated'
  | 'agent_status_changed';

export interface BroadcastEvent {
  type: AgentEventType;
  user_id: string;
  data: Record<string, unknown>;
  timestamp?: string;
}

// In-memory store for active SSE connections
// Note: In production with multiple instances, use Redis pub/sub instead
const connectionStore = new Map<string, Set<ReadableStreamDefaultController>>();

/**
 * Register a new SSE connection for a user
 */
export function registerConnection(
  userId: string,
  controller: ReadableStreamDefaultController
): void {
  if (!connectionStore.has(userId)) {
    connectionStore.set(userId, new Set());
  }
  connectionStore.get(userId)!.add(controller);

  const userCount = connectionStore.get(userId)!.size;
  const totalCount = getTotalConnectionCount();
  console.log(`[Realtime] User ${userId} connected. User connections: ${userCount}, Total: ${totalCount}`);
}

/**
 * Get total connection count across all users (for debugging)
 */
export function getTotalConnectionCount(): number {
  let total = 0;
  for (const connections of connectionStore.values()) {
    total += connections.size;
  }
  return total;
}

/**
 * Unregister an SSE connection for a user
 */
export function unregisterConnection(
  userId: string,
  controller: ReadableStreamDefaultController
): void {
  const userConnections = connectionStore.get(userId);
  if (userConnections) {
    const hadConnection = userConnections.has(controller);
    userConnections.delete(controller);
    if (userConnections.size === 0) {
      connectionStore.delete(userId);
    }
    if (hadConnection) {
      console.log(`[Realtime] User ${userId} disconnected. Remaining: ${userConnections.size}`);
    }
  }
}

/**
 * Broadcast an event to a specific user
 */
export function broadcastToUser(event: BroadcastEvent): void {
  const userConnections = connectionStore.get(event.user_id);
  if (!userConnections || userConnections.size === 0) {
    return; // No active connections for this user
  }

  const message = formatSSEMessage(event.type, {
    ...event.data,
    timestamp: event.timestamp || new Date().toISOString(),
  });

  const encoder = new TextEncoder();
  const encodedMessage = encoder.encode(message);

  userConnections.forEach((controller) => {
    try {
      controller.enqueue(encodedMessage);
    } catch (error) {
      // Connection likely closed, remove it
      console.log(`[Realtime] Failed to send to connection, removing`);
      userConnections.delete(controller);
    }
  });
}

/**
 * Format an SSE message
 */
function formatSSEMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Get the number of active connections for a user
 */
export function getConnectionCount(userId: string): number {
  return connectionStore.get(userId)?.size ?? 0;
}

/**
 * Check if a user has any active connections
 */
export function hasActiveConnections(userId: string): boolean {
  return (connectionStore.get(userId)?.size ?? 0) > 0;
}

// =============================================================================
// Convenience functions for common event types
// =============================================================================

export function broadcastSprintProgress(
  userId: string,
  phase: string,
  progress: number,
  message: string
): void {
  broadcastToUser({
    type: 'sprint_progress',
    user_id: userId,
    data: { phase, progress, message },
  });
}

export function broadcastSprintComplete(
  userId: string,
  results: {
    applications_created: number;
    health_score: number;
    directives_issued: number;
  }
): void {
  broadcastToUser({
    type: 'sprint_complete',
    user_id: userId,
    data: results,
  });
}

export function broadcastDirectiveIssued(
  userId: string,
  directive: {
    id: string;
    type: string;
    title: string;
    priority: string;
  }
): void {
  broadcastToUser({
    type: 'directive_issued',
    user_id: userId,
    data: directive,
  });
}

export function broadcastApplicationSubmitted(
  userId: string,
  application: {
    id: string;
    company: string;
    role: string;
    status: string;
    auto_submitted: boolean;
  }
): void {
  broadcastToUser({
    type: 'application_submitted',
    user_id: userId,
    data: application,
  });
}

export function broadcastApprovalNeeded(
  userId: string,
  count: number
): void {
  broadcastToUser({
    type: 'approval_needed',
    user_id: userId,
    data: { pending_count: count },
  });
}

export function broadcastAgentStatus(
  userId: string,
  agentId: string,
  status: 'idle' | 'running' | 'error',
  message?: string
): void {
  broadcastToUser({
    type: 'agent_status_changed',
    user_id: userId,
    data: { agent_id: agentId, status, message },
  });
}

/**
 * Broadcast when an application is blocked by a directive
 */
export function broadcastApplicationBlocked(
  userId: string,
  data: {
    directive_id: string;
    directive_title: string;
    directive_type: string;
    reason: string;
    action_required?: string;
    job_company: string;
    job_role: string;
  }
): void {
  broadcastToUser({
    type: 'application_blocked_by_directive',
    user_id: userId,
    data,
  });
}

/**
 * Broadcast application progress during browser automation
 */
export function broadcastApplicationProgress(
  userId: string,
  data: {
    applicationId: string;
    stage: 'navigating' | 'detecting_form' | 'filling' | 'uploading_resume' | 'submitting' | 'complete';
    progress: number;
    message: string;
    company: string;
    role: string;
  }
): void {
  broadcastToUser({
    type: 'application_progress',
    user_id: userId,
    data,
  });
}

/**
 * Broadcast when a directive is dismissed
 */
export function broadcastDirectiveDismissed(
  userId: string,
  directiveId: string,
  directiveTitle: string
): void {
  broadcastToUser({
    type: 'directive_dismissed',
    user_id: userId,
    data: { directive_id: directiveId, title: directiveTitle },
  });
}
