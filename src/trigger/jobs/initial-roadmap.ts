/**
 * Initial Roadmap Generator Job
 *
 * Triggered when: ONBOARDING_COMPLETED event is published
 * Purpose: Generate the user's first personalized learning roadmap
 *
 * This job creates a tailored learning path based on:
 * - User's target roles
 * - Current skills (from resume/onboarding)
 * - Industry best practices
 *
 * Uses OpenAI gpt-4o-mini for cost-effective generation.
 */

import { task } from '@trigger.dev/sdk';
import OpenAI from 'openai';

import { db } from '@/drizzle/db';
import {
  users,
  userProfiles,
  userSkills,
  skills,
  roadmaps,
  roadmapModules,
} from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import {
  shouldSkipEvent,
  markEventCompleted,
  markEventFailed,
  markEventProcessing,
} from '@/lib/agents/message-bus';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface InitialRoadmapPayload {
  event_id: string;
  user_id: string;
  target_roles: string[];
  skills_count: number;
  has_resume: boolean;
}

// Type for AI-generated roadmap module
interface GeneratedModule {
  title: string;
  description: string;
  skill_name: string;
  skill_category: string;
  learning_objectives: string[];
  resources: Array<{
    title: string;
    url: string;
    type: 'video' | 'article' | 'course' | 'project';
    duration_minutes?: number;
  }>;
  practice_exercises: Array<{
    title: string;
    description: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }>;
  estimated_hours: number;
  is_milestone: boolean;
}

interface GeneratedRoadmap {
  title: string;
  description: string;
  modules: GeneratedModule[];
}

