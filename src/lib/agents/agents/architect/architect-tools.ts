/**
 * Architect Agent Tools
 *
 * Tool definitions for roadmap generation and learning path management.
 *
 * @see docs/agentic-improvements/07-TOOL_SELECTION.md
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { toolRegistry, type ToolDefinition } from '../../tools/tool-registry';
import { db } from '@/drizzle/db';
import {
  roadmaps,
  roadmapModules,
  skills,
  userSkills,
  userProfiles,
  marketInsights,
} from '@/drizzle/schema';
import { eq, desc, and } from 'drizzle-orm';
import {
  buildRoadmapGenerationPrompt,
  buildSkillGapAnalysisPrompt,
  buildRepathingPrompt,
  buildModuleGenerationPrompt,
  buildProgressEvaluationPrompt,
  ARCHITECT_PROMPTS,
} from './architect-prompts';
import { safeJsonParse } from '../../utils/safe-json';

// ============================================================================
// Input/Output Schemas
// ============================================================================

const UserProfileFetcherInput = z.object({
  user_id: z.string(),
});

const UserProfileFetcherOutput = z.object({
  user_id: z.string(),
  target_roles: z.array(z.string()),
  years_of_experience: z.number().optional().default(0),
  current_skills: z.array(z.object({
    name: z.string(),
    proficiency: z.number(),
    verified: z.boolean(),
  })),
  work_history: z.array(z.object({
    title: z.string(),
    company: z.string(),
  })),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
  })),
});

const SkillGapAnalyzerInput = z.object({
  target_role: z.string(),
  current_skills: z.array(z.object({
    name: z.string(),
    proficiency: z.number(),
  })),
  role_requirements: z.array(z.string()).optional(),
});

const SkillGapAnalyzerOutput = z.object({
  critical_gaps: z.array(z.object({
    skill: z.string(),
    current_level: z.number(),
    required_level: z.number(),
    effort_hours: z.number(),
    priority: z.number(),
  })),
  important_gaps: z.array(z.unknown()),
  optional_gaps: z.array(z.unknown()),
  recommended_order: z.array(z.string()),
  total_estimated_hours: z.number(),
  readiness_score: z.number(),
  summary: z.string(),
});

const RoadmapGeneratorInput = z.object({
  user_id: z.string(),
  target_roles: z.array(z.string()),
  current_skills: z.array(z.object({
    name: z.string(),
    proficiency: z.number(),
  })),
  years_of_experience: z.number().optional().default(0),
  work_history: z.array(z.object({ title: z.string(), company: z.string() })).optional(),
  education: z.array(z.object({ degree: z.string(), institution: z.string() })).optional(),
});

const RoadmapGeneratorOutput = z.object({
  title: z.string(),
  description: z.string(),
  estimated_weeks: z.number(),
  modules: z.array(z.object({
    title: z.string(),
    description: z.string(),
    skill_name: z.string(),
    skill_category: z.string(),
    learning_objectives: z.array(z.string()),
    resources: z.array(z.object({
      title: z.string(),
      url: z.string(),
      type: z.string(),
      duration_minutes: z.number().optional(),
    })),
    practice_exercises: z.array(z.object({
      title: z.string(),
      description: z.string(),
      difficulty: z.string(),
    })),
    estimated_hours: z.number(),
    is_milestone: z.boolean(),
  })),
});

const RoadmapPersisterInput = z.object({
  user_id: z.string(),
  roadmap: z.object({
    title: z.string(),
    description: z.string(),
    target_role: z.string(),
    estimated_weeks: z.number(),
    modules: z.array(z.unknown()),
  }),
});

const RoadmapPersisterOutput = z.object({
  roadmap_id: z.string(),
  modules_created: z.number(),
  success: z.boolean(),
});

const RepathAnalyzerInput = z.object({
  roadmap_id: z.string(),
  trigger_reason: z.enum(['market_shift', 'goal_change', 'progress_update', 'skill_verified']),
  context: z.object({
    market_trends: z.array(z.string()).optional(),
    new_goals: z.array(z.string()).optional(),
    verified_skills: z.array(z.string()).optional(),
    progress_ahead: z.boolean().optional(),
  }),
});

const RepathAnalyzerOutput = z.object({
  should_repath: z.boolean(),
  changes: z.array(z.object({
    type: z.enum(['add', 'remove', 'reorder', 'update']),
    module: z.string(),
    reason: z.string(),
  })),
  new_priorities: z.array(z.string()),
  timeline_adjustment: z.string(),
  reasoning: z.string(),
});

const ProgressEvaluatorInput = z.object({
  roadmap_id: z.string(),
});

const ProgressEvaluatorOutput = z.object({
  overall_progress_percentage: z.number(),
  expected_progress_percentage: z.number(),
  pace: z.enum(['ahead', 'on-track', 'behind']),
  modules_completed: z.number(),
  modules_in_progress: z.number(),
  modules_remaining: z.number(),
  estimated_completion_date: z.string(),
  recommendations: z.array(z.string()),
  motivational_message: z.string(),
});

const MarketAlignmentCheckerInput = z.object({
  roadmap_skills: z.array(z.string()),
});

const MarketAlignmentCheckerOutput = z.object({
  alignment_score: z.number(),
  trending_skills_covered: z.array(z.string()),
  trending_skills_missing: z.array(z.string()),
  declining_skills_in_roadmap: z.array(z.string()),
  recommendations: z.array(z.string()),
});

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * User Profile Fetcher - Gets user data for roadmap generation
 */
