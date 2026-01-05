/**
 * Sentinel Agent Prompts
 *
 * System prompts and templates for market intelligence analysis.
 *
 * @see docs/agentic-improvements/05-AGENT_COORDINATOR.md
 */

// ============================================================================
// System Prompts
// ============================================================================

export const SENTINEL_PROMPTS = {
  /**
   * Main system prompt for market analysis
   */
  SYSTEM_MARKET_ANALYST: `You are an expert job market analyst AI. Your role is to:

1. Analyze job listings to extract meaningful market insights
2. Identify emerging skills and technologies
3. Detect market trends and shifts
4. Match users to relevant opportunities based on skill alignment

You provide actionable intelligence that helps users stay ahead of market changes.

Guidelines:
- Be data-driven in your assessments
- Identify both obvious and subtle patterns
- Prioritize skills with high demand trajectory
- Consider regional variations in job markets
- Factor in salary data when available`,

  /**
   * Skill extraction from job descriptions
   */
  SKILL_EXTRACTOR: `You are a skill extraction specialist. Given job descriptions, extract:

1. Hard/Technical Skills:
   - Programming languages (Python, JavaScript, etc.)
   - Frameworks and libraries (React, TensorFlow, etc.)
   - Tools and platforms (AWS, Docker, etc.)
   - Methodologies (Agile, CI/CD, etc.)

2. Soft Skills:
   - Communication, leadership, teamwork
   - Problem-solving, analytical thinking
   - Project management

3. Domain Knowledge:
   - Industry-specific knowledge
   - Certifications or qualifications

Return structured JSON with confidence scores for each extracted skill.`,

  /**
   * Market trend detection
   */
  TREND_DETECTOR: `You are a market trend detection system. Analyze job market data to identify:

1. Rising Skills: Technologies seeing increased demand
2. Declining Skills: Technologies with decreasing mentions
3. Emerging Roles: New job titles appearing
4. Salary Trends: Compensation changes
5. Remote Work Patterns: Location flexibility trends

Provide trend direction (rising/stable/declining) with supporting evidence.`,

  /**
   * Job-user matching
   */
  JOB_MATCHER: `You are a job matching specialist. Given:
- A user's skill profile (skills, proficiency levels, experience)
- A job listing (requirements, nice-to-haves, description)

Calculate a match score (0-100) based on:
- Required skill overlap (40% weight)
- Nice-to-have skill overlap (20% weight)
- Experience alignment (20% weight)
- Career trajectory fit (20% weight)

Identify matching skills and gaps. Provide actionable recommendations.`,

  /**
   * GitHub velocity analysis
   */
  GITHUB_ANALYZER: `You are a GitHub ecosystem analyst. Analyze:

1. Trending repositories and their technologies
2. Language popularity trends
3. Framework adoption rates
4. Open source project health metrics

Correlate GitHub activity with job market demand to identify:
- Skills gaining real-world traction
- Technologies with strong community support
- Early signals of emerging trends`,
};

// ============================================================================
// Prompt Builders
// ============================================================================

/**
 * Build a skill extraction prompt
 */
export function buildSkillExtractionPrompt(
  jobDescription: string,
  jobTitle: string,
  company?: string
): string {
  return `Extract skills from this job listing:

Job Title: ${jobTitle}
${company ? `Company: ${company}` : ''}

Description:
${jobDescription}

Return JSON in this format:
{
  "technical_skills": [
    { "name": "skill", "category": "language|framework|tool|platform", "confidence": 0.9, "required": true }
  ],
  "soft_skills": [
    { "name": "skill", "confidence": 0.8 }
  ],
  "domain_knowledge": [
    { "name": "domain", "confidence": 0.7 }
  ],
  "experience_years": { "min": 2, "max": 5 },
  "education": ["Bachelor's in CS", "equivalent experience"]
}`;
}

/**
 * Build a market analysis prompt
 */
export function buildMarketAnalysisPrompt(
  jobs: Array<{ title: string; company: string; skills: string[] }>,
  previousInsights?: { trending_skills: string[]; skill_demand: Record<string, number> }
): string {
  const jobSummary = jobs.slice(0, 50).map((j, i) => 
    `${i + 1}. ${j.title} at ${j.company}: ${j.skills.slice(0, 5).join(', ')}`
  ).join('\n');

  const previousContext = previousInsights 
    ? `\nPrevious trending skills: ${previousInsights.trending_skills.slice(0, 10).join(', ')}`
    : '';

  return `Analyze these ${jobs.length} job listings for market trends:

${jobSummary}
${previousContext}

Provide analysis in JSON format:
{
  "trending_skills": ["skill1", "skill2"],
  "skill_demand": { "skill": demand_score },
  "emerging_roles": ["role1", "role2"],
  "market_summary": "Brief overview of market state",
  "recommendations": ["actionable recommendation 1", "recommendation 2"],
  "notable_shifts": [
    { "type": "skill_rise|skill_decline|new_role", "description": "...", "impact": "high|medium|low" }
  ]
}`;
}

/**
 * Build a job matching prompt
 */
export function buildJobMatchingPrompt(
  userSkills: Array<{ name: string; proficiency: number; verified: boolean }>,
  targetRoles: string[],
  job: { title: string; company: string; skills: string[]; description: string }
): string {
  const skillList = userSkills
    .map((s) => `- ${s.name} (${s.proficiency}/10${s.verified ? ', verified' : ''})`)
    .join('\n');

  return `Calculate job match score:

USER PROFILE:
Target Roles: ${targetRoles.join(', ')}
Skills:
${skillList}

JOB LISTING:
Title: ${job.title}
Company: ${job.company}
Required Skills: ${job.skills.join(', ')}
Description: ${job.description.slice(0, 500)}...

Return JSON:
{
  "match_score": 75,
  "matching_skills": ["skill1", "skill2"],
  "missing_skills": ["skill3"],
  "skill_gap_analysis": "Brief analysis of gaps",
  "fit_assessment": "Why this is/isn't a good fit",
  "recommendations": ["How to improve chances"]
}`;
}

/**
 * Build GitHub correlation prompt
 */
export function buildGitHubCorrelationPrompt(
  githubTrends: Array<{ name: string; stars: number; language: string }>,
  jobDemand: Record<string, number>
): string {
  const trends = githubTrends.slice(0, 20).map((t) => 
    `${t.name} (${t.language}): ${t.stars} stars`
  ).join('\n');

  const demand = Object.entries(jobDemand)
    .slice(0, 20)
    .map(([skill, score]) => `${skill}: ${score}`)
    .join('\n');

  return `Correlate GitHub trends with job market demand:

GITHUB TRENDING:
${trends}

JOB MARKET DEMAND:
${demand}

Identify:
1. Skills with high GitHub activity AND job demand (strong signal)
2. Skills with high GitHub activity but low job demand (emerging)
3. Skills with high job demand but low GitHub activity (established)

Return JSON:
{
  "correlations": [
    { "skill": "...", "github_signal": 0.8, "job_demand": 0.9, "verdict": "strong_match|emerging|established" }
  ],
  "emerging_technologies": ["tech1", "tech2"],
  "recommendations": ["action1", "action2"]
}`;
}

export default SENTINEL_PROMPTS;
