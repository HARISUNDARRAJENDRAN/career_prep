/**
 * Action Agent Prompts
 *
 * System prompts and templates for job application automation.
 *
 * @see docs/agentic-improvements/05-AGENT_COORDINATOR.md
 */

// ============================================================================
// System Prompts
// ============================================================================

export const ACTION_PROMPTS = {
  /**
   * Main system prompt for application decisions
   */
  SYSTEM_APPLIER: `You are an expert job application strategist AI. Your role is to:

1. Evaluate job matches for application worthiness
2. Generate personalized cover letters that highlight relevant experience
3. Prioritize applications based on fit and opportunity
4. Track application status and suggest follow-ups

You make intelligent decisions about which jobs to apply for and how to present the candidate.

Guidelines:
- Quality over quantity in applications
- Tailor each cover letter to the specific role
- Highlight transferable skills for stretch roles
- Consider company culture fit
- Respect user preferences and exclusions`,

  /**
   * Cover letter generation
   */
  COVER_LETTER_GENERATOR: `You are a professional cover letter writer. Create personalized, compelling cover letters that:

1. Open with a strong, relevant hook
2. Connect candidate's experience to job requirements
3. Highlight 2-3 key achievements with metrics when possible
4. Address skill gaps positively (eager to learn, relevant transferables)
5. Close with enthusiasm and clear call to action

Style:
- Professional but personable
- Concise (300-400 words)
- Specific to the company and role
- Avoid generic phrases

Return the cover letter as plain text.`,

  /**
   * Application evaluation
   */
  APPLICATION_EVALUATOR: `You are an application decision evaluator. Given:
- Job listing details
- User profile and skills
- Match score and gaps

Determine:
1. Should the user apply? (yes/no/maybe)
2. Confidence in decision (0-100)
3. Key reasons for recommendation
4. Risks or concerns
5. Suggested approach (standard apply, referral, wait, etc.)

Be strategic - not every match deserves an application.`,

  /**
   * Follow-up strategist
   */
  FOLLOWUP_STRATEGIST: `You are an application follow-up strategist. Analyze:
- Time since application
- Company response patterns
- Application status
- Industry norms

Recommend:
1. Whether to follow up
2. Optimal timing
3. Follow-up method (email, LinkedIn, phone)
4. Suggested message content
5. When to move on if no response`,

  /**
   * Application prioritizer
   */
  APPLICATION_PRIORITIZER: `You are an application prioritizer. Given multiple job opportunities, rank them by:

1. Match score (skill alignment)
2. Growth potential (career advancement)
3. Company quality (reputation, stability)
4. Timing (urgency, competition level)
5. User preferences (location, salary, culture)

Provide a prioritized list with reasoning for each ranking.`,
};

// ============================================================================
// Prompt Builders
// ============================================================================

/**
 * Build a cover letter generation prompt
 */
export function buildCoverLetterPrompt(
  userProfile: {
    name: string;
    current_title: string;
    years_experience: number;
    key_skills: string[];
    key_achievements: string[];
  },
  job: {
    title: string;
    company: string;
    description: string;
    requirements: string[];
  },
  matchInfo: {
    matching_skills: string[];
    missing_skills: string[];
    match_score: number;
  }
): string {
  return `Write a cover letter for this job application:

CANDIDATE:
Name: ${userProfile.name}
Current Role: ${userProfile.current_title}
Experience: ${userProfile.years_experience} years
Key Skills: ${userProfile.key_skills.join(', ')}
Achievements: ${userProfile.key_achievements.map((a) => `• ${a}`).join('\n')}

JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description.slice(0, 500)}...
Requirements: ${job.requirements.join(', ')}

MATCH INFO:
Match Score: ${matchInfo.match_score}%
Matching Skills: ${matchInfo.matching_skills.join(', ')}
Skills to Address: ${matchInfo.missing_skills.join(', ')}

Write a compelling, personalized cover letter (300-400 words) that:
1. Opens with a strong hook relevant to ${job.company}
2. Highlights how the candidate's experience matches the role
3. Addresses skill gaps positively
4. Closes with enthusiasm

Return only the cover letter text, no additional commentary.`;
}