const userProfileFetcherTool: ToolDefinition<
  z.infer<typeof UserProfileFetcherInput>,
  z.infer<typeof UserProfileFetcherOutput>
> = {
  id: 'user_profile_fetcher',
  name: 'User Profile Fetcher',
  description: 'Fetch user profile, skills, and career goals for roadmap planning',
  version: '1.0.0',
  category: 'data_retrieval',
  tags: ['user', 'profile', 'skills'],
  input_schema: UserProfileFetcherInput,
  output_schema: UserProfileFetcherOutput,
  handler: async (input) => {
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, input.user_id),
    });

    const userSkillRecords = await db.query.userSkills.findMany({
      where: eq(userSkills.user_id, input.user_id),
      with: { skill: true },
    });

    // Map proficiency strings to numbers
    const proficiencyMap: Record<string, number> = {
      learning: 25,
      practicing: 50,
      proficient: 75,
      expert: 100,
    };

    return {
      user_id: input.user_id,
      target_roles: profile?.target_roles || [],
      years_of_experience: profile?.years_of_experience || 0,
      current_skills: userSkillRecords.map((us) => ({
        name: us.skill?.name || 'Unknown',
        proficiency: proficiencyMap[us.proficiency_level] ?? 50,
        verified: !!us.verification_metadata?.is_verified,
      })),
      work_history: (profile?.work_history as Array<{ title: string; company: string }>) || [],
      education: (profile?.education as Array<{ degree: string; institution: string }>) || [],
    };
  },
  cost: { latency_ms: 200, tokens: 0 },
  requires: [],
  best_for: ['Gathering user context for roadmap generation'],
  not_suitable_for: ['Modifying user data'],
  examples: [],
  enabled: true,
};

/**
 * Skill Gap Analyzer - Analyzes gaps between current and required skills
 */
const skillGapAnalyzerTool: ToolDefinition<
  z.infer<typeof SkillGapAnalyzerInput>,
  z.infer<typeof SkillGapAnalyzerOutput>
