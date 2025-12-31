import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { roadmaps } from '@/drizzle/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';

// Schema for creating a new roadmap
const createRoadmapSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  target_role: z.string().max(100).optional(),
  generated_by: z.enum(['architect_agent', 'manual']).default('manual'),
  market_alignment_score: z.number().optional(),
});

/**
 * GET /api/roadmaps
 * List all roadmaps for the current user
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userRoadmaps = await db.query.roadmaps.findMany({
      where: eq(roadmaps.user_id, userId),
      orderBy: [desc(roadmaps.created_at)],
      with: {
        modules: true,
      },
    });

    return NextResponse.json({
      roadmaps: userRoadmaps,
      count: userRoadmaps.length,
    });
  } catch (error) {
    console.error('Error fetching roadmaps:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/roadmaps
 * Create a new roadmap for the current user
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validationResult = createRoadmapSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    const [newRoadmap] = await db.insert(roadmaps).values({
      user_id: userId,
      title: data.title,
      description: data.description,
      target_role: data.target_role,
      status: 'active',
      progress_percentage: 0,
      metadata: {
        generated_by: data.generated_by,
        market_alignment_score: data.market_alignment_score,
      },
    }).returning();

    return NextResponse.json({
      message: 'Roadmap created',
      roadmap: newRoadmap,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating roadmap:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

