'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { users, userProfiles, userSkills, skills } from '@/drizzle/schema';
import { eq, sql } from 'drizzle-orm';
import {
  careerGoalsSchema,
  experienceSchema,
  educationSchema,
  workHistorySchema,
  ONBOARDING_STEPS,
  type CareerGoalsData,
  type ExperienceData,
  type EducationData,
  type WorkHistoryData,
  type OnboardingStep,
} from '@/lib/validations/onboarding';
// Vercel Blob not needed - we don't store resume files, only extracted data
import crypto from 'crypto';
import { normalizeSkills, addSkillToCatalog } from '@/lib/skills-normalizer';
import { publishAgentEvent } from '@/lib/agents/message-bus';

type ActionResult = {
  success: boolean;
  error?: string;
};

// Ensure user exists in database (create if not exists from Clerk data)
async function ensureUserExists(userId: string): Promise<boolean> {
  // First check if user already exists by clerk_id
  const existingUser = await db.query.users.findFirst({
    where: eq(users.clerk_id, userId),
  });

  if (existingUser) {
    return true;
  }

  // User doesn't exist, fetch from Clerk and create
  const clerkUser = await currentUser();
  if (!clerkUser) {
    return false;
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) {
    console.error('No email found for Clerk user');
    return false;
  }

  try {
    // Check if there's an orphaned user with the same email (e.g., user was deleted 
    // from Clerk but not from DB, then re-signed up with same email)
    const orphanedUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (orphanedUser) {
      // Delete the orphaned record - cascading deletes will clean up related tables
      // (user_profiles, user_skills, interviews, etc.)
      // We can't just update clerk_id because it's a primary key with foreign key references
      console.log(`Found orphaned user with email ${email}, deleting old record and creating fresh one`);
      await db.delete(users).where(eq(users.clerk_id, orphanedUser.clerk_id));
      
      // Now create fresh user record with new clerk_id
      await db.insert(users).values({
        clerk_id: clerkUser.id,
        email: email,
        first_name: clerkUser.firstName ?? null,
        last_name: clerkUser.lastName ?? null,
        image_url: clerkUser.imageUrl ?? null,
        onboarding_completed: false,
        onboarding_step: ONBOARDING_STEPS.CAREER_GOALS,
      });
      
      console.log(`Successfully recreated user with email ${email}`);
      return true;
    }

    // No orphaned user, create new record
    await db.insert(users).values({
      clerk_id: clerkUser.id,
      email: email,
      first_name: clerkUser.firstName ?? null,
      last_name: clerkUser.lastName ?? null,
      image_url: clerkUser.imageUrl ?? null,
      onboarding_completed: false,
      onboarding_step: ONBOARDING_STEPS.CAREER_GOALS,
    });
    
    return true;
  } catch (error: any) {
    // Log the actual error for debugging
    console.error('Failed to create/update user:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      constraint: error?.constraint,
    });
    
    // Verify if user exists despite the error
    const userCheck = await db.query.users.findFirst({
      where: eq(users.clerk_id, userId),
    });
    
    if (userCheck) {
      console.log('User exists despite error - continuing');
      return true;
    }
    
    // User doesn't exist and insert failed - this is a real problem
    console.error('CRITICAL: Cannot create user and user does not exist');
    return false;
  }
}

// Get current user's onboarding state
export async function getOnboardingState(): Promise<{
  step: OnboardingStep;
  completed: boolean;
  profile: any;
}> {
  const { userId } = await auth();

  if (!userId) {
    return { step: ONBOARDING_STEPS.CAREER_GOALS, completed: false, profile: null };
  }

  // Ensure user exists in database
  const userCreated = await ensureUserExists(userId);
  
  if (!userCreated) {
    console.error('Could not ensure user exists, returning default state');
    return { step: ONBOARDING_STEPS.CAREER_GOALS, completed: false, profile: null };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.clerk_id, userId),
  });

  if (!user) {
    console.error('User not found after ensuring existence');
    return { step: ONBOARDING_STEPS.CAREER_GOALS, completed: false, profile: null };
  }

  // Fetch existing profile if any
  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.user_id, userId),
  });

  return {
    step: user.onboarding_step as OnboardingStep,
    completed: user.onboarding_completed,
    profile,
  };
}