> = {
  id: 'skill_gap_analyzer',
  name: 'Skill Gap Analyzer',
  description: 'Analyze skill gaps between current skills and target role requirements',
  version: '1.0.0',
  category: 'analysis',
  tags: ['skills', 'gap', 'analysis'],
  input_schema: SkillGapAnalyzerInput,
  output_schema: SkillGapAnalyzerOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    // Get role requirements from market insights if not provided
    let roleRequirements = input.role_requirements || [];
    if (roleRequirements.length === 0) {
      const insights = await db.query.marketInsights.findFirst({
        where: eq(marketInsights.skill_name, 'market_summary'),
        orderBy: [desc(marketInsights.analyzed_at)],
      });
      if (insights?.raw_data) {
        const data = insights.raw_data as { trending_skills?: string[] };
        roleRequirements = data.trending_skills?.slice(0, 10) || [];
      }
    }

    const prompt = buildSkillGapAnalysisPrompt(
      input.target_role,
      input.current_skills,
      roleRequirements
    );

    // Use timeout for gap analysis
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: ARCHITECT_PROMPTS.GAP_ANALYZER },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
      }, { signal: controller.signal });

      clearTimeout(timeoutId);

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from gap analyzer');

      return safeJsonParse(content, 'skill gap analysis');
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Gap analysis timed out after 60 seconds');
      }
      throw error;
    }
  },
  cost: { latency_ms: 30000, tokens: 800 }, // Realistic: ~30 seconds for detailed analysis
  requires: [],
  best_for: ['Identifying skill gaps', 'Prioritizing learning'],
  not_suitable_for: ['Creating detailed learning content'],
  examples: [],
  enabled: true,
};

/**
 * Roadmap Generator - Creates a full roadmap using AI
 */
const roadmapGeneratorTool: ToolDefinition<
  z.infer<typeof RoadmapGeneratorInput>,
  z.infer<typeof RoadmapGeneratorOutput>
> = {
  id: 'roadmap_generator',
  name: 'Roadmap Generator',
  description: 'Generate a personalized learning roadmap using AI',
  version: '1.0.0',
  category: 'generation',
  tags: ['roadmap', 'ai', 'generation'],
  input_schema: RoadmapGeneratorInput,
  output_schema: RoadmapGeneratorOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    const prompt = buildRoadmapGenerationPrompt(
      input.target_roles,
      input.current_skills,
      input.years_of_experience,
      input.work_history,
      input.education
    );

    // Use timeout for long-running generation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: ARCHITECT_PROMPTS.ROADMAP_GENERATOR },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 4000,
      }, { signal: controller.signal });

      clearTimeout(timeoutId);

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from roadmap generator');

      console.log('[RoadmapGenerator] Raw AI response length:', content.length);
      
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        console.error('[RoadmapGenerator] JSON parse error:', parseError);
        console.error('[RoadmapGenerator] Raw content:', content.slice(0, 500));
        throw new Error('Failed to parse roadmap JSON response');
      }
      
      console.log('[RoadmapGenerator] Parsed keys:', Object.keys(parsed));
      
      // Handle case where AI wraps response in a "roadmap" key
      const roadmap = parsed.roadmap || parsed;
      
      console.log('[RoadmapGenerator] Roadmap keys:', Object.keys(roadmap));
      console.log('[RoadmapGenerator] Has modules?', !!roadmap.modules, 'isArray?', Array.isArray(roadmap.modules), 'length:', roadmap.modules?.length);
      
      // Validate and provide defaults for required fields
      const result = {
        title: roadmap.title || 'Learning Roadmap',
        description: roadmap.description || 'Your personalized learning path',
        estimated_weeks: roadmap.estimated_weeks || 12,
        modules: Array.isArray(roadmap.modules) ? roadmap.modules.map((m: Record<string, unknown>) => ({
          title: m.title || 'Module',
          description: m.description || '',
          skill_name: m.skill_name || m.title || 'General Skill',
          skill_category: m.skill_category || 'programming',
          learning_objectives: Array.isArray(m.learning_objectives) ? m.learning_objectives : [],
          resources: Array.isArray(m.resources) ? m.resources : [],
          practice_exercises: Array.isArray(m.practice_exercises) ? m.practice_exercises : [],
          estimated_hours: typeof m.estimated_hours === 'number' ? m.estimated_hours : 10,
          is_milestone: Boolean(m.is_milestone),
        })) : [],
      };
      
      console.log('[RoadmapGenerator] Final result modules count:', result.modules.length);
      
      if (result.modules.length === 0) {
        console.error('[RoadmapGenerator] Empty modules! Raw roadmap.modules:', JSON.stringify(roadmap.modules)?.slice(0, 500));
        throw new Error('Roadmap generator returned no modules');
      }
      
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Roadmap generation timed out after 90 seconds');
      }
      throw error;
    }
  },
  cost: { latency_ms: 60000, tokens: 3000 }, // Realistic: ~60 seconds for detailed roadmap
  requires: [],
  best_for: ['Creating comprehensive learning roadmaps'],
  not_suitable_for: ['Updating existing roadmaps'],
  examples: [],
  enabled: true,
};

