/**
 * Architect Agent Prompts
 *
 * System prompts and templates for roadmap generation and learning path design.
 *
 * @see docs/agentic-improvements/05-AGENT_COORDINATOR.md
 */

// ============================================================================
// System Prompts
// ============================================================================

export const ARCHITECT_PROMPTS = {
  /**
   * Main system prompt for roadmap architecture
   */
  SYSTEM_ARCHITECT: `You are an expert career architect and learning path designer AI. Your role is to:

1. Design personalized learning roadmaps that bridge skill gaps
2. Prioritize skills based on market demand and career goals
3. Structure learning modules with clear progression
4. Adapt paths based on user progress and market changes

You create practical, achievable learning paths that maximize career advancement.

Guidelines:
- Balance theoretical knowledge with practical application
- Include milestone checkpoints for progress validation
- Consider prerequisite dependencies between skills
- Prioritize high-impact skills for target roles
- Include diverse resource types (videos, articles, projects)`,

  /**
   * Roadmap generation
   */
  ROADMAP_GENERATOR: `You are a learning roadmap generator. Create a personalized learning path based on the user's goals and current skills.

You MUST return a JSON object with this exact structure:
{
  "title": "string - descriptive roadmap title",
  "description": "string - overview of the learning journey",
  "estimated_weeks": number,
  "modules": [
    {
      "title": "string",
      "description": "string",
      "skill_name": "string - the main skill this module teaches",
      "skill_category": "string - e.g., programming, frameworks, tools, soft_skills",
      "learning_objectives": ["objective1", "objective2", "objective3"],
      "resources": [
        { "title": "string", "url": "string", "type": "video|article|course|book", "duration_minutes": number }
      ],
      "practice_exercises": [
        { "title": "string", "description": "string", "difficulty": "easy|medium|hard" }
      ],
      "estimated_hours": number,
      "is_milestone": boolean
    }
  ]
}

Guidelines:
- Create 5-8 modules in logical progression
- Each module focuses on ONE specific skill
- Include diverse resources (videos, articles, projects)
- Mark important modules as milestones
- Be realistic with time estimates

Always return valid JSON.`,

  /**
   * Skill gap analysis
   */
  GAP_ANALYZER: `You are a skill gap analysis specialist. Analyze the user's current skills against target role requirements.

You MUST return a JSON object with this exact structure:
{
  "critical_gaps": [
    { "skill": "string", "current_level": number, "required_level": number, "effort_hours": number, "priority": number }
  ],
  "important_gaps": [],
  "optional_gaps": [],
  "recommended_order": ["skill1", "skill2"],
  "total_estimated_hours": number,
  "readiness_score": number (0-100),
  "summary": "string describing the analysis"
}

For the analysis:
- current_level: 0-100 based on their proficiency
- required_level: typically 70-90 for professional roles
- effort_hours: realistic hours to bridge the gap
- priority: 1 (highest) to 5 (lowest)
- readiness_score: percentage of how ready they are for the role (0-100)

Always return valid JSON.`,

  /**
   * Module content generator
   */
  MODULE_GENERATOR: `You are a learning module content creator. For each skill module:

1. Learning Objectives: 3-5 specific, measurable outcomes
2. Resources: Mix of free and paid options
   - Video tutorials (YouTube, platforms)
   - Documentation and articles
   - Interactive courses
   - Books or guides
3. Practice Exercises: Progressive difficulty
   - Easy: Concept reinforcement
   - Medium: Practical application
   - Hard: Portfolio-worthy projects
4. Time Estimate: Realistic hours for completion
5. Prerequisites: Skills needed before starting

Focus on practical, job-relevant content.`,

  /**
   * Roadmap re-pathing
   */
  REPATH_ADVISOR: `You are a roadmap adaptation specialist. When the user's situation changes:
- Completed modules ahead of schedule
- Market demand shifts
- Career goal changes
- Skill verification results

Analyze the current roadmap and recommend:
1. Modules to add/remove/reorder
2. Priority adjustments
3. New resources to consider
4. Timeline updates

Preserve user's progress while optimizing the remaining path.`,

  /**
   * Progress evaluator
   */
  PROGRESS_EVALUATOR: `You are a learning progress evaluator. Assess:
- Module completion rates
- Skill proficiency improvements
- Time investment vs estimates
- Exercise completion quality

Provide:
1. Overall progress assessment
2. Pace analysis (ahead/on-track/behind)
3. Recommendations for improvement
4. Motivational feedback`,
};