// Save Step 1: Career Goals
export async function saveCareerGoals(data: CareerGoalsData): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  // Validate input
  const result = careerGoalsSchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error.issues[0]?.message || 'Invalid data' };
  }

  try {
    // Ensure user exists in database (handles case where webhook hasn't fired yet)
    const userExists = await ensureUserExists(userId);
    if (!userExists) {
      return { success: false, error: 'Failed to create user record' };
    }

    // Check if profile exists
    const existingProfile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, userId),
    });

    if (existingProfile) {
      // Update existing profile
      await db
        .update(userProfiles)
        .set({
          target_roles: result.data.targetRoles,
          preferred_locations: result.data.preferredLocations,
          salary_expectation_min: result.data.salaryMin,
          salary_expectation_max: result.data.salaryMax,
          bio: result.data.bio,
          updated_at: new Date(),
        })
        .where(eq(userProfiles.user_id, userId));
    } else {
      // Create new profile
      await db.insert(userProfiles).values({
        user_id: userId,
        target_roles: result.data.targetRoles,
        preferred_locations: result.data.preferredLocations,
        salary_expectation_min: result.data.salaryMin,
        salary_expectation_max: result.data.salaryMax,
        bio: result.data.bio,
      });
    }

    // Update user's onboarding step
    await db
      .update(users)
      .set({
        onboarding_step: ONBOARDING_STEPS.EXPERIENCE,
        updated_at: new Date(),
      })
      .where(eq(users.clerk_id, userId));

    return { success: true };
  } catch (error) {
    console.error('Error saving career goals:', error);
    return { success: false, error: 'Failed to save career goals' };
  }
}

// Save Step 2: Experience
export async function saveExperience(data: ExperienceData): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  // Validate input
  const result = experienceSchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error.issues[0]?.message || 'Invalid data' };
  }

  try {
    await db
      .update(userProfiles)
      .set({
        years_of_experience: result.data.years_of_experience,
        salary_expectation_min: result.data.salary_expectation_min,
        salary_expectation_max: result.data.salary_expectation_max,
        updated_at: new Date(),
      })
      .where(eq(userProfiles.user_id, userId));

    // Update user's onboarding step
    await db
      .update(users)
      .set({
        onboarding_step: ONBOARDING_STEPS.EDUCATION,
        updated_at: new Date(),
      })
      .where(eq(users.clerk_id, userId));

    return { success: true };
  } catch (error) {
    console.error('Error saving experience:', error);
    return { success: false, error: 'Failed to save experience' };
  }
}

// Save Step 3: Education
export async function saveEducation(data: EducationData): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  // Validate input
  const result = educationSchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error.issues[0]?.message || 'Invalid data' };
  }

  try {
    // Use the education array from validated data
    const educationData = result.data.education;

    await db
      .update(userProfiles)
      .set({
        education: educationData,
        updated_at: new Date(),
      })
      .where(eq(userProfiles.user_id, userId));

    // Update user's onboarding step
    await db
      .update(users)
      .set({
        onboarding_step: ONBOARDING_STEPS.WORK_HISTORY,
        updated_at: new Date(),
      })
      .where(eq(users.clerk_id, userId));

    return { success: true };
  } catch (error) {
    console.error('Error saving education:', error);
    return { success: false, error: 'Failed to save education' };
  }
}

// Save Step 4: Work History (optional - can skip)
export async function saveWorkHistory(data: WorkHistoryData): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  // Validate input
  const result = workHistorySchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error.issues[0]?.message || 'Invalid data' };
  }

  try {
    // Use the work_history array from validated data
    const workHistoryData = result.data.work_history;

    await db
      .update(userProfiles)
      .set({
        work_history: workHistoryData,
        updated_at: new Date(),
      })
      .where(eq(userProfiles.user_id, userId));

    // Update user's onboarding step to complete
    await db
      .update(users)
      .set({
        onboarding_step: ONBOARDING_STEPS.COMPLETE,
        updated_at: new Date(),
      })
      .where(eq(users.clerk_id, userId));

    return { success: true };
  } catch (error) {
    console.error('Error saving work history:', error);
    return { success: false, error: 'Failed to save work history' };
  }
}