/**
 * Roadmap Persister - Saves roadmap to database
 */
const roadmapPersisterTool: ToolDefinition<
  z.infer<typeof RoadmapPersisterInput>,
  z.infer<typeof RoadmapPersisterOutput>
> = {
  id: 'roadmap_persister',
  name: 'Roadmap Persister',
  description: 'Save generated roadmap to the database',
  version: '1.0.0',
  category: 'persistence',
  tags: ['database', 'roadmap', 'storage'],
  input_schema: RoadmapPersisterInput,
  output_schema: RoadmapPersisterOutput,
  handler: async (input) => {
    // Validate modules exist
    const rawModules = input.roadmap.modules;
    if (!Array.isArray(rawModules) || rawModules.length === 0) {
      throw new Error('Cannot persist roadmap: modules array is empty or invalid');
    }

    // Create roadmap
    const [newRoadmap] = await db.insert(roadmaps).values({
      user_id: input.user_id,
      title: input.roadmap.title,
      description: input.roadmap.description,
      target_role: input.roadmap.target_role,
      status: 'active',
      progress_percentage: 0,
      metadata: {
        generated_by: 'architect_agent',
      },
    }).returning();

    // Create modules with validation
    const modules = rawModules as Array<{
      title: string;
      description: string;
      skill_name: string;
      skill_category: string;
      learning_objectives: string[];
      resources: unknown[];
      practice_exercises: unknown[];
      estimated_hours: number;
      is_milestone: boolean;
    }>;

    let modulesCreated = 0;
    for (let i = 0; i < modules.length; i++) {
      const module = modules[i];
      if (!module || !module.skill_name) {
        console.warn(`[RoadmapPersister] Skipping invalid module at index ${i}`);
        continue;
      }

      // Find or create skill
      let skill = await db.query.skills.findFirst({
        where: eq(skills.name, module.skill_name),
      });

      if (!skill) {
        const [newSkill] = await db.insert(skills).values({
          name: module.skill_name,
          category: module.skill_category,
          description: `Core skill for ${input.roadmap.target_role}`,
        }).returning();
        skill = newSkill;
      }

      // Create module
      await db.insert(roadmapModules).values({
        title: module.title,
        description: module.description,
        roadmap_id: newRoadmap.id,
        order_index: i,
        status: i === 0 ? 'available' : 'locked',
        is_milestone: module.is_milestone,
        skill_id: skill.id,
        estimated_hours: module.estimated_hours,
        content: {
          learning_objectives: module.learning_objectives,
          resources: module.resources as unknown as Array<{
            title: string;
            url: string;
            type: 'video' | 'article' | 'course' | 'project';
            duration_minutes?: number;
          }>,
          practice_exercises: module.practice_exercises as unknown as Array<{
            title: string;
            description: string;
            difficulty: 'easy' | 'medium' | 'hard';
          }>,
        },
      });
      modulesCreated++;
    }

    return {
      roadmap_id: newRoadmap.id,
      modules_created: modulesCreated,
      success: true,
    };
  },
  cost: { latency_ms: 500, tokens: 0 },
  requires: [],
  best_for: ['Persisting roadmaps to database'],
  not_suitable_for: ['Generating roadmap content'],
  examples: [],
  enabled: true,
};

