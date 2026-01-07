/**
 * Trigger Sprint API
 *
 * Manually triggers a career sprint for the user.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { tasks } from '@trigger.dev/sdk/v3';
import type { runUserSprintTask } from '@/trigger/jobs/weekly-career-sprint';

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Sprint Trigger] User ${userId} manually triggered sprint`);

    // Trigger the actual Trigger.dev task
    try {
      const handle = await tasks.trigger<typeof runUserSprintTask>(
        'strategist.run-user-sprint',
        { user_id: userId }
      );

      return NextResponse.json({
        success: true,
        message: 'Sprint triggered successfully',
        sprint_id: handle.id,
        task_id: handle.id,
      });
    } catch (triggerError) {
      // If Trigger.dev isn't configured, fall back to simulation
      console.warn('[Sprint Trigger] Trigger.dev not available, simulating:', triggerError);

      return NextResponse.json({
        success: true,
        message: 'Sprint triggered (simulated - Trigger.dev not configured)',
        sprint_id: crypto.randomUUID(),
        simulated: true,
      });
    }
  } catch (error) {
    console.error('[Sprint Trigger] Error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger sprint' },
      { status: 500 }
    );
  }
}
