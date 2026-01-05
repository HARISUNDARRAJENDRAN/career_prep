import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { generateRoadmap } from '@/lib/agents/agents/architect';
import { db } from '@/drizzle/db';
import { userProfiles } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

// Configure route for long-running AI generation
export const maxDuration = 120; // 2 minutes for roadmap generation
export const dynamic = 'force-dynamic';

/**
 * POST /api/roadmaps/generate
 * Trigger AI-powered roadmap generation using the Architect Agent
 * 
 * This endpoint allows manual triggering of roadmap generation,
 * useful for:
 * - Users who completed onboarding before the agent was fixed
 * - Regenerating roadmaps with updated skills
 * - Testing the Architect Agent
 */
export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's target roles
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, userId),
    });

    const targetRoles = profile?.target_roles || [];

    console.log(`[Roadmap Generate] Starting for user ${userId}`);
    console.log(`[Roadmap Generate] Target roles: ${targetRoles.join(', ') || 'None specified'}`);

    // Use the Architect Agent to generate the roadmap
    const result = await generateRoadmap(userId, { target_roles: targetRoles });

    if (!result.success) {
      console.error('[Roadmap Generate] Failed:', result.reasoning_trace?.slice(-3));
      return NextResponse.json(
        { 
          error: 'Roadmap generation failed',
          iterations: result.iterations,
          confidence: result.confidence,
          trace: result.reasoning_trace?.slice(-5),
        },
        { status: 500 }
      );
    }

    console.log(`[Roadmap Generate] Success! Roadmap ID: ${result.output?.roadmap_id}`);

    return NextResponse.json({
      success: true,
      roadmap_id: result.output?.roadmap_id,
      target_role: result.output?.target_role,
      modules_count: result.output?.modules_count,
      estimated_weeks: result.output?.estimated_weeks,
      iterations: result.iterations,
      confidence: result.confidence,
    });
  } catch (error) {
    console.error('[Roadmap Generate] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
