import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { roadmaps, roadmapModules } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

// Schema for updating a roadmap
const updateRoadmapSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  target_role: z.string().max(100).optional().nullable(),
  status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
  progress_percentage: z.number().min(0).max(100).optional(),
  metadata: z.object({
    generated_by: z.enum(['architect_agent', 'manual']),
    market_alignment_score: z.number().optional(),
    last_repathed_at: z.string().optional(),
    repath_reason: z.string().optional(),
  }).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/roadmaps/[id]
 * Get a specific roadmap with its modules
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { userId } = await auth();
    const { id } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const roadmap = await db.query.roadmaps.findFirst({
      where: and(
        eq(roadmaps.id, id),
        eq(roadmaps.user_id, userId)
      ),
      with: {
        modules: {
          orderBy: (modules, { asc }) => [asc(modules.order_index)],
        },
      },
    });

    if (!roadmap) {
      return NextResponse.json(
        { error: 'Roadmap not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ roadmap });
  } catch (error) {
    console.error('Error fetching roadmap:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/roadmaps/[id]
 * Update a specific roadmap
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { userId } = await auth();
    const { id } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify ownership
    const existingRoadmap = await db.query.roadmaps.findFirst({
      where: and(
        eq(roadmaps.id, id),
        eq(roadmaps.user_id, userId)
      ),
    });

    if (!existingRoadmap) {
      return NextResponse.json(
        { error: 'Roadmap not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validationResult = updateRoadmapSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Build update object excluding undefined values
    const updateData: Record<string, any> = {
      updated_at: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.target_role !== undefined) updateData.target_role = data.target_role;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.progress_percentage !== undefined) updateData.progress_percentage = data.progress_percentage;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const [updatedRoadmap] = await db
      .update(roadmaps)
      .set(updateData)
      .where(eq(roadmaps.id, id))
      .returning();

    return NextResponse.json({
      message: 'Roadmap updated',
      roadmap: updatedRoadmap,
    });
  } catch (error) {
    console.error('Error updating roadmap:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/roadmaps/[id]
 * Archive a roadmap (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { userId } = await auth();
    const { id } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify ownership
    const existingRoadmap = await db.query.roadmaps.findFirst({
      where: and(
        eq(roadmaps.id, id),
        eq(roadmaps.user_id, userId)
      ),
    });

    if (!existingRoadmap) {
      return NextResponse.json(
        { error: 'Roadmap not found' },
        { status: 404 }
      );
    }

    // Soft delete by setting status to 'archived'
    const [archivedRoadmap] = await db
      .update(roadmaps)
      .set({
        status: 'archived',
        updated_at: new Date(),
      })
      .where(eq(roadmaps.id, id))
      .returning();

    return NextResponse.json({
      message: 'Roadmap archived',
      roadmap: archivedRoadmap,
    });
  } catch (error) {
    console.error('Error archiving roadmap:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

