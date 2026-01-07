/**
 * Agent Activity API
 *
 * Returns recent agent activity events.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { agentEvents } from '@/drizzle/schema';
import { desc, and, gte } from 'drizzle-orm';

interface ActivityEvent {
  id: string;
  type: string;
  agent: string;
  title: string;
  description?: string;
  status: 'success' | 'warning' | 'error' | 'info';
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// Map event types to human-readable titles
const EVENT_TITLES: Record<string, string> = {
  'INTERVIEW_COMPLETED': 'Interview Analysis Complete',
  'ROADMAP_GENERATED': 'Learning Roadmap Created',
  'ROADMAP_REPATH_NEEDED': 'Roadmap Repath Triggered',
  'MODULE_COMPLETED': 'Learning Module Completed',
  'APPLICATION_SUBMITTED': 'Job Application Submitted',
  'JOB_MATCH_FOUND': 'New Job Match Found',
  'MARKET_UPDATE': 'Market Data Updated',
  'SKILL_VERIFIED': 'Skill Verified',
  'REJECTION_PARSED': 'Rejection Feedback Analyzed',
  'REJECTION_RECEIVED': 'Rejection Received',
  'GHOSTING_DETECTED': 'Ghosting Pattern Detected',
  'DIRECTIVE_ISSUED': 'Strategic Directive Issued',
  'DIRECTIVE_COMPLETED': 'Directive Completed',
  'RESUME_UPDATE_REQUESTED': 'Resume Update Requested',
  'BATCH_APPLICATION_REQUESTED': 'Batch Applications Triggered',
};

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get events from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const events = await db
      .select()
      .from(agentEvents)
      .where(gte(agentEvents.created_at, sevenDaysAgo))
      .orderBy(desc(agentEvents.created_at))
      .limit(100);

    const activities: ActivityEvent[] = events.map((event) => {
      const payload = event.payload as Record<string, unknown> | null;
      
      // Determine status
      let status: ActivityEvent['status'] = 'info';
      if (event.status === 'completed') status = 'success';
      else if (event.status === 'failed') status = 'error';
      else if (event.event_type.includes('REJECTION') || event.event_type.includes('GHOSTING')) status = 'warning';

      // Build description
      let description: string | undefined;
      if (payload) {
        if (payload.company && payload.role) {
          description = `${payload.role} at ${payload.company}`;
        } else if (payload.skill_name) {
          description = `Skill: ${payload.skill_name}`;
        } else if (payload.directive_type) {
          description = `Type: ${payload.directive_type}`;
        } else if (payload.jobs_matched) {
          description = `${payload.jobs_matched} jobs matched`;
        }
      }

      return {
        id: event.id,
        type: event.event_type,
        agent: event.source_agent || 'system',
        title: EVENT_TITLES[event.event_type] || event.event_type.replace(/_/g, ' '),
        description,
        status,
        timestamp: event.created_at.toISOString(),
        metadata: payload || undefined,
      };
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error('[Agent Activity] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity' },
      { status: 500 }
    );
  }
}