// Skip work history step
export async function skipWorkHistory(): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    // Update user's onboarding step to complete
    await db
      .update(users)
      .set({
        onboarding_step: ONBOARDING_STEPS.COMPLETE,
        updated_at: new Date(),
      })
      .where(eq(users.clerk_id, userId));

    return { success: true };
  } catch (error) {
    console.error('Error skipping work history:', error);
    return { success: false, error: 'Failed to skip work history' };
  }
}

// Complete onboarding
export async function completeOnboarding(): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    // Update user's onboarding status
    await db
      .update(users)
      .set({
        onboarding_completed: true,
        onboarding_step: ONBOARDING_STEPS.COMPLETE,
        updated_at: new Date(),
      })
      .where(eq(users.clerk_id, userId));

    // Fetch user profile data for the event
    const userProfile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, userId),
    });

    // Count user's skills
    const userSkillsCount = await db.query.userSkills.findMany({
      where: eq(userSkills.user_id, userId),
    });

    // Publish ONBOARDING_COMPLETED event to trigger initial roadmap generation
    // This event is handled by the Architect Agent to create a personalized learning path
    try {
      await publishAgentEvent({
        type: 'ONBOARDING_COMPLETED',
        payload: {
          user_id: userId,
          target_roles: userProfile?.target_roles || [],
          skills_count: userSkillsCount.length,
          has_resume: !!userProfile?.resume_text,
        },
      });
      console.log('[Onboarding] Published ONBOARDING_COMPLETED event');
    } catch (eventError) {
      // Log but don't fail onboarding if event publishing fails
      // Events are persisted to DB and can be retried
      console.error('[Onboarding] Failed to publish event:', eventError);
    }

    return { success: true };
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return { success: false, error: 'Failed to complete onboarding' };
  }
}

// Go back to previous step
export async function goToPreviousStep(currentStep: OnboardingStep): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  // Map current step to previous step
  const stepOrder: OnboardingStep[] = [
    ONBOARDING_STEPS.CAREER_GOALS,
    ONBOARDING_STEPS.EXPERIENCE,
    ONBOARDING_STEPS.EDUCATION,
    ONBOARDING_STEPS.WORK_HISTORY,
    ONBOARDING_STEPS.RESUME_UPLOAD,
    ONBOARDING_STEPS.RESUME_REVIEW,
    ONBOARDING_STEPS.COMPLETE,
  ];

  const currentIndex = stepOrder.indexOf(currentStep);
  const previousStep = currentIndex > 0 ? stepOrder[currentIndex - 1] : stepOrder[0];

  try {
    await db
      .update(users)
      .set({
        onboarding_step: previousStep,
        updated_at: new Date(),
      })
      .where(eq(users.clerk_id, userId));

    return { success: true };
  } catch (error) {
    console.error('Error going to previous step:', error);
    return { success: false, error: 'Failed to go to previous step' };
  }
}

/**
 * Upload resume and parse it using Python service
 * File is NOT stored - only the extracted data is saved for privacy
 */
