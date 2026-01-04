/**
 * Intelligent Job Matcher
 *
 * Matches users to jobs based on their skills, preferences, and verified abilities.
 * This is where the Sentinel Agent becomes truly "agentic" - it doesn't just
 * find jobs, it understands the quality of the match and provides recommendations.
 */

import type { NormalizedJob, JobMatchResult, UserSkillProfile } from './types';
import OpenAI from 'openai';

// ============================================================================
// Job Matching Algorithm
// ============================================================================

/**
 * Match a user to jobs based on their skills and preferences
 *
 * @param user - User's skill profile
 * @param jobs - Available jobs to match against
 * @param options - Matching options
 * @returns Array of matched jobs with scores
 */
export function matchUserToJobs(
  user: UserSkillProfile,
  jobs: NormalizedJob[],
  options: {
    minMatchScore?: number;
    maxResults?: number;
    prioritizeVerified?: boolean;
  } = {}
): JobMatchResult[] {
  const { minMatchScore = 30, maxResults = 50, prioritizeVerified = true } = options;

  const results: JobMatchResult[] = [];

  for (const job of jobs) {
    const matchResult = calculateJobMatch(user, job, { prioritizeVerified });

    if (matchResult.match_score >= minMatchScore) {
      results.push(matchResult);
    }
  }

  // Sort by match score (highest first)
  results.sort((a, b) => b.match_score - a.match_score);

  return results.slice(0, maxResults);
}

/**
 * Calculate match between a user and a single job
 */
export function calculateJobMatch(
  user: UserSkillProfile,
  job: NormalizedJob,
  options: { prioritizeVerified?: boolean } = {}
): JobMatchResult {
  const { prioritizeVerified = true } = options;

  const userSkillNames = new Set(
    user.skills.map((s) => s.name.toLowerCase())
  );
  const userVerifiedSkills = new Set(
    user.skills
      .filter((s) => s.is_verified)
      .map((s) => s.name.toLowerCase())
  );

  const jobSkills = job.required_skills.map((s) => s.toLowerCase());

  // Calculate matching and missing skills
  const matchingSkills: string[] = [];
  const matchingVerifiedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const jobSkill of jobSkills) {
    if (userSkillNames.has(jobSkill)) {
      matchingSkills.push(jobSkill);
      if (userVerifiedSkills.has(jobSkill)) {
        matchingVerifiedSkills.push(jobSkill);
      }
    } else {
      missingSkills.push(jobSkill);
    }
  }

  // Calculate base match score
  let matchScore = 0;

  if (jobSkills.length > 0) {
    // Skill coverage (0-60 points)
    const skillCoverage = matchingSkills.length / jobSkills.length;
    matchScore += skillCoverage * 60;

    // Verified skill bonus (0-20 points)
    if (prioritizeVerified && matchingSkills.length > 0) {
      const verifiedRatio = matchingVerifiedSkills.length / matchingSkills.length;
      matchScore += verifiedRatio * 20;
    } else {
      matchScore += 10; // Neutral bonus if not prioritizing verified
    }
  } else {
    // No skills listed - use title matching
    matchScore = calculateTitleMatch(user.target_roles, job.title) * 40;
  }

  // Role alignment bonus (0-10 points)
  if (user.target_roles.length > 0) {
    const roleMatch = calculateTitleMatch(user.target_roles, job.title);
    matchScore += roleMatch * 10;
  }

  // Remote preference bonus (0-5 points)
  if (user.preferred_remote_type && job.remote_type) {
    if (user.preferred_remote_type === job.remote_type) {
      matchScore += 5;
    } else if (
      user.preferred_remote_type === 'remote' &&
      job.remote_type === 'hybrid'
    ) {
      matchScore += 2;
    }
  }

  // Location preference bonus (0-5 points)
  if (user.preferred_locations && user.preferred_locations.length > 0) {
    const locationMatch = user.preferred_locations.some((loc) =>
      job.location.toLowerCase().includes(loc.toLowerCase())
    );
    if (locationMatch) {
      matchScore += 5;
    }
  }

  // Cap at 100
  matchScore = Math.min(100, Math.round(matchScore));

  // Determine salary fit
  const salaryFit = calculateSalaryFit(user.min_salary, job.salary_min, job.salary_max);

  // Generate recommendation
  const recommendation = generateRecommendation(
    matchScore,
    matchingSkills.length,
    missingSkills.length,
    matchingVerifiedSkills.length
  );

  return {
    job,
    match_score: matchScore,
    matching_skills: matchingSkills.map(normalizeCase),
    missing_skills: missingSkills.map(normalizeCase),
    salary_fit: salaryFit,
    recommendation,
  };
}

/**
 * Calculate how well the job title matches user's target roles
 */
function calculateTitleMatch(targetRoles: string[], jobTitle: string): number {
  const lowerTitle = jobTitle.toLowerCase();

  for (const role of targetRoles) {
    const lowerRole = role.toLowerCase();

    // Exact match
    if (lowerTitle.includes(lowerRole)) {
      return 1;
    }

    // Partial match - check individual words
    const roleWords = lowerRole.split(/\s+/);
    const matchingWords = roleWords.filter((word) =>
      word.length > 3 && lowerTitle.includes(word)
    );

    if (matchingWords.length >= roleWords.length / 2) {
      return 0.7;
    }
  }

  return 0;
}

/**
 * Calculate salary fit
 */
