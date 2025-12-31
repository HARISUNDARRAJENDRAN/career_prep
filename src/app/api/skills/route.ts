import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { skills, userSkills } from '@/drizzle/schema';
import { eq, ilike, desc } from 'drizzle-orm';
import { z } from 'zod';

// Schema for creating a new skill in the catalog
const createSkillSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().max(100).optional(),
  description: z.string().optional(),
  metadata: z.object({
    related_skills: z.array(z.string()).optional(),
    prerequisites: z.array(z.string()).optional(),
    learning_resources: z.array(z.object({
      title: z.string(),
      url: z.string(),
      type: z.string(),
    })).optional(),
  }).optional(),
});

// Schema for adding a skill to user's profile
const addUserSkillSchema = z.object({
  skill_id: z.string().min(1),
  proficiency_level: z.enum(['learning', 'practicing', 'proficient', 'expert']).optional(),
});

/**
 * GET /api/skills
 * List all skills from the master catalog
 * Supports search via ?q=query and category via ?category=Backend
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let skillsQuery = db.select().from(skills);

    // Build where conditions
    const conditions = [];
    if (query) {
      conditions.push(ilike(skills.name, `%${query}%`));
    }
    if (category) {
      conditions.push(eq(skills.category, category));
    }

    const allSkills = await db.query.skills.findMany({
      where: conditions.length > 0 ? conditions[0] : undefined,
      orderBy: [desc(skills.demand_score)],
      limit,
      offset,
    });

    // Get unique categories for filtering
    const categoriesResult = await db
      .selectDistinct({ category: skills.category })
      .from(skills);
    
    const categories = categoriesResult
      .map(r => r.category)
      .filter((c): c is string => c !== null);

    return NextResponse.json({
      skills: allSkills,
      categories,
      pagination: {
        limit,
        offset,
        total: allSkills.length,
      },
    });
  } catch (error) {
    console.error('Error fetching skills:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skills
 * Add a skill to the current user's profile OR create a new skill in catalog
 * If body has skill_id: adds existing skill to user
 * If body has name: creates new skill in catalog (admin only in future)
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

    // Check if this is adding an existing skill to user
    if (body.skill_id) {
      const validationResult = addUserSkillSchema.safeParse(body);

      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Invalid request body', details: validationResult.error.flatten() },
          { status: 400 }
        );
      }

      const data = validationResult.data;

      // Verify skill exists
      const skill = await db.query.skills.findFirst({
        where: eq(skills.id, data.skill_id),
      });

      if (!skill) {
        return NextResponse.json(
          { error: 'Skill not found' },
          { status: 404 }
        );
      }

      // Check if user already has this skill
      const existingUserSkill = await db.query.userSkills.findFirst({
        where: eq(userSkills.skill_id, data.skill_id),
      });

      if (existingUserSkill) {
        return NextResponse.json(
          { error: 'Skill already added to profile' },
          { status: 409 }
        );
      }

      // Add skill to user's profile
      const [newUserSkill] = await db.insert(userSkills).values({
        user_id: userId,
        skill_id: data.skill_id,
        proficiency_level: data.proficiency_level || 'learning',
        verification_metadata: {
          is_verified: false,
          verification_count: 0,
          source: 'manual',
          claimed_at: new Date().toISOString(),
        },
      }).returning();

      return NextResponse.json({
        message: 'Skill added to profile',
        userSkill: newUserSkill,
      }, { status: 201 });
    }

    // Creating a new skill in catalog
    const validationResult = createSkillSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Check if skill already exists
    const existingSkill = await db.query.skills.findFirst({
      where: eq(skills.name, data.name),
    });

    if (existingSkill) {
      return NextResponse.json(
        { error: 'Skill already exists in catalog' },
        { status: 409 }
      );
    }

    const [newSkill] = await db.insert(skills).values({
      name: data.name,
      category: data.category,
      description: data.description,
      metadata: data.metadata,
    }).returning();

    return NextResponse.json({
      message: 'Skill created',
      skill: newSkill,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating skill:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