export async function uploadResume(
  formData: FormData
): Promise<ActionResult & { parsedData?: any }> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  const file = formData.get('resume') as File;
  if (!file) {
    return { success: false, error: 'No file provided' };
  }

  try {
    // Ensure user exists
    await ensureUserExists(userId);

    // Validate MIME type (not just extension)
    const validMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!validMimeTypes.includes(file.type)) {
      return { success: false, error: 'Invalid file type. Only PDF and DOCX are allowed.' };
    }

    // Send directly to Python parsing service (no blob storage needed)
    const parseFormData = new FormData();
    parseFormData.append('file', file);

    // Use AbortController for timeout (30 seconds max for synchronous parsing)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      // Use Python resume parser service
      const parseUrl = process.env.RESUME_PARSER_URL || 'http://localhost:8001/parse-resume';

      console.log('Sending resume to parser at:', parseUrl);

      const parseResponse = await fetch(
        parseUrl,
        {
          method: 'POST',
          body: parseFormData,
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!parseResponse.ok) {
        const errorData = await parseResponse.json().catch(() => ({}));
        console.error('Parser error response:', errorData);
        throw new Error(errorData.detail || 'Failed to parse resume');
      }

      const { raw_text, parsed_data } = await parseResponse.json();

      console.log('Resume parsed successfully, skills found:', parsed_data?.skills?.length || 0);

      // Update user profile with EXTRACTED data only (not the original file)
      await db
        .update(userProfiles)
        .set({
          resume_filename: file.name,
          resume_text: raw_text,
          resume_parsed_data: parsed_data,
          resume_uploaded_at: new Date(),
          updated_at: new Date(),
          // Initialize Vector DB flags (Phase 3.6 integration)
          resume_is_embedded: false,
          resume_embedded_at: null,
          resume_vector_metadata: {
            last_sync_hash: crypto.createHash('sha256').update(raw_text).digest('hex'),
          },
        })
        .where(eq(userProfiles.user_id, userId));

      // Return parsed data for review step (don't insert into DB yet)
      return {
        success: true,
        parsedData: parsed_data,
      };
    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        console.log('Resume parsing timeout');

        return {
          success: false,
          error: 'Resume processing timed out. Please try with a smaller file or try again later.',
        };
      }

      throw fetchError;
    }
  } catch (error: any) {
    console.error('Error uploading resume:', error);
    return { success: false, error: error.message || 'Failed to upload resume' };
  }
}

/**
 * Confirm reviewed skills and insert into database with normalization
 */
export async function confirmResumeSkills(data: {
  skills: string[];
  projects?: Array<{ title: string; description: string }>;
  certifications?: string[];
}): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    // Normalize skills to match master catalog
    const normalizedSkills = await normalizeSkills(data.skills);

    // Insert user skills with normalization metadata
    for (const normalizedSkill of normalizedSkills) {
      let skillId = normalizedSkill.matched_skill_id;
      let skillName = normalizedSkill.matched_skill_name;

      // If skill not in catalog, add it automatically
      if (!skillId && normalizedSkill.should_add_to_catalog) {
        console.log(`Adding new skill to catalog: ${normalizedSkill.original}`);
        skillId = await addSkillToCatalog(normalizedSkill.original);
        skillName = normalizedSkill.original;
      }

      if (skillId && skillName) {
        await db
          .insert(userSkills)
          .values({
            user_id: userId,
            skill_id: skillId,
            proficiency_level: 'practicing', // Default, will be verified in interview
            verification_metadata: {
              is_verified: false,
              verification_count: 0,
              source: 'resume',
              claimed_at: new Date().toISOString(),
              resume_claim_validated: null,
              needs_interview_focus: normalizedSkill.confidence < 0.8,
              normalization_metadata: {
                original_claim: normalizedSkill.original,
                normalized_to: skillName,
                confidence: normalizedSkill.confidence || 1.0,
              },
            },
          })
          .onConflictDoNothing();
      }
    }

    // Update user profile with projects and certifications
    await db
      .update(userProfiles)
      .set({
        resume_parsed_data: sql`
          COALESCE(resume_parsed_data, '{}'::jsonb) ||
          ${JSON.stringify({ projects: data.projects, certifications: data.certifications })}::jsonb
        `,
        updated_at: new Date(),
      })
      .where(eq(userProfiles.user_id, userId));

    // Mark onboarding step as complete
    await db
      .update(users)
      .set({
        onboarding_step: ONBOARDING_STEPS.COMPLETE,
        updated_at: new Date(),
      })
      .where(eq(users.clerk_id, userId));

    return { success: true };
  } catch (error) {
    console.error('Error confirming resume skills:', error);
    return { success: false, error: 'Failed to save skills' };
  }
}

/**
 * Skip resume upload step
 */
export async function skipResume(): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    await db
      .update(users)
      .set({
        onboarding_step: ONBOARDING_STEPS.COMPLETE,
        updated_at: new Date(),
      })
      .where(eq(users.clerk_id, userId));

    return { success: true };
  } catch (error) {
    console.error('Error skipping resume:', error);
    return { success: false, error: 'Failed to skip resume' };
  }
}