/**
 * Repath Analyzer - Analyzes if roadmap needs re-pathing
 */
const repathAnalyzerTool: ToolDefinition<
  z.infer<typeof RepathAnalyzerInput>,
  z.infer<typeof RepathAnalyzerOutput>
> = {
  id: 'repath_analyzer',
  name: 'Repath Analyzer',
  description: 'Analyze if a roadmap needs re-pathing based on changes',
  version: '1.0.0',
  category: 'analysis',
  tags: ['roadmap', 'adaptation', 'repath'],
  input_schema: RepathAnalyzerInput,
  output_schema: RepathAnalyzerOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    // Fetch current roadmap
    const roadmap = await db.query.roadmaps.findFirst({
      where: eq(roadmaps.id, input.roadmap_id),
      with: {
        modules: {
          with: { skill: true },
        },
      },
    });

    if (!roadmap) {
      throw new Error(`Roadmap ${input.roadmap_id} not found`);
    }

    const currentRoadmap = {
      title: roadmap.title,
      modules: roadmap.modules.map((m) => ({
        title: m.title,
        skill_name: m.skill?.name || 'Unknown',
        status: m.status as string,
        // Calculate progress based on status
        progress_percentage: m.status === 'completed' ? 100 : m.status === 'in_progress' ? 50 : 0,
      })),
    };

    const prompt = buildRepathingPrompt(currentRoadmap, input.trigger_reason, input.context);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ARCHITECT_PROMPTS.REPATH_ADVISOR },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from repath analyzer');

    return safeJsonParse(content, 'repath analysis');
  },
  cost: { latency_ms: 2500, tokens: 800 },
  requires: [],
  best_for: ['Determining if roadmap adaptation is needed'],
  not_suitable_for: ['Executing roadmap changes'],
  examples: [],
  enabled: true,
};

/**
 * Progress Evaluator - Evaluates learning progress
 */
const progressEvaluatorTool: ToolDefinition<
  z.infer<typeof ProgressEvaluatorInput>,
  z.infer<typeof ProgressEvaluatorOutput>
> = {
  id: 'progress_evaluator',
  name: 'Progress Evaluator',
  description: 'Evaluate user progress on their learning roadmap',
  version: '1.0.0',
  category: 'analysis',
  tags: ['progress', 'evaluation', 'roadmap'],
  input_schema: ProgressEvaluatorInput,
  output_schema: ProgressEvaluatorOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    const roadmap = await db.query.roadmaps.findFirst({
      where: eq(roadmaps.id, input.roadmap_id),
      with: { modules: true },
    });

    if (!roadmap) {
      throw new Error(`Roadmap ${input.roadmap_id} not found`);
    }

    const roadmapData = {
      title: roadmap.title,
      started_at: roadmap.created_at.toISOString(),
      estimated_weeks: (roadmap.metadata as { estimated_weeks?: number })?.estimated_weeks || 12,
      modules: roadmap.modules.map((m) => ({
        title: m.title,
        status: m.status as string,
        // Calculate progress based on status
        progress_percentage: m.status === 'completed' ? 100 : m.status === 'in_progress' ? 50 : 0,
        started_at: m.started_at?.toISOString(),
        completed_at: m.completed_at?.toISOString(),
      })),
    };

    const prompt = buildProgressEvaluationPrompt(roadmapData);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ARCHITECT_PROMPTS.PROGRESS_EVALUATOR },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from progress evaluator');

    return safeJsonParse(content, 'progress evaluation');
  },
  cost: { latency_ms: 2000, tokens: 500 },
  requires: [],
  best_for: ['Assessing learning progress'],
  not_suitable_for: ['Modifying roadmap content'],
  examples: [],
  enabled: true,
};

/**
 * Market Alignment Checker - Checks if roadmap aligns with market trends
 */
