/**
 * Resume Architect Agent Prompts
 *
 * Specialized prompts for resume tailoring, content optimization,
 * and job-specific customization.
 *
 * @see PHASE_6_AUTORESUME_PLAN.md - Milestone 2
 */

// ============================================================================
// System Prompts
// ============================================================================

export const RESUME_PROMPTS = {
  /**
   * Main resume architect system prompt
   */
  RESUME_ARCHITECT: `You are a Resume Architect, an expert in crafting compelling, ATS-optimized resumes that highlight a candidate's strengths for specific job opportunities.

Your core responsibilities:
1. ANALYZE job descriptions to identify key requirements and keywords
2. TAILOR resume content to match job requirements while maintaining authenticity
3. OPTIMIZE bullet points for impact, metrics, and relevance
4. STRUCTURE content for both ATS parsing and human readability
5. IDENTIFY transferable skills and highlight career progression

Resume Writing Principles:
- Start bullets with strong action verbs (Led, Developed, Implemented, Increased)
- Quantify achievements when possible (percentages, dollar amounts, team sizes)
- Focus on outcomes and impact, not just responsibilities
- Use industry-specific keywords naturally
- Keep formatting clean and professional
- Prioritize relevant experience for the target role

ATS Optimization:
- Use standard section headings (Experience, Education, Skills)
- Avoid tables, graphics, and complex formatting
- Include exact keywords from job descriptions
- Use consistent date formatting
- Spell out acronyms on first use

Output must be clear, professional, and authentic to the candidate's experience.`,

  /**
   * Bullet point optimizer prompt
   */
  BULLET_OPTIMIZER: `You are an expert resume bullet point writer. Your task is to transform experience descriptions into compelling, achievement-focused bullet points.

For each bullet point:
1. Start with a strong action verb in past tense
2. Include quantifiable metrics where possible
3. Highlight the impact or outcome
4. Keep it concise (1-2 lines)
5. Use industry-relevant keywords naturally

Format: [Action Verb] + [Task/Project] + [Method/Approach] + [Quantifiable Result]

Examples of transformations:
- Weak: "Helped with customer service"
- Strong: "Resolved 50+ customer inquiries daily, achieving 98% satisfaction rating through proactive problem-solving"

- Weak: "Worked on frontend"
- Strong: "Engineered responsive React components, reducing page load time by 40% and improving user engagement by 25%"

Output as a JSON object with the optimized bullet and reasoning.`,

  /**
   * Skills matcher prompt
   */
  SKILLS_MATCHER: `You are a skills analysis expert. Your task is to analyze a job description and map a candidate's skills to the requirements.

Your analysis should:
1. Extract required skills from the job description
2. Identify which candidate skills match directly
3. Find transferable skills that apply
4. Highlight skill gaps
5. Suggest how to frame existing experience

Output format:
{
  "required_skills": ["skill1", "skill2"],
  "matched_skills": [{"skill": "name", "evidence": "experience that proves it"}],
  "transferable_skills": [{"candidate_skill": "X", "applies_as": "Y", "reasoning": "why"}],
  "gaps": ["skill1", "skill2"],
  "recommendations": ["how to address gaps in resume"]
}`,

  /**
   * Summary writer prompt
   */
  SUMMARY_WRITER: `You are an expert at writing professional summaries for resumes. Create a compelling 2-4 sentence summary that:

1. Positions the candidate for the target role
2. Highlights years of relevant experience
3. Mentions 2-3 key strengths or achievements
4. Includes target industry keywords
5. Conveys professional value proposition

The summary should:
- Be written in first person (without using "I")
- Be specific, not generic
- Create immediate interest
- Match the tone of the target industry

Example:
"Results-driven Full Stack Developer with 5+ years building scalable web applications. Specialized in React and Node.js, with a track record of reducing load times by 40% and improving user retention. Passionate about clean code architecture and mentoring junior developers."`,

  /**
   * Experience tailorer prompt
   */
  EXPERIENCE_TAILORER: `You are a resume experience tailoring expert. Your task is to reframe work experience to align with a specific job opportunity.

Guidelines:
1. Prioritize experiences most relevant to the target role
2. Reorder bullet points by relevance
3. Adjust technical terminology to match job description
4. Highlight transferable achievements
5. Ensure authentic representation of experience

DO NOT:
- Fabricate experience or skills
- Exaggerate achievements
- Remove core responsibilities that show competence
- Use generic buzzwords without substance

Output should include:
- Reordered/optimized bullets
- Reasoning for changes
- Suggested additions from other experiences that apply`,
};

// ============================================================================
// Prompt Builders
// ============================================================================

/**
 * Build prompt for analyzing a job description
 */
export function buildJobAnalysisPrompt(jobDescription: string): string {
  return `Analyze the following job description to extract key information for resume tailoring.

JOB DESCRIPTION:
${jobDescription}

Extract and return a JSON object with:
{
  "title": "Job title",
  "company_type": "Startup/Enterprise/Agency/etc",
  "seniority_level": "Junior/Mid/Senior/Lead",
  "required_skills": {
    "must_have": ["critical skills"],
    "nice_to_have": ["preferred skills"]
  },
  "key_responsibilities": ["main duties"],
  "keywords": ["ATS keywords to include"],
  "culture_indicators": ["values, work style hints"],
  "experience_level": "X years",
  "education_requirements": ["if any"],
  "industry_focus": "if specified"
}`;
}

