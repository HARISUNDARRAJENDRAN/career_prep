/**
 * Agent Activity Stream Endpoint (SSE)
 *
 * Provides real-time updates for agent activities using Server-Sent Events.
 * Clients can subscribe to receive live updates about:
 * - Sprint progress
 * - Directive changes
 * - Application submissions
 * - Ghosting/rejection alerts
 */

import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { strategicDirectives, jobApplications } from '@/drizzle/schema';
import { eq, desc, gte, and, or, count } from 'drizzle-orm';
import {
  registerConnection,
  unregisterConnection,
} from '@/services/realtime';

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start: async (controller) => {
      // Register this connection
      registerConnection(userId, controller);

      // Send initial connection message
      const connectMessage = `event: connected\ndata: ${JSON.stringify({
        message: 'Connected to agent activity stream',
        timestamp: new Date().toISOString(),
      })}\n\n`;
      controller.enqueue(new TextEncoder().encode(connectMessage));

      // Send initial state
      try {
        const initialState = await getAgentActivityState(userId);
        const stateMessage = `event: initial_state\ndata: ${JSON.stringify(initialState)}\n\n`;
        controller.enqueue(new TextEncoder().encode(stateMessage));
      } catch (error) {
        console.error('[SSE] Error fetching initial state:', error);
      }

      // Set up heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeat = `event: heartbeat\ndata: ${JSON.stringify({
            timestamp: new Date().toISOString(),
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(heartbeat));
        } catch {
          // Connection closed
          clearInterval(heartbeatInterval);
          unregisterConnection(userId, controller);
        }
      }, 30000); // Every 30 seconds

      // Store cleanup function for later
      (controller as unknown as { _cleanup: () => void })._cleanup = () => {
        clearInterval(heartbeatInterval);
        unregisterConnection(userId, controller);
      };
    },
    cancel(controller) {
      // Stream was cancelled by client
      const cleanup = (controller as unknown as { _cleanup?: () => void })._cleanup;
      if (cleanup) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

/**
 * Get current agent activity state for initial SSE message
 */
async function getAgentActivityState(userId: string) {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Get active directives count
  const activeDirectivesResult = await db
    .select({ count: count() })
    .from(strategicDirectives)
    .where(
      and(
        eq(strategicDirectives.user_id, userId),
        or(
          eq(strategicDirectives.status, 'pending'),
          eq(strategicDirectives.status, 'active')
        )
      )
    );

  // Get recent applications
  const recentApplicationsResult = await db
    .select({ count: count() })
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.user_id, userId),
        gte(jobApplications.created_at, oneDayAgo)
      )
    );

  // Get pending approvals (draft applications)
  const pendingApprovalsResult = await db
    .select({ count: count() })
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.user_id, userId),
        eq(jobApplications.status, 'draft')
      )
    );

  // Get most recent directive
  const recentDirective = await db
    .select({
      id: strategicDirectives.id,
      type: strategicDirectives.type,
      title: strategicDirectives.title,
      status: strategicDirectives.status,
      issued_at: strategicDirectives.issued_at,
    })
    .from(strategicDirectives)
    .where(eq(strategicDirectives.user_id, userId))
    .orderBy(desc(strategicDirectives.issued_at))
    .limit(1);

  return {
    active_directives: Number(activeDirectivesResult[0]?.count ?? 0),
    applications_today: Number(recentApplicationsResult[0]?.count ?? 0),
    pending_approvals: Number(pendingApprovalsResult[0]?.count ?? 0),
    last_directive: recentDirective[0] || null,
    timestamp: now.toISOString(),
  };
}