const marketAlignmentCheckerTool: ToolDefinition<
  z.infer<typeof MarketAlignmentCheckerInput>,
  z.infer<typeof MarketAlignmentCheckerOutput>
> = {
  id: 'market_alignment_checker',
  name: 'Market Alignment Checker',
  description: 'Check if roadmap skills align with current market trends',
  version: '1.0.0',
  category: 'analysis',
  tags: ['market', 'alignment', 'skills'],
  input_schema: MarketAlignmentCheckerInput,
  output_schema: MarketAlignmentCheckerOutput,
  handler: async (input) => {
    // Fetch latest market insights
    const insights = await db.query.marketInsights.findFirst({
      where: eq(marketInsights.skill_name, 'market_summary'),
      orderBy: [desc(marketInsights.analyzed_at)],
    });

    const rawData = insights?.raw_data as {
      trending_skills?: string[];
      declining_skills?: string[];
    } | null;

    const trendingSkills = rawData?.trending_skills || [];
    const decliningSkills = rawData?.declining_skills || [];

    // Safeguard against undefined input (shouldn't happen with zod validation, but defensive)
    const roadmapSkills = input.roadmap_skills || [];
    
    const roadmapSkillsLower = roadmapSkills.map((s) => s.toLowerCase());
    const trendingLower = trendingSkills.map((s) => s.toLowerCase());
    const decliningLower = decliningSkills.map((s) => s.toLowerCase());

    const covered = trendingSkills.filter((s) =>
      roadmapSkillsLower.some((rs) => rs.includes(s.toLowerCase()) || s.toLowerCase().includes(rs))
    );
    const missing = trendingSkills.filter((s) =>
      !roadmapSkillsLower.some((rs) => rs.includes(s.toLowerCase()) || s.toLowerCase().includes(rs))
    );
    const declining = roadmapSkills.filter((s) =>
      decliningLower.some((ds) => ds.includes(s.toLowerCase()) || s.toLowerCase().includes(ds))
    );

    const alignmentScore = trendingSkills.length > 0
      ? Math.round((covered.length / trendingSkills.length) * 100)
      : 50;

    const recommendations: string[] = [];
    if (missing.length > 0) {
      recommendations.push(`Consider adding modules for: ${missing.slice(0, 3).join(', ')}`);
    }
    if (declining.length > 0) {
      recommendations.push(`Consider de-prioritizing: ${declining.join(', ')}`);
    }
    if (alignmentScore >= 70) {
      recommendations.push('Roadmap is well-aligned with market trends');
    }

    return {
      alignment_score: alignmentScore,
      trending_skills_covered: covered,
      trending_skills_missing: missing.slice(0, 10),
      declining_skills_in_roadmap: declining,
      recommendations,
    };
  },
  cost: { latency_ms: 300, tokens: 0 },
  requires: [],
  best_for: ['Validating roadmap market relevance'],
  not_suitable_for: ['Detailed market analysis'],
  examples: [],
  enabled: true,
};

// ============================================================================
// Registration
// ============================================================================

/**
 * Register all Architect agent tools
 */
export function registerArchitectTools(): void {
  const tools = [
    userProfileFetcherTool,
    skillGapAnalyzerTool,
    roadmapGeneratorTool,
    roadmapPersisterTool,
    repathAnalyzerTool,
    progressEvaluatorTool,
    marketAlignmentCheckerTool,
  ] as const;

  for (const tool of tools) {
    if (!toolRegistry.has(tool.id)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toolRegistry.register(tool as any);
    }
  }

  console.log(`[Architect] Registered ${tools.length} tools`);
}

/**
 * Get IDs of all Architect tools
 */
export function getArchitectToolIds(): string[] {
  return [
    'user_profile_fetcher',
    'skill_gap_analyzer',
    'roadmap_generator',
    'roadmap_persister',
    'repath_analyzer',
    'progress_evaluator',
    'market_alignment_checker',
  ];
}

export default {
  registerArchitectTools,
  getArchitectToolIds,
};