/**
 * Build prompt for tailoring a resume to a job
 */
export function buildResumeTailoringPrompt(
  profile: {
    name: string;
    experience: Array<{
      title: string;
      company: string;
      bullets: string[];
    }>;
    skills: string[];
    education: Array<{ degree: string; institution: string }>;
  },
  jobAnalysis: {
    title: string;
    required_skills: { must_have: string[]; nice_to_have: string[] };
    keywords: string[];
  }
): string {
  return `Create a tailored resume strategy for this candidate targeting the analyzed job.

CANDIDATE PROFILE:
Name: ${profile.name}
Experience:
${profile.experience.map((exp) => `
  ${exp.title} at ${exp.company}
  - ${exp.bullets.join('\n  - ')}`).join('\n')}

Skills: ${profile.skills.join(', ')}

Education:
${profile.education.map((edu) => `  ${edu.degree} - ${edu.institution}`).join('\n')}

TARGET JOB ANALYSIS:
Title: ${jobAnalysis.title}
Must-Have Skills: ${jobAnalysis.required_skills.must_have.join(', ')}
Nice-to-Have: ${jobAnalysis.required_skills.nice_to_have.join(', ')}
Keywords: ${jobAnalysis.keywords.join(', ')}

Provide a JSON response with:
{
  "match_score": 0-100,
  "summary_recommendation": "2-3 sentences for professional summary",
  "experience_order": ["job1", "job2"], // Recommended order of experiences
  "bullets_to_optimize": [
    {
      "original": "original bullet",
      "optimized": "improved bullet with keywords",
      "reasoning": "why this change"
    }
  ],
  "skills_to_highlight": ["skill1", "skill2"],
  "skills_to_add_if_true": ["skills to consider adding"],
  "missing_keywords": ["keywords not covered"],
  "additional_recommendations": ["other suggestions"]
}`;
}

/**
 * Build prompt for optimizing a single bullet point
 */
export function buildBulletOptimizationPrompt(
  bullet: string,
  context: {
    job_title: string;
    target_role: string;
    keywords: string[];
  }
): string {
  return `Optimize this resume bullet point for a ${context.target_role} position.

ORIGINAL BULLET:
"${bullet}"

TARGET ROLE: ${context.target_role}
CURRENT JOB TITLE: ${context.job_title}
KEYWORDS TO CONSIDER: ${context.keywords.join(', ')}

Rules:
1. Start with a strong action verb
2. Add metrics if possible (estimate reasonably if not provided)
3. Include relevant keywords naturally
4. Focus on impact and outcomes
5. Keep it concise (under 2 lines)

Return JSON:
{
  "optimized": "The improved bullet point",
  "action_verb": "The verb used",
  "metrics_added": true/false,
  "keywords_included": ["list"],
  "reasoning": "Why this is better"
}`;
}

/**
 * Build prompt for generating a professional summary
 */
export function buildSummaryGenerationPrompt(
  profile: {
    name: string;
    years_experience: number;
    current_title: string;
    key_skills: string[];
    top_achievements: string[];
  },
  targetRole: string,
  keywords: string[]
): string {
  return `Generate a professional summary for this candidate targeting "${targetRole}".

CANDIDATE:
- Years of Experience: ${profile.years_experience}
- Current/Most Recent Title: ${profile.current_title}
- Key Skills: ${profile.key_skills.join(', ')}
- Top Achievements: ${profile.top_achievements.join('; ')}

TARGET ROLE: ${targetRole}
KEYWORDS TO INCLUDE: ${keywords.join(', ')}

Write a compelling 2-4 sentence professional summary that:
1. Positions them for the target role
2. Highlights relevant experience level
3. Mentions 2-3 key strengths
4. Includes target keywords naturally
5. Creates immediate interest

Return JSON:
{
  "summary": "The professional summary text",
  "keywords_used": ["list of keywords incorporated"],
  "positioning": "How it positions the candidate",
  "hook": "What makes it compelling"
}`;
}

/**
 * Build prompt for skills section optimization
 */
export function buildSkillsSectionPrompt(
  candidateSkills: string[],
  requiredSkills: string[],
  niceToHaveSkills: string[]
): string {
  return `Optimize the skills section for this resume.

CANDIDATE SKILLS:
${candidateSkills.join(', ')}

REQUIRED BY JOB:
${requiredSkills.join(', ')}

NICE TO HAVE:
${niceToHaveSkills.join(', ')}

Create an optimized skills section that:
1. Prioritizes matching required skills first
2. Groups skills logically (Technical, Tools, Soft Skills)
3. Uses exact terminology from job description where applicable
4. Omits irrelevant skills that don't add value
5. Maintains authenticity (only include true skills)

Return JSON:
{
  "technical_skills": ["ordered list"],
  "tools_frameworks": ["ordered list"],
  "soft_skills": ["if applicable"],
  "matched_required": ["skills matching requirements"],
  "matched_nice_to_have": ["skills matching nice-to-have"],
  "missing_required": ["required skills not in candidate profile"],
  "recommendation": "Overall recommendation for skills section"
}`;
}

export default RESUME_PROMPTS;
