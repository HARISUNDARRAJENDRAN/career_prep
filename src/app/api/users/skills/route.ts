import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { userSkills, skills } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

// Schema for updating user skill
const updateUserSkillSchema = z.object({
  skill_id: z.string().min(1),
  proficiency_level: z.enum(['learning', 'practicing', 'proficient', 'expert']).optional(),
  verification_metadata: z.object({
    is_verified: z.boolean().optional(),
    verification_count: z.number().optional(),
    source: z.enum(['resume', 'manual', 'interview']).optional(),
    needs_interview_focus: z.boolean().optional(),
  }).optional(),
});

/**
 * GET /api/users/skills
 * List current user's skills with proficiency levels and verification status
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

    const userSkillsList = await db.query.userSkills.findMany({
      where: eq(userSkills.user_id, userId),
      with: {
        skill: true,
      },
    });

    // Group skills by proficiency level
    const groupedSkills = {
      expert: userSkillsList.filter(s => s.proficiency_level === 'expert'),
      proficient: userSkillsList.filter(s => s.proficiency_level === 'proficient'),
      practicing: userSkillsList.filter(s => s.proficiency_level === 'practicing'),
      learning: userSkillsList.filter(s => s.proficiency_level === 'learning'),
    };

    // Calculate stats
    const stats = {
      total: userSkillsList.length,
      verified: userSkillsList.filter(s => s.verification_metadata?.is_verified).length,
      by_proficiency: {
        expert: groupedSkills.expert.length,
        proficient: groupedSkills.proficient.length,
        practicing: groupedSkills.practicing.length,
        learning: groupedSkills.learning.length,
      },
    };

    return NextResponse.json({
      skills: userSkillsList,
      grouped: groupedSkills,
      stats,
    });
  } catch (error) {
    console.error('Error fetching user skills:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/skills
 * Update a user's skill proficiency or verification status
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validationResult = updateUserSkillSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Find the user skill
    const existingUserSkill = await db.query.userSkills.findFirst({
      where: and(
        eq(userSkills.user_id, userId),
        eq(userSkills.skill_id, data.skill_id)
      ),
    });

    if (!existingUserSkill) {
      return NextResponse.json(
        { error: 'Skill not found in user profile' },
        { status: 404 }
      );
    }

    // Merge verification metadata if provided
    // Ensure required fields are always present
    const existingMetadata = existingUserSkill.verification_metadata || {
      is_verified: false,
      verification_count: 0,
    };
    
    const updatedMetadata = data.verification_metadata
      ? {
          ...existingMetadata,
          ...data.verification_metadata,
          // Ensure required fields remain present
          is_verified: data.verification_metadata.is_verified ?? existingMetadata.is_verified,
          verification_count: data.verification_metadata.verification_count ?? existingMetadata.verification_count,
        }
      : existingMetadata;

    const [updatedUserSkill] = await db
      .update(userSkills)
      .set({
        proficiency_level: data.proficiency_level || existingUserSkill.proficiency_level,
        verification_metadata: updatedMetadata,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(userSkills.user_id, userId),
          eq(userSkills.skill_id, data.skill_id)
        )
      )
      .returning();

    return NextResponse.json({
      message: 'Skill updated',
      userSkill: updatedUserSkill,
    });
  } catch (error) {
    console.error('Error updating user skill:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/skills
 * Remove a skill from user's profile
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get('skill_id');

    if (!skillId) {
      return NextResponse.json(
        { error: 'skill_id query parameter is required' },
        { status: 400 }
      );
    }

    // Verify the skill exists in user's profile
    const existingUserSkill = await db.query.userSkills.findFirst({
      where: and(
        eq(userSkills.user_id, userId),
        eq(userSkills.skill_id, skillId)
      ),
    });

    if (!existingUserSkill) {
      return NextResponse.json(
        { error: 'Skill not found in user profile' },
        { status: 404 }
      );
    }

    await db
      .delete(userSkills)
      .where(
        and(
          eq(userSkills.user_id, userId),
          eq(userSkills.skill_id, skillId)
        )
      );

    return NextResponse.json({
      message: 'Skill removed from profile',
    });
  } catch (error) {
    console.error('Error removing user skill:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