export const initialRoadmapGenerator = task({
  id: 'architect.generate-initial-roadmap',
  run: async (payload: InitialRoadmapPayload) => {
    const { event_id, user_id, target_roles } = payload;

    // =========================================================================
    // IDEMPOTENCY CHECK - Must be first!
    // =========================================================================
    const idempotencyCheck = await shouldSkipEvent(event_id);
    if (idempotencyCheck.skip) {
      console.log(`Skipping event ${event_id}: ${idempotencyCheck.reason}`);
      return {
        success: true,
        skipped: true,
        reason: idempotencyCheck.reason,
      };
    }

    // Mark as processing AFTER idempotency check passes
    await markEventProcessing(event_id);

    try {
      console.log('='.repeat(60));
      console.log('[Initial Roadmap Generator] Starting roadmap generation');
      console.log(`  User ID: ${user_id}`);
      console.log(`  Target Roles: ${target_roles.join(', ')}`);
      console.log('='.repeat(60));

      // =========================================================================
      // Step 1: Fetch user profile and skills
      // =========================================================================
      const user = await db.query.users.findFirst({
        where: eq(users.clerk_id, user_id),
        with: {
          profile: true,
          skills: {
            with: {
              skill: true,
            },
          },
        },
      });

      if (!user) {
        throw new Error(`User not found: ${user_id}`);
      }

      // Extract current skills
      const currentSkills = user.skills
        .map((us) => us.skill?.name)
        .filter(Boolean) as string[];

      // Get work history and education for context
      const workHistory = user.profile?.work_history || [];
      const education = user.profile?.education || [];
      const yearsOfExperience = user.profile?.years_of_experience || 0;

      console.log(`  Current Skills: ${currentSkills.length}`);
      console.log(`  Years of Experience: ${yearsOfExperience}`);

      // =========================================================================
      // Step 2: Generate roadmap using OpenAI gpt-4o-mini (cheapest)
      // =========================================================================
      const primaryRole = target_roles[0] || 'Software Engineer';

      const prompt = buildRoadmapPrompt({
        targetRole: primaryRole,
        currentSkills,
        yearsOfExperience,
        workHistory,
        education,
      });

      console.log('[Initial Roadmap Generator] Calling OpenAI gpt-4o-mini...');

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert career coach and learning path architect.
You create personalized, actionable learning roadmaps that bridge skill gaps between a person's current abilities and their target role.
Your roadmaps are practical, with real resources and exercises.
Always respond with valid JSON only, no markdown formatting.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 4000,
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Empty response from OpenAI');
      }

      const generatedRoadmap: GeneratedRoadmap = JSON.parse(responseContent);

      console.log(`[Initial Roadmap Generator] Generated ${generatedRoadmap.modules.length} modules`);

      // =========================================================================
      // Step 3: Create roadmap in database
      // =========================================================================
      const [newRoadmap] = await db
        .insert(roadmaps)
        .values({
          user_id,
          title: generatedRoadmap.title,
          description: generatedRoadmap.description,
          target_role: primaryRole,
          status: 'active',
          progress_percentage: 0,
          metadata: {
            generated_by: 'architect_agent',
          },
        })
        .returning();

      console.log(`[Initial Roadmap Generator] Created roadmap: ${newRoadmap.id}`);

      // =========================================================================
      // Step 4: Create or find skills and create modules
      // =========================================================================
      for (let i = 0; i < generatedRoadmap.modules.length; i++) {
        const module = generatedRoadmap.modules[i];

        // Find or create the skill
        let skill = await db.query.skills.findFirst({
          where: eq(skills.name, module.skill_name),
        });

        if (!skill) {
          const [newSkill] = await db
            .insert(skills)
            .values({
              name: module.skill_name,
              category: module.skill_category,
              description: `Core skill for ${primaryRole}`,
            })
            .returning();
          skill = newSkill;
        }

        // Create the roadmap module
        await db.insert(roadmapModules).values({
          roadmap_id: newRoadmap.id,
          title: module.title,
          description: module.description,
          order_index: i,
          status: i === 0 ? 'available' : 'locked', // First module is available
          is_milestone: module.is_milestone,
          skill_id: skill.id,
          estimated_hours: module.estimated_hours,
          content: {
            learning_objectives: module.learning_objectives,
            resources: module.resources,
            practice_exercises: module.practice_exercises,
          },
        });
      }

      console.log(`[Initial Roadmap Generator] Created ${generatedRoadmap.modules.length} modules`);

      // Mark event as completed
      await markEventCompleted(event_id);

      console.log('='.repeat(60));
      console.log('[Initial Roadmap Generator] Roadmap generation complete!');
      console.log('='.repeat(60));

      return {
        success: true,
        roadmap_id: newRoadmap.id,
        roadmap_title: newRoadmap.title,
        modules_created: generatedRoadmap.modules.length,
        user_id,
        target_role: primaryRole,
      };
    } catch (error) {
      console.error('[Initial Roadmap Generator] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

interface PromptContext {
  targetRole: string;
  currentSkills: string[];
  yearsOfExperience: number;
  workHistory: Array<{
    title: string;
    company: string;
    description?: string;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    field_of_study?: string;
  }>;
}

function buildRoadmapPrompt(context: PromptContext): string {
  const { targetRole, currentSkills, yearsOfExperience, workHistory, education } = context;

  const skillsText = currentSkills.length > 0
    ? `Current skills: ${currentSkills.join(', ')}`
    : 'No existing skills recorded yet (new learner)';

  const workText = workHistory.length > 0
    ? `Work history:\n${workHistory.map((w) => `- ${w.title} at ${w.company}`).join('\n')}`
    : 'No work history recorded';

  const educationText = education.length > 0
    ? `Education:\n${education.map((e) => `- ${e.degree} in ${e.field_of_study || 'General'} from ${e.institution}`).join('\n')}`
    : 'No formal education recorded';

  return `Create a personalized learning roadmap for someone wanting to become a ${targetRole}.

LEARNER PROFILE:
- Years of experience: ${yearsOfExperience}
- ${skillsText}
- ${workText}
- ${educationText}

REQUIREMENTS:
1. Create 5-8 learning modules that progressively build skills
2. Start with fundamentals if they're a beginner, or advanced topics if experienced
3. Each module should focus on ONE specific skill
4. Include real, accessible learning resources (YouTube, freeCodeCamp, official docs, etc.)
5. Mark 1-2 modules as milestones (key achievements)
6. Make exercises practical and portfolio-worthy

RESPOND WITH THIS EXACT JSON STRUCTURE:
{
  "title": "Your Path to [Role]",
  "description": "A personalized roadmap based on your background...",
  "modules": [
    {
      "title": "Module title",
      "description": "What you'll learn and why it matters",
      "skill_name": "The specific skill (e.g., 'TypeScript', 'System Design')",
      "skill_category": "Category (e.g., 'Frontend', 'Backend', 'DevOps')",
      "learning_objectives": ["Objective 1", "Objective 2", "Objective 3"],
      "resources": [
        {
          "title": "Resource name",
          "url": "https://...",
          "type": "video|article|course|project",
          "duration_minutes": 60
        }
      ],
      "practice_exercises": [
        {
          "title": "Exercise name",
          "description": "What to build/do",
          "difficulty": "easy|medium|hard"
        }
      ],
      "estimated_hours": 10,
      "is_milestone": false
    }
  ]
}`;
}
