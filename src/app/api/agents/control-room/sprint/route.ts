/**
 * Sprint Status API
 *
 * Returns the status of the weekly career sprint.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { agentEvents } from '@/drizzle/schema';
import { eq, desc, and, like } from 'drizzle-orm';

interface SprintStatus {
  enabled: boolean;
  next_sprint?: string;
  last_sprint?: string;
  last_sprint_results?: {
    applications_created: number;
    health_score: number;
  };
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get last sprint event
    const lastSprintEvent = await db
      .select()
      .from(agentEvents)
      .where(
        and(
          like(agentEvents.event_type, '%SPRINT%')
        )
      )
      .orderBy(desc(agentEvents.created_at))
      .limit(1);

    // Calculate next sprint (next Monday at 6 AM UTC)
    const now = new Date();
    const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
    const nextMonday = new Date(now);
    nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(6, 0, 0, 0);

    const status: SprintStatus = {
      enabled: true, // TODO: Read from user settings
      next_sprint: nextMonday.toISOString(),
    };

    if (lastSprintEvent.length > 0) {
      const event = lastSprintEvent[0];
      status.last_sprint = event.created_at.toISOString();
      
      const payload = event.payload as Record<string, unknown> | null;
      if (payload) {
        status.last_sprint_results = {
          applications_created: (payload.applications_created as number) || 0,
          health_score: (payload.health_score as number) || 0,
        };
      }
    }

    return NextResponse.json(status);
  } catch (error) {
    console.error('[Sprint Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sprint status' },
      { status: 500 }
    );
  }
}