// ============================================================================
// Prompt Builders
// ============================================================================

/**
 * Build a roadmap generation prompt
 */
export function buildRoadmapGenerationPrompt(
  targetRoles: string[],
  currentSkills: Array<{ name: string; proficiency: number }>,
  yearsOfExperience: number,
  workHistory?: Array<{ title: string; company: string }>,
  education?: Array<{ degree: string; institution: string }>
): string {
  const skillList = currentSkills.length > 0
    ? currentSkills.map((s) => `- ${s.name} (${s.proficiency}/10)`).join('\n')
    : 'No existing skills recorded';

  const workText = workHistory?.length
    ? `Work History:\n${workHistory.map((w) => `- ${w.title} at ${w.company}`).join('\n')}`
    : 'No work history';

  const educationText = education?.length
    ? `Education:\n${education.map((e) => `- ${e.degree} from ${e.institution}`).join('\n')}`
    : 'No formal education recorded';

  return `Create a personalized learning roadmap:

TARGET ROLES: ${targetRoles.join(', ')}

CURRENT PROFILE:
Years of Experience: ${yearsOfExperience}
Skills:
${skillList}

${workText}

${educationText}

REQUIREMENTS:
1. Create 5-8 progressive learning modules
2. Each module = ONE specific skill
3. Include real, accessible resources
4. Mark 1-2 modules as milestones
5. Estimate hours realistically

Return JSON:
{
  "title": "Your Path to [Role]",
  "description": "Personalized roadmap description...",
  "estimated_weeks": 12,
  "modules": [
    {
      "title": "Module Title",
      "description": "What you'll learn",
      "skill_name": "Specific Skill",
      "skill_category": "Category",
      "learning_objectives": ["Objective 1", "Objective 2"],
      "resources": [
        {"title": "Resource", "url": "https://...", "type": "video|article|course|project", "duration_minutes": 60}
      ],
      "practice_exercises": [
        {"title": "Exercise", "description": "What to do", "difficulty": "easy|medium|hard"}
      ],
      "estimated_hours": 10,
      "is_milestone": false,
      "prerequisites": []
    }
  ]
}`;
}

/**
 * Build a skill gap analysis prompt
 */
export function buildSkillGapAnalysisPrompt(
  targetRole: string,
  currentSkills: Array<{ name: string; proficiency: number }>,
  roleRequirements: string[]
): string {
  const skillList = currentSkills.map((s) => `${s.name}: ${s.proficiency}/10`).join(', ');

  return `Analyze skill gaps for career transition:

TARGET ROLE: ${targetRole}

CURRENT SKILLS: ${skillList || 'None recorded'}

ROLE REQUIREMENTS: ${roleRequirements.join(', ')}

Analyze and return JSON:
{
  "critical_gaps": [
    {"skill": "name", "current_level": 0, "required_level": 8, "effort_hours": 40, "priority": 1}
  ],
  "important_gaps": [...],
  "optional_gaps": [...],
  "recommended_order": ["skill1", "skill2", "skill3"],
  "total_estimated_hours": 200,
  "readiness_score": 45,
  "summary": "Brief analysis..."
}`;
}

/**
 * Build a roadmap re-pathing prompt
 */