function calculateSalaryFit(
  userMin: number | undefined,
  jobMin: number | null,
  jobMax: number | null
): 'above' | 'within' | 'below' | 'unknown' {
  if (!userMin || (!jobMin && !jobMax)) {
    return 'unknown';
  }

  const jobMid = ((jobMin || 0) + (jobMax || jobMin || 0)) / 2;

  if (jobMid >= userMin * 1.1) {
    return 'above';
  } else if (jobMid >= userMin * 0.9) {
    return 'within';
  } else {
    return 'below';
  }
}

/**
 * Generate a recommendation based on match quality
 */
function generateRecommendation(
  score: number,
  matchingCount: number,
  missingCount: number,
  verifiedCount: number
): 'strong_match' | 'good_match' | 'partial_match' | 'stretch' {
  if (score >= 80 && verifiedCount >= 3) {
    return 'strong_match';
  } else if (score >= 60) {
    return 'good_match';
  } else if (score >= 40 || (matchingCount >= 3 && missingCount <= 3)) {
    return 'partial_match';
  } else {
    return 'stretch';
  }
}

/**
 * Normalize case for display
 */
function normalizeCase(skill: string): string {
  // Simple title case
  return skill
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ============================================================================
// AI-Powered Job Matching (More Agentic)
// ============================================================================

/**
 * Get AI-powered match explanation
 * This provides human-readable reasoning for why a job is a good match
 */
export async function explainMatchWithAI(
  user: UserSkillProfile,
  match: JobMatchResult
): Promise<{
  explanation: string;
  strengths: string[];
  gaps_to_address: string[];
  application_tips: string[];
}> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return generateBasicExplanation(match);
  }

  try {
    const openai = new OpenAI({ apiKey: openaiKey });

    const prompt = `Analyze this job match and provide personalized advice.

User Profile:
- Target Roles: ${user.target_roles.join(', ')}
- Skills: ${user.skills.map((s) => `${s.name} (${s.proficiency_level}${s.is_verified ? ', verified' : ''})`).join(', ')}

Job:
- Title: ${match.job.title}
- Company: ${match.job.company}
- Location: ${match.job.location}
- Remote: ${match.job.remote_type || 'Unknown'}

Match Analysis:
- Score: ${match.match_score}%
- Matching Skills: ${match.matching_skills.join(', ') || 'None'}
- Missing Skills: ${match.missing_skills.join(', ') || 'None'}
- Recommendation: ${match.recommendation}

Provide:
1. A 2-3 sentence explanation of why this is a ${match.recommendation.replace('_', ' ')}
2. 2-3 strengths the user has for this role
3. 1-3 skill gaps they should address (if any)
4. 2-3 tips for their application

Respond in JSON:
{
  "explanation": "...",
  "strengths": ["...", "..."],
  "gaps_to_address": ["..."],
  "application_tips": ["...", "..."]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a career coach helping job seekers understand their fit for roles.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response');

    return JSON.parse(content);
  } catch (error) {
    console.error('[Job Matcher] AI explanation failed:', error);
    return generateBasicExplanation(match);
  }
}

/**
 * Generate basic explanation without AI
 */
function generateBasicExplanation(match: JobMatchResult): {
  explanation: string;
  strengths: string[];
  gaps_to_address: string[];
  application_tips: string[];
} {
  const explanations: Record<string, string> = {
    strong_match: `This role at ${match.job.company} aligns well with your verified skills. You have ${match.matching_skills.length} matching skills out of ${match.matching_skills.length + match.missing_skills.length} required.`,
    good_match: `This is a solid match for your experience. You meet most requirements and ${match.job.company} could be a good fit.`,
    partial_match: `You have some relevant skills for this role. It may require some learning but could be achievable.`,
    stretch: `This role would be a stretch based on current skills. Consider it if you're willing to learn quickly.`,
  };

  return {
    explanation: explanations[match.recommendation],
    strengths: match.matching_skills.slice(0, 3),
    gaps_to_address: match.missing_skills.slice(0, 3),
    application_tips: [
      match.matching_skills.length > 0
        ? `Highlight your ${match.matching_skills[0]} experience`
        : 'Focus on transferable skills',
      'Research the company before applying',
    ],
  };
}

/**
 * Find the best job matches for a user and explain them
 */
export async function findBestMatchesWithExplanations(
  user: UserSkillProfile,
  jobs: NormalizedJob[],
  options: {
    minScore?: number;
    maxResults?: number;
    includeAIExplanations?: boolean;
  } = {}
): Promise<
  Array<
    JobMatchResult & {
      explanation?: {
        explanation: string;
        strengths: string[];
        gaps_to_address: string[];
        application_tips: string[];
      };
    }
  >
> {
  const {
    minScore = 50,
    maxResults = 10,
    includeAIExplanations = false,
  } = options;

  const matches = matchUserToJobs(user, jobs, {
    minMatchScore: minScore,
    maxResults,
    prioritizeVerified: true,
  });

  if (!includeAIExplanations) {
    return matches;
  }

  // Add AI explanations for top matches
  const resultsWithExplanations = [];
  for (const match of matches.slice(0, 5)) {
    // Only explain top 5
    const explanation = await explainMatchWithAI(user, match);
    resultsWithExplanations.push({ ...match, explanation });
  }

  // Add remaining matches without explanations
  for (const match of matches.slice(5)) {
    resultsWithExplanations.push(match);
  }

  return resultsWithExplanations;
}
