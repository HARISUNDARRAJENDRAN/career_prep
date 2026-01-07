/**
 * Agent Control Room Stats API
 *
 * Returns aggregated statistics for the control room dashboard.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { jobApplications, strategicDirectives } from '@/drizzle/schema';
import { eq, and, inArray, gte, count, sql } from 'drizzle-orm';
import { calculateHopeScore } from '@/services/ghosting-detector';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get pending draft applications
    const [pendingResult] = await db
      .select({ count: count() })
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.user_id, userId),
          eq(jobApplications.status, 'draft')
        )
      );

    // Get active directives
    const [directivesResult] = await db
      .select({ count: count() })
      .from(strategicDirectives)
      .where(
        and(
          eq(strategicDirectives.user_id, userId),
          inArray(strategicDirectives.status, ['pending', 'active'])
        )
      );

    // Get applications created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayResult] = await db
      .select({ count: count() })
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.user_id, userId),
          gte(jobApplications.created_at, today)
        )
      );

    // Get ghosted/at-risk applications
    const applications = await db
      .select({
        id: jobApplications.id,
        status: jobApplications.status,
        created_at: jobApplications.created_at,
        updated_at: jobApplications.updated_at,
        raw_data: jobApplications.raw_data,
      })
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.user_id, userId),
          eq(jobApplications.status, 'applied')
        )
      );

    let ghostedCount = 0;
    let totalHopeScore = 0;

    for (const app of applications) {
      const platform = (app.raw_data as Record<string, unknown>)?.source as string | undefined;
      const hopeScore = calculateHopeScore(
        new Date(app.created_at),
        app.status,
        app.updated_at ? new Date(app.updated_at) : undefined,
        platform
      );
      totalHopeScore += hopeScore;
      if (hopeScore <= 30) ghostedCount++;
    }

    // Calculate overall health score (simplified)
    const activeCount = applications.length;
    const avgHope = activeCount > 0 ? totalHopeScore / activeCount : 100;
    const healthScore = Math.round(avgHope);

    return NextResponse.json({
      pending_approvals: pendingResult.count,
      active_directives: directivesResult.count,
      applications_today: todayResult.count,
      ghosted_applications: ghostedCount,
      health_score: healthScore,
    });
  } catch (error) {
    console.error('[Control Room Stats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
