import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { users, userProfiles } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { withArcjetProtection } from '@/lib/arcjet';

// Schema for PATCH request validation
const updateProfileSchema = z.object({
  target_roles: z.array(z.string()).optional(),
  preferred_locations: z.array(z.string()).optional(),
  salary_expectation_min: z.number().optional(),
  salary_expectation_max: z.number().optional(),
  years_of_experience: z.number().optional(),
  bio: z.string().optional(),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    field_of_study: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    gpa: z.number().optional(),
  })).optional(),
  work_history: z.array(z.object({
    title: z.string(),
    company: z.string(),
    location: z.string().optional(),
    start_date: z.string(),
    end_date: z.string().optional(),
    description: z.string().optional(),
    skills_used: z.array(z.string()).optional(),
  })).optional(),
  is_public: z.boolean().optional(),
  public_bio: z.string().optional(),
});

/**
 * GET /api/users/profile
 * Fetch current user's profile with related data
 */
export async function GET(request: NextRequest) {
  // Apply Arcjet protection (rate limiting, bot detection, shield)
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch user with profile
    const user = await db.query.users.findFirst({
      where: eq(users.clerk_id, userId),
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, userId),
    });

    return NextResponse.json({
      user: {
        clerk_id: user.clerk_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        image_url: user.image_url,
        username: user.username,
        onboarding_completed: user.onboarding_completed,
        created_at: user.created_at,
      },
      profile: profile || null,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/profile
 * Update user's profile fields
 */
export async function PATCH(request: NextRequest) {
  // Apply Arcjet protection (rate limiting, bot detection, shield)
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validationResult = updateProfileSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Check if profile exists
    const existingProfile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, userId),
    });

    if (!existingProfile) {
      // Create new profile if doesn't exist
      const [newProfile] = await db.insert(userProfiles).values({
        user_id: userId,
        ...data,
        updated_at: new Date(),
      }).returning();

      return NextResponse.json({
        message: 'Profile created',
        profile: newProfile,
      }, { status: 201 });
    }

    // Update existing profile
    const [updatedProfile] = await db
      .update(userProfiles)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(userProfiles.user_id, userId))
      .returning();

    return NextResponse.json({
      message: 'Profile updated',
      profile: updatedProfile,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

