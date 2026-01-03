/**
 * Roadmap Repather Job
 *
 * Triggered when: ROADMAP_REPATH_NEEDED event is published
 * Purpose: Re-generate roadmap modules based on new feedback
 *
 * Reasons for re-pathing:
 * - skill_verification_gaps: Interview revealed skill gaps
 * - market_shift: Market demand changed significantly
 * - rejection_feedback: Multiple rejections cited same skill gaps
 * - user_request: User manually requested new roadmap
 * - interview_performance: Poor interview performance patterns
 *
 * This job is part of the "Truth Loop" - it closes the feedback loop
 * between interview skill verification and the user's learning roadmap.
 */

import { task } from '@trigger.dev/sdk';
import { db } from '@/drizzle/db';
import {
  roadmaps,
  roadmapModules,
  userSkills,
  userProfiles,
  skills,
} from '@/drizzle/schema';
import { eq, and, asc, desc } from 'drizzle-orm';
import OpenAI from 'openai';

import {
  shouldSkipEvent,
  markEventCompleted,
  markEventFailed,
} from '@/lib/agents/message-bus';

interface RoadmapRepatherPayload {
  event_id: string;
  user_id: string;
  reason:
    | 'skill_verification_gaps'
    | 'market_shift'
    | 'rejection_feedback'
    | 'user_request'
    | 'interview_performance';
  details: {
    gaps?: string[];
    interview_id?: string;
    interview_type?: string;
    gaps_count?: number;
    verified_count?: number;
    improved_count?: number;
    [key: string]: unknown;
  };
}

interface ModuleGeneration {
  title: string;
  description: string;
  skill_name: string;
  estimated_hours: number;
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
  priority: 'high' | 'medium' | 'low';
}

