/**
 * Agent Statuses API
 *
 * Returns the status of all career agents.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { agentEvents, jobApplications } from '@/drizzle/schema';
import { eq, desc, and, gte, count, sql } from 'drizzle-orm';

interface AgentStatus {
  id: string;
  name: string;
  type: 'strategist' | 'resume' | 'action' | 'architect' | 'sentinel';
  status: 'active' | 'idle' | 'paused' | 'error';
  last_activity?: string;
  tasks_completed_today: number;
  current_task?: string;
  health_score: number;
}

// Agent definitions
const AGENTS = [
  { id: 'strategist', name: 'Strategist Agent', type: 'strategist' as const },
  { id: 'resume', name: 'Resume Architect', type: 'resume' as const },
  { id: 'action', name: 'Action Agent', type: 'action' as const },
  { id: 'architect', name: 'Learning Architect', type: 'architect' as const },
  { id: 'sentinel', name: 'Market Sentinel', type: 'sentinel' as const },
];

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const agentStatuses: AgentStatus[] = [];

    for (const agent of AGENTS) {
      // Get recent events for this agent
      const recentEvents = await db
        .select()
        .from(agentEvents)
        .where(
          and(
            eq(agentEvents.source_agent, agent.id),
            gte(agentEvents.created_at, today)
          )
        )
        .orderBy(desc(agentEvents.created_at))
        .limit(10);

      const lastEvent = recentEvents[0];
      
      // Determine status based on recent activity
      let status: AgentStatus['status'] = 'idle';
      let currentTask: string | undefined;

      if (lastEvent) {
        const timeSinceLastEvent = Date.now() - new Date(lastEvent.created_at).getTime();
        
        if (timeSinceLastEvent < 5 * 60 * 1000) { // Last 5 minutes
          status = 'active';
          currentTask = `Processing ${lastEvent.event_type}`;
        } else if (lastEvent.status === 'failed') {
          status = 'error';
        }
      }

      // Count completed tasks today
      const completedEvents = recentEvents.filter((e) => e.status === 'completed');

      // Calculate health score (based on success rate)
      const successRate = recentEvents.length > 0
        ? (completedEvents.length / recentEvents.length) * 100
        : 100;

      agentStatuses.push({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status,
        last_activity: lastEvent?.created_at?.toISOString(),
        tasks_completed_today: completedEvents.length,
        current_task: currentTask,
        health_score: Math.round(successRate),
      });
    }

    return NextResponse.json(agentStatuses);
  } catch (error) {
    console.error('[Agent Statuses] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent statuses' },
      { status: 500 }
    );
  }
}