export function buildRepathingPrompt(
  currentRoadmap: {
    title: string;
    modules: Array<{
      title: string;
      skill_name: string;
      status: string;
      progress_percentage: number;
    }>;
  },
  triggerReason: 'market_shift' | 'goal_change' | 'progress_update' | 'skill_verified',
  context: {
    market_trends?: string[];
    new_goals?: string[];
    verified_skills?: string[];
    progress_ahead?: boolean;
  }
): string {
  const moduleStatus = currentRoadmap.modules
    .map((m) => `- ${m.title} (${m.skill_name}): ${m.status} - ${m.progress_percentage}%`)
    .join('\n');

  let triggerContext = '';
  switch (triggerReason) {
    case 'market_shift':
      triggerContext = `Market trends showing increased demand for: ${context.market_trends?.join(', ')}`;
      break;
    case 'goal_change':
      triggerContext = `User changed goals to: ${context.new_goals?.join(', ')}`;
      break;
    case 'progress_update':
      triggerContext = context.progress_ahead
        ? 'User is progressing faster than expected'
        : 'User is falling behind schedule';
      break;
    case 'skill_verified':
      triggerContext = `User verified skills: ${context.verified_skills?.join(', ')}`;
      break;
  }

  return `Analyze roadmap for potential re-pathing:

CURRENT ROADMAP: ${currentRoadmap.title}

MODULE STATUS:
${moduleStatus}

TRIGGER: ${triggerReason}
CONTEXT: ${triggerContext}

Recommend changes in JSON:
{
  "should_repath": true,
  "changes": [
    {"type": "add|remove|reorder|update", "module": "...", "reason": "..."}
  ],
  "new_priorities": ["skill1", "skill2"],
  "timeline_adjustment": "+2 weeks",
  "reasoning": "Explanation of recommended changes..."
}`;
}

/**
 * Build a module generation prompt
 */
export function buildModuleGenerationPrompt(
  skillName: string,
  skillCategory: string,
  targetRole: string,
  userLevel: 'beginner' | 'intermediate' | 'advanced'
): string {
  return `Create a detailed learning module:

SKILL: ${skillName}
CATEGORY: ${skillCategory}
TARGET ROLE: ${targetRole}
USER LEVEL: ${userLevel}

Return JSON:
{
  "title": "Mastering ${skillName}",
  "description": "Comprehensive module covering...",
  "learning_objectives": [
    "Understand core concepts of...",
    "Build practical projects using...",
    "Apply best practices in..."
  ],
  "resources": [
    {
      "title": "Official Documentation",
      "url": "https://...",
      "type": "article",
      "duration_minutes": 120,
      "quality": "official",
      "cost": "free"
    },
    {
      "title": "Video Course",
      "url": "https://youtube.com/...",
      "type": "video",
      "duration_minutes": 180,
      "quality": "high",
      "cost": "free"
    }
  ],
  "practice_exercises": [
    {
      "title": "Beginner: Hello World",
      "description": "Build a simple...",
      "difficulty": "easy",
      "estimated_minutes": 30
    },
    {
      "title": "Project: Full Application",
      "description": "Build a portfolio-worthy...",
      "difficulty": "hard",
      "estimated_minutes": 480
    }
  ],
  "estimated_hours": 20,
  "checkpoints": ["Complete basics", "Build first project", "Deploy application"]
}`;
}

/**
 * Build a progress evaluation prompt
 */
export function buildProgressEvaluationPrompt(
  roadmap: {
    title: string;
    started_at: string;
    estimated_weeks: number;
    modules: Array<{
      title: string;
      status: string;
      progress_percentage: number;
      started_at?: string;
      completed_at?: string;
    }>;
  }
): string {
  const weeksElapsed = Math.floor(
    (Date.now() - new Date(roadmap.started_at).getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  const expectedProgress = Math.min(100, (weeksElapsed / roadmap.estimated_weeks) * 100);

  const moduleStatus = roadmap.modules
    .map((m) => `- ${m.title}: ${m.status} (${m.progress_percentage}%)`)
    .join('\n');

  return `Evaluate learning progress:

ROADMAP: ${roadmap.title}
STARTED: ${roadmap.started_at}
ESTIMATED DURATION: ${roadmap.estimated_weeks} weeks
WEEKS ELAPSED: ${weeksElapsed}
EXPECTED PROGRESS: ${expectedProgress.toFixed(0)}%

MODULES:
${moduleStatus}

Provide evaluation in JSON:
{
  "overall_progress_percentage": 45,
  "expected_progress_percentage": ${expectedProgress.toFixed(0)},
  "pace": "ahead|on-track|behind",
  "modules_completed": 2,
  "modules_in_progress": 1,
  "modules_remaining": 4,
  "estimated_completion_date": "2024-03-15",
  "recommendations": [
    "Focus more time on...",
    "Consider skipping... if pressed for time"
  ],
  "strengths": ["Consistent progress on..."],
  "areas_for_improvement": ["Need to dedicate more time to..."],
  "motivational_message": "Great progress! Keep up the momentum..."
}`;
}

export default ARCHITECT_PROMPTS;