export const roadmapRepather = task({
  id: 'architect.repath-roadmap',
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: RoadmapRepatherPayload) => {
    const { event_id, user_id, reason, details } = payload;

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

    try {
      console.log('='.repeat(60));
      console.log('[Roadmap Repather] Job triggered');
      console.log(`  User ID: ${user_id}`);
      console.log(`  Reason: ${reason}`);
      console.log(`  Details:`, JSON.stringify(details, null, 2));
      console.log('='.repeat(60));

      // Step 1: Fetch current active roadmap
      const currentRoadmap = await db.query.roadmaps.findFirst({
        where: and(
          eq(roadmaps.user_id, user_id),
          eq(roadmaps.status, 'active')
        ),
        with: {
          modules: {
            orderBy: [asc(roadmapModules.order_index)],
          },
        },
      });

      // Step 2: Fetch user's skills with verification data
      const userSkillsData = await db.query.userSkills.findMany({
        where: eq(userSkills.user_id, user_id),
        with: { skill: true },
      });

      // Step 3: Fetch user profile for context
      const userProfile = await db.query.userProfiles.findFirst({
        where: eq(userProfiles.user_id, user_id),
      });

      // Step 4: Identify skills that need focus based on reason
      const skillsNeedingFocus = identifySkillsNeedingFocus(
        userSkillsData,
        reason,
        details
      );

      console.log(`[Roadmap Repather] Skills needing focus: ${skillsNeedingFocus.length}`);
      skillsNeedingFocus.forEach((s) => {
        console.log(`  - ${s.name}: ${s.currentLevel} -> ${s.targetLevel} (${s.reason})`);
      });

      if (skillsNeedingFocus.length === 0) {
        console.log('[Roadmap Repather] No skills need repathing');
        await markEventCompleted(event_id);
        return {
          success: true,
          repathed: false,
          reason: 'No skills need focus',
        };
      }

      // Step 5: Generate new/updated modules using AI
      const newModules = await generateModulesWithAI(
        skillsNeedingFocus,
        userProfile?.target_roles || [],
        currentRoadmap?.modules || []
      );

      console.log(`[Roadmap Repather] Generated ${newModules.length} new modules`);

      // Step 6: Create or update roadmap
      let roadmapId: string;

      if (currentRoadmap) {
        // Update existing roadmap
        roadmapId = currentRoadmap.id;

        // Update roadmap metadata
        await db
          .update(roadmaps)
          .set({
            metadata: {
              ...currentRoadmap.metadata,
              generated_by: 'architect_agent',
              last_repathed_at: new Date().toISOString(),
              repath_reason: reason,
            },
            updated_at: new Date(),
          })
          .where(eq(roadmaps.id, roadmapId));

        // Get current max order_index
        const maxOrderIndex = currentRoadmap.modules.length > 0
          ? Math.max(...currentRoadmap.modules.map((m) => m.order_index))
          : -1;

        // Insert new modules (prioritized at the top or after current progress)
        const inProgressIndex = currentRoadmap.modules.findIndex(
          (m) => m.status === 'in_progress'
        );
        const insertAfterIndex = inProgressIndex >= 0
          ? currentRoadmap.modules[inProgressIndex].order_index
          : 0;

        // Shift existing modules down to make room
        if (inProgressIndex >= 0) {
          for (const module of currentRoadmap.modules) {
            if (module.order_index > insertAfterIndex) {
              await db
                .update(roadmapModules)
                .set({
                  order_index: module.order_index + newModules.length,
                  updated_at: new Date(),
                })
                .where(eq(roadmapModules.id, module.id));
            }
          }
        }

        // Insert new modules
        for (let i = 0; i < newModules.length; i++) {
          const module = newModules[i];
          const skillRecord = await db.query.skills.findFirst({
            where: eq(skills.name, module.skill_name),
          });

          await db.insert(roadmapModules).values({
            roadmap_id: roadmapId,
            title: module.title,
            description: module.description,
            order_index: insertAfterIndex + 1 + i,
            status: i === 0 ? 'available' : 'locked',
            is_milestone: module.priority === 'high',
            skill_id: skillRecord?.id || null,
            estimated_hours: module.estimated_hours,
            content: {
              learning_objectives: module.learning_objectives,
              resources: module.resources,
              practice_exercises: module.practice_exercises,
            },
          });
        }
      } else {
        // Create new roadmap
        const targetRole = userProfile?.target_roles?.[0] || 'Software Engineer';

        const [newRoadmap] = await db
          .insert(roadmaps)
          .values({
            user_id,
            title: `${targetRole} Roadmap`,
            description: `Personalized learning path to become a ${targetRole}`,
            target_role: targetRole,
            status: 'active',
            progress_percentage: 0,
            metadata: {
              generated_by: 'architect_agent',
              last_repathed_at: new Date().toISOString(),
              repath_reason: reason,
            },
          })
          .returning({ id: roadmaps.id });

        roadmapId = newRoadmap.id;

        // Insert all modules
        for (let i = 0; i < newModules.length; i++) {
          const module = newModules[i];
          const skillRecord = await db.query.skills.findFirst({
            where: eq(skills.name, module.skill_name),
          });

          await db.insert(roadmapModules).values({
            roadmap_id: roadmapId,
            title: module.title,
            description: module.description,
            order_index: i,
            status: i === 0 ? 'available' : 'locked',
            is_milestone: module.priority === 'high',
            skill_id: skillRecord?.id || null,
            estimated_hours: module.estimated_hours,
            content: {
              learning_objectives: module.learning_objectives,
              resources: module.resources,
              practice_exercises: module.practice_exercises,
            },
          });
        }
      }

      // Mark event as completed
      await markEventCompleted(event_id);

      console.log('[Roadmap Repather] Complete');
      console.log(`  Roadmap ID: ${roadmapId}`);
      console.log(`  Modules added: ${newModules.length}`);
      console.log(`  Reason: ${reason}`);

      return {
        success: true,
        repathed: true,
        roadmap_id: roadmapId,
        modules_added: newModules.length,
        skills_addressed: skillsNeedingFocus.map((s) => s.name),
        reason,
      };
    } catch (error) {
      console.error('[Roadmap Repather] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  },
});

/**
 * Identify which skills need focus based on the repath reason
 */
interface SkillFocus {
  name: string;
  skill_id: string;
  currentLevel: string;
  targetLevel: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

function identifySkillsNeedingFocus(
  userSkillsData: Array<{
    id: string;
    skill_id: string;
    proficiency_level: string;
    verification_metadata: {
      is_verified?: boolean;
      gap_identified?: boolean;
      verified_level?: string;
      recommendations?: string[];
    } | null;
    skill: { id: string; name: string; category: string | null } | null;
  }>,
  reason: RoadmapRepatherPayload['reason'],
  details: RoadmapRepatherPayload['details']
): SkillFocus[] {
  const skillsNeedingFocus: SkillFocus[] = [];

  switch (reason) {
    case 'skill_verification_gaps': {
      // Find skills where gap_identified is true
      const gapNames = (details.gaps as string[]) || [];

      for (const userSkill of userSkillsData) {
        const isInGapList = gapNames.some(
          (g) => g.toLowerCase() === userSkill.skill?.name?.toLowerCase()
        );
        const hasGap = userSkill.verification_metadata?.gap_identified;

        if (isInGapList || hasGap) {
          skillsNeedingFocus.push({
            name: userSkill.skill?.name || 'Unknown',
            skill_id: userSkill.skill_id,
            currentLevel: userSkill.verification_metadata?.verified_level || 'learning',
            targetLevel: userSkill.proficiency_level,
            reason: `Gap identified: verified at ${userSkill.verification_metadata?.verified_level || 'learning'}, claimed ${userSkill.proficiency_level}`,
            priority: 'high',
          });
        }
      }
      break;
    }

    case 'interview_performance': {
      // Focus on skills that weren't demonstrated well
      for (const userSkill of userSkillsData) {
        if (
          userSkill.verification_metadata?.is_verified === false ||
          userSkill.verification_metadata?.gap_identified
        ) {
          skillsNeedingFocus.push({
            name: userSkill.skill?.name || 'Unknown',
            skill_id: userSkill.skill_id,
            currentLevel: userSkill.verification_metadata?.verified_level || 'learning',
            targetLevel: userSkill.proficiency_level,
            reason: 'Poor interview performance',
            priority: 'high',
          });
        }
      }
      break;
    }

    case 'rejection_feedback': {
      // Focus on skills mentioned in rejection feedback
      const rejectionGaps = (details.gaps as string[]) || [];

      for (const gap of rejectionGaps) {
        const matchingSkill = userSkillsData.find(
          (s) => s.skill?.name?.toLowerCase() === gap.toLowerCase()
        );

        if (matchingSkill) {
          skillsNeedingFocus.push({
            name: matchingSkill.skill?.name || gap,
            skill_id: matchingSkill.skill_id,
            currentLevel: matchingSkill.proficiency_level,
            targetLevel: 'proficient',
            reason: 'Cited in rejection feedback',
            priority: 'high',
          });
        } else {
          // Skill not in user's list - suggest adding it
          skillsNeedingFocus.push({
            name: gap,
            skill_id: '',
            currentLevel: 'learning',
            targetLevel: 'proficient',
            reason: 'Missing skill cited in rejection',
            priority: 'high',
          });
        }
      }
      break;
    }

    case 'market_shift': {
      // Focus on trending skills the user is weak in
      for (const userSkill of userSkillsData) {
        const level = userSkill.proficiency_level;
        if (level === 'learning' || level === 'practicing') {
          skillsNeedingFocus.push({
            name: userSkill.skill?.name || 'Unknown',
            skill_id: userSkill.skill_id,
            currentLevel: level,
            targetLevel: 'proficient',
            reason: 'Market demand shift',
            priority: 'medium',
          });
        }
      }
      break;
    }

    case 'user_request':
    default: {
      // General repathing - focus on unverified or low-level skills
      for (const userSkill of userSkillsData) {
        if (!userSkill.verification_metadata?.is_verified) {
          skillsNeedingFocus.push({
            name: userSkill.skill?.name || 'Unknown',
            skill_id: userSkill.skill_id,
            currentLevel: userSkill.proficiency_level,
            targetLevel: getNextLevel(userSkill.proficiency_level),
            reason: 'User requested roadmap update',
            priority: 'medium',
          });
        }
      }
      break;
    }
  }

  // Sort by priority (high first)
  return skillsNeedingFocus.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

function getNextLevel(current: string): string {
  const levels = ['learning', 'practicing', 'proficient', 'expert'];
  const currentIndex = levels.indexOf(current);
  return levels[Math.min(currentIndex + 1, levels.length - 1)];
}

/**
 * Generate learning modules using AI based on skills that need focus
 */
async function generateModulesWithAI(
  skillsNeedingFocus: SkillFocus[],
  targetRoles: string[],
  existingModules: Array<{ title: string; skill_id: string | null }>
): Promise<ModuleGeneration[]> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Build context about existing modules to avoid duplication
  const existingModuleTitles = existingModules.map((m) => m.title);

  const prompt = `You are a learning architect designing personalized roadmap modules.

## Target Roles
${targetRoles.length > 0 ? targetRoles.join(', ') : 'Software Engineer'}

## Skills Needing Focus
${skillsNeedingFocus
  .map(
    (s) =>
      `- ${s.name}: Current level "${s.currentLevel}" -> Target "${s.targetLevel}" (${s.reason}) [Priority: ${s.priority}]`
  )
  .join('\n')}

## Existing Modules (avoid duplicating these)
${existingModuleTitles.length > 0 ? existingModuleTitles.join('\n') : 'None'}

## Your Task
Generate 1-2 focused learning modules for EACH skill that needs attention.
Each module should help bridge the gap from current level to target level.

For each module include:
1. A clear, actionable title
2. Brief description of what will be learned
3. Estimated hours to complete (realistic, 2-10 hours per module)
4. 2-3 learning objectives
5. 2-3 learning resources (mix of video, article, course, project)
6. 1-2 practice exercises with difficulty levels

Make resources practical and actionable. Include real learning platforms where possible (YouTube, freeCodeCamp, Coursera, LeetCode, etc.).

Respond in JSON format:
{
  "modules": [
    {
      "title": "Module title",
      "description": "What you'll learn",
      "skill_name": "Python",
      "estimated_hours": 5,
      "learning_objectives": ["Objective 1", "Objective 2"],
      "resources": [
        {"title": "Resource name", "url": "https://...", "type": "video", "duration_minutes": 30}
      ],
      "practice_exercises": [
        {"title": "Exercise name", "description": "What to do", "difficulty": "medium"}
      ],
      "priority": "high"
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are an expert learning architect. Create practical, focused learning modules that help people improve their technical skills efficiently. Always respond with valid JSON.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  const parsed = JSON.parse(content) as { modules: ModuleGeneration[] };

  // Validate and clean up the response
  return parsed.modules.map((module) => ({
    title: module.title || 'Untitled Module',
    description: module.description || '',
    skill_name: module.skill_name || 'General',
    estimated_hours: Math.max(1, Math.min(20, module.estimated_hours || 5)),
    learning_objectives: module.learning_objectives || [],
    resources: (module.resources || []).map((r) => ({
      title: r.title || 'Resource',
      url: r.url || '#',
      type: r.type || 'article',
      duration_minutes: r.duration_minutes,
    })),
    practice_exercises: (module.practice_exercises || []).map((e) => ({
      title: e.title || 'Exercise',
      description: e.description || '',
      difficulty: e.difficulty || 'medium',
    })),
    priority: module.priority || 'medium',
  }));
}
