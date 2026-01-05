import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { userProfiles } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { withArcjetProtection } from '@/lib/arcjet';

/**
 * GET /api/applications/settings
 * Get user's auto-apply settings
 */
export async function GET(request: NextRequest) {
  // Apply Arcjet protection
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, userId),
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      settings: {
        enabled: profile.auto_apply_enabled,
        threshold: profile.auto_apply_threshold || 75,
        daily_limit: profile.auto_apply_daily_limit || 5,
        excluded_companies: profile.auto_apply_excluded_companies || [],
        require_review: profile.auto_apply_require_review,
        resume_is_embedded: profile.resume_is_embedded,
        resume_embedded_at: profile.resume_embedded_at,
        resume_filename: profile.resume_filename,
      },
    });
  } catch (error) {
    console.error('[Auto-Apply Settings API] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/applications/settings
 * Update user's auto-apply settings
 */
const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  threshold: z.number().min(50).max(100).optional(),
  daily_limit: z.number().min(1).max(20).optional(),
  excluded_companies: z.array(z.string()).optional(),
  require_review: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  // Apply Arcjet protection
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validationResult = updateSettingsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (data.enabled !== undefined) {
      updates.auto_apply_enabled = data.enabled;
    }
    if (data.threshold !== undefined) {
      updates.auto_apply_threshold = data.threshold;
    }
    if (data.daily_limit !== undefined) {
      updates.auto_apply_daily_limit = data.daily_limit;
    }
    if (data.excluded_companies !== undefined) {
      updates.auto_apply_excluded_companies = data.excluded_companies;
    }
    if (data.require_review !== undefined) {
      updates.auto_apply_require_review = data.require_review;
    }

    // Check if profile exists
    const existing = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, userId),
    });

    if (!existing) {
      // Create profile with settings
      const [created] = await db
        .insert(userProfiles)
        .values({
          user_id: userId,
          auto_apply_enabled: data.enabled ?? false,
          auto_apply_threshold: data.threshold ?? 75,
          auto_apply_daily_limit: data.daily_limit ?? 5,
          auto_apply_excluded_companies: data.excluded_companies ?? [],
          auto_apply_require_review: data.require_review ?? true,
        })
        .returning();

      return NextResponse.json({
        message: 'Settings created',
        settings: {
          enabled: created.auto_apply_enabled,
          threshold: created.auto_apply_threshold,
          daily_limit: created.auto_apply_daily_limit,
          excluded_companies: created.auto_apply_excluded_companies,
          require_review: created.auto_apply_require_review,
        },
      });
    }

    // Update existing profile
    const [updated] = await db
      .update(userProfiles)
      .set(updates)
      .where(eq(userProfiles.user_id, userId))
      .returning();

    return NextResponse.json({
      message: 'Settings updated',
      settings: {
        enabled: updated.auto_apply_enabled,
        threshold: updated.auto_apply_threshold,
        daily_limit: updated.auto_apply_daily_limit,
        excluded_companies: updated.auto_apply_excluded_companies,
        require_review: updated.auto_apply_require_review,
      },
    });
  } catch (error) {
    console.error('[Auto-Apply Settings API] PATCH Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