/**
 * Build an application evaluation prompt
 */
export function buildApplicationEvaluationPrompt(
  job: {
    title: string;
    company: string;
    location: string;
    salary_range?: string;
    requirements: string[];
  },
  userProfile: {
    target_roles: string[];
    current_skills: string[];
    preferences: {
      min_salary?: number;
      preferred_locations?: string[];
      remote_preference?: 'remote' | 'hybrid' | 'onsite' | 'any';
    };
  },
  matchScore: number,
  matchingSkills: string[],
  missingSkills: string[]
): string {
  return `Evaluate whether this candidate should apply:

JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Salary: ${job.salary_range || 'Not specified'}
Requirements: ${job.requirements.join(', ')}

CANDIDATE:
Target Roles: ${userProfile.target_roles.join(', ')}
Current Skills: ${userProfile.current_skills.join(', ')}
Location Preference: ${userProfile.preferences.preferred_locations?.join(', ') || 'Any'}
Remote Preference: ${userProfile.preferences.remote_preference || 'any'}

MATCH ANALYSIS:
Score: ${matchScore}%
Matching: ${matchingSkills.join(', ')}
Missing: ${missingSkills.join(', ')}

Provide evaluation as JSON:
{
  "should_apply": "yes|no|maybe",
  "confidence": 85,
  "reasons": [
    "Strong match for target role",
    "Company has good growth potential"
  ],
  "concerns": [
    "Missing key skill X"
  ],
  "suggested_approach": "standard|referral|networking|wait",
  "priority": "high|medium|low"
}`;
}

/**
 * Build a follow-up prompt
 */
export function buildFollowUpPrompt(
  application: {
    company: string;
    role: string;
    applied_at: string;
    status: string;
    last_activity: string;
  },
  context: {
    days_since_application: number;
    previous_followups: number;
    industry: string;
  }
): string {
  return `Analyze this application for follow-up strategy:

APPLICATION:
Company: ${application.company}
Role: ${application.role}
Applied: ${application.applied_at}
Status: ${application.status}
Last Activity: ${application.last_activity}

CONTEXT:
Days Since Application: ${context.days_since_application}
Previous Follow-ups: ${context.previous_followups}
Industry: ${context.industry}

Recommend follow-up strategy as JSON:
{
  "should_followup": true,
  "timing": "now|wait_x_days|after_specific_event",
  "wait_days": 0,
  "method": "email|linkedin|phone|none",
  "message_template": "Brief, professional follow-up message...",
  "if_no_response": "Apply to similar roles at other companies"
}`;
}

/**
 * Build an application prioritization prompt
 */
export function buildPrioritizationPrompt(
  opportunities: Array<{
    id: string;
    title: string;
    company: string;
    match_score: number;
    salary_range?: string;
    location: string;
  }>,
  userGoals: {
    target_roles: string[];
    priority_factors: string[];
  }
): string {
  const jobList = opportunities.map((o, i) =>
    `${i + 1}. ${o.title} at ${o.company} (${o.match_score}% match, ${o.location}${o.salary_range ? `, ${o.salary_range}` : ''})`
  ).join('\n');

  return `Prioritize these job opportunities for application:

OPPORTUNITIES:
${jobList}

USER PRIORITIES:
Target Roles: ${userGoals.target_roles.join(', ')}
Priority Factors: ${userGoals.priority_factors.join(', ')}

Return prioritized list as JSON:
{
  "prioritized": [
    {
      "id": "...",
      "rank": 1,
      "reasoning": "Why this should be top priority",
      "apply_urgency": "immediate|this_week|when_ready"
    }
  ],
  "skip_recommendations": [
    {
      "id": "...",
      "reason": "Why to skip this one"
    }
  ]
}`;
}

export default ACTION_PROMPTS;
