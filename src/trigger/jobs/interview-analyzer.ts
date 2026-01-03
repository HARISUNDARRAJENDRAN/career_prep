/**
 * Interview Analyzer Job
 *
 * Triggered when: INTERVIEW_COMPLETED event is published
 * Purpose: Analyze interview transcript to verify claimed skills
 *
 * This job is part of the "Truth Loop" - it closes the feedback loop
 * between what users claim and what they demonstrate in interviews.
 *
 * Interview Types:
 * - reality_check: Initial benchmark - verifies ALL claimed skills, establishes baseline
 * - weekly_sprint: Progress tracking - checks improvement on previously identified gaps
 *
 * Flow:
 * 1. Fetch interview transcript from DB
 * 2. Fetch user's claimed skills
 * 3. Use AI to analyze transcript for skill demonstrations
 * 4. Update user_skills with verification metadata
 * 5. Create skill verification records
 */

import { task } from '@trigger.dev/sdk';
import { db } from '@/drizzle/db';
import { interviews, userSkills, skillVerifications } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';

import {
  shouldSkipEvent,
  markEventCompleted,
  markEventFailed,
  publishAgentEvent,
} from '@/lib/agents/message-bus';

interface InterviewAnalyzerPayload {
  event_id: string;
  interview_id: string;
  user_id: string;
  duration_minutes: number;
  interview_type: 'reality_check' | 'weekly_sprint' | 'skill_deep_dive';
}

interface SkillAssessment {
  skill_name: string;
  claimed_level: string;
  verified_level: 'learning' | 'practicing' | 'proficient' | 'expert';
  confidence: number;
  evidence: string;
  gap_identified: boolean;
  recommendations: string[];
  // Weekly sprint specific
  improvement_noted?: boolean;
  previous_level?: string;
}

interface TranscriptAnalysis {
  skills_assessed: SkillAssessment[];
  overall_notes: string;
  career_alignment_score: number;
  self_awareness_score: number;
  communication_score: number;
  // Weekly sprint specific
  progress_summary?: string;
  areas_of_improvement?: string[];
}

export const interviewAnalyzer = task({
  id: 'interview.analyze',
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: InterviewAnalyzerPayload) => {
    const { event_id, interview_id, user_id } = payload;

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
      console.log('[Interview Analyzer] Job triggered');
      console.log(`  Interview ID: ${interview_id}`);
      console.log(`  User ID: ${user_id}`);
      console.log(`  Duration: ${payload.duration_minutes} minutes`);
      console.log(`  Type: ${payload.interview_type}`);
      console.log('='.repeat(60));

      // Step 1: Fetch interview transcript from DB
      const interview = await db.query.interviews.findFirst({
        where: eq(interviews.id, interview_id),
      });

      if (!interview || !interview.raw_data?.transcript) {
        throw new Error('Interview transcript not found');
      }

      const transcript = interview.raw_data.transcript;

      // Step 2: Fetch user's claimed skills
      const claimedSkills = await db.query.userSkills.findMany({
        where: eq(userSkills.user_id, user_id),
        with: { skill: true },
      });

      if (claimedSkills.length === 0) {
        console.log('[Interview Analyzer] No claimed skills to verify');
        await markEventCompleted(event_id);
        return {
          success: true,
          analyzed: false,
          reason: 'No skills to verify',
        };
      }

      // For weekly sprints, focus on skills with gaps or that need improvement
      const skillsToAnalyze = payload.interview_type === 'weekly_sprint'
        ? claimedSkills.filter(cs =>
            cs.verification_metadata?.gap_identified ||
            cs.verification_metadata?.is_verified
          )
        : claimedSkills; // Reality check analyzes ALL skills

      // Step 3: Analyze transcript for skill demonstrations (AI)
      const analysis = await analyzeTranscriptWithAI(
        transcript,
        skillsToAnalyze.map((cs) => ({
          name: cs.skill?.name || 'Unknown',
          claimed_level: cs.proficiency_level,
          previous_verified_level: cs.verification_metadata?.verified_level,
          had_gap: cs.verification_metadata?.gap_identified,
        })),
        payload.interview_type
      );

      console.log('[Interview Analyzer] AI Analysis complete');
      console.log(`  Skills assessed: ${analysis.skills_assessed.length}`);

      // Step 4: Update user_skills with verification metadata
      let gapsFound = 0;
      let skillsVerified = 0;
      let skillsImproved = 0;

      for (const assessment of analysis.skills_assessed) {
        // Find matching user skill
        const userSkill = claimedSkills.find(
          (cs) =>
            cs.skill?.name?.toLowerCase() === assessment.skill_name.toLowerCase()
        );

        if (!userSkill) continue;

        const previousLevel = userSkill.verification_metadata?.verified_level;
        const isImprovement = assessment.improvement_noted ||
          (previousLevel && levelToNumber(assessment.verified_level) > levelToNumber(previousLevel));

        // Update verification metadata
        const newMetadata = {
          ...userSkill.verification_metadata,
          is_verified: true,
          verification_count:
            (userSkill.verification_metadata?.verification_count || 0) + 1,
          latest_proof: {
            interview_id,
            timestamp: new Date().toISOString(),
            transcript_snippet: assessment.evidence.slice(0, 500),
            evaluator_confidence: assessment.confidence,
          },
          verified_level: assessment.verified_level,
          gap_identified: assessment.gap_identified,
          recommendations: assessment.recommendations,
          // Track improvement history for weekly sprints
          ...(payload.interview_type === 'weekly_sprint' && previousLevel ? {
            improvement_history: [
              ...(userSkill.verification_metadata as { improvement_history?: Array<{ from: string; to: string; date: string; interview_id: string }> })?.improvement_history || [],
              ...(isImprovement ? [{
                from: previousLevel,
                to: assessment.verified_level,
                date: new Date().toISOString(),
                interview_id,
              }] : []),
            ],
          } : {}),
        };

        await db
          .update(userSkills)
          .set({
            proficiency_level: assessment.verified_level,
            verification_metadata: newMetadata,
            updated_at: new Date(),
          })
          .where(eq(userSkills.id, userSkill.id));

        // Create verification record
        const summaryPrefix = payload.interview_type === 'reality_check'
          ? 'Reality Check'
          : 'Weekly Sprint';

        await db.insert(skillVerifications).values({
          user_skill_id: userSkill.id,
          interview_id,
          verification_type: 'concept_explanation',
          summary: assessment.gap_identified
            ? `${summaryPrefix}: Gap found - Claimed ${assessment.claimed_level}, verified as ${assessment.verified_level}`
            : isImprovement
              ? `${summaryPrefix}: Improved from ${previousLevel} to ${assessment.verified_level}`
              : `${summaryPrefix}: Verified at ${assessment.verified_level} level`,
          raw_data: {
            transcript_snippet: assessment.evidence,
            evaluator_notes: assessment.recommendations.join('; '),
            confidence_score: assessment.confidence,
          },
        });

        if (assessment.gap_identified) {
          gapsFound++;
        }
        if (isImprovement) {
          skillsImproved++;
        }
        skillsVerified++;
      }

      // Update interview with overall scores
      await db
        .update(interviews)
        .set({
          overall_score: String(
            (analysis.career_alignment_score +
              analysis.self_awareness_score +
              analysis.communication_score) /
              3
          ),
          raw_data: {
            ...interview.raw_data,
            analysis: {
              skills_assessed: analysis.skills_assessed,
              overall_notes: analysis.overall_notes,
              career_alignment_score: analysis.career_alignment_score,
              self_awareness_score: analysis.self_awareness_score,
              communication_score: analysis.communication_score,
            },
          },
          updated_at: new Date(),
        })
        .where(eq(interviews.id, interview_id));

      // Step 5: Trigger roadmap repath if gaps were found (Truth Loop)
      // This closes the feedback loop from interviews to roadmaps
      if (gapsFound > 0) {
        // Collect the names of skills with gaps for the repath event
        const gapSkillNames = analysis.skills_assessed
          .filter((a) => a.gap_identified)
          .map((a) => a.skill_name);

        console.log(`[Interview Analyzer] Triggering roadmap repath for ${gapsFound} gaps`);
        console.log(`  Gap skills: ${gapSkillNames.join(', ')}`);

        await publishAgentEvent({
          type: 'ROADMAP_REPATH_NEEDED',
          payload: {
            user_id,
            reason: 'skill_verification_gaps',
            details: {
              gaps: gapSkillNames,
              interview_id,
              interview_type: payload.interview_type,
              gaps_count: gapsFound,
              verified_count: skillsVerified,
              improved_count: skillsImproved,
            },
          },
        });
      }

      // Mark event as completed
      await markEventCompleted(event_id);

      console.log('[Interview Analyzer] Complete');
      console.log(`  Interview type: ${payload.interview_type}`);
      console.log(`  Skills verified: ${skillsVerified}`);
      console.log(`  Gaps found: ${gapsFound}`);
      if (payload.interview_type === 'weekly_sprint') {
        console.log(`  Skills improved: ${skillsImproved}`);
      }

      return {
        success: true,
        analyzed: true,
        interview_id,
        interview_type: payload.interview_type,
        skills_verified: skillsVerified,
        gaps_found: gapsFound,
        skills_improved: skillsImproved,
        analysis_summary: analysis.overall_notes,
        progress_summary: analysis.progress_summary,
      };
    } catch (error) {
      console.error('[Interview Analyzer] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error; // Re-throw for Trigger.dev retry logic
    }
  },
});

/**
 * Analyze interview transcript using OpenAI to assess skill levels
 */
async function analyzeTranscriptWithAI(
  transcript: Array<{
    speaker: 'user' | 'agent';
    text: string;
    timestamp: string;
    emotions?: Record<string, number>;
  }>,
  claimedSkills: Array<{
    name: string;
    claimed_level: string;
    previous_verified_level?: string;
    had_gap?: boolean;
  }>,
  interviewType: 'reality_check' | 'weekly_sprint' | 'skill_deep_dive'
): Promise<TranscriptAnalysis> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Format transcript for analysis
  const formattedTranscript = transcript
    .map((t) => `${t.speaker === 'user' ? 'Candidate' : 'Interviewer'}: ${t.text}`)
    .join('\n\n');

  // Different prompts based on interview type
  const prompt = interviewType === 'weekly_sprint'
    ? buildWeeklySprintPrompt(claimedSkills, formattedTranscript)
    : buildRealityCheckPrompt(claimedSkills, formattedTranscript);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are an expert technical interviewer. Analyze transcripts objectively and provide actionable feedback. Always respond with valid JSON.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  const analysis = JSON.parse(content) as TranscriptAnalysis;

  // Validate and normalize the response
  return {
    skills_assessed: analysis.skills_assessed.map((s) => ({
      skill_name: s.skill_name,
      claimed_level: s.claimed_level,
      verified_level: normalizeLevel(s.verified_level),
      confidence: Math.min(1, Math.max(0, s.confidence)),
      evidence: s.evidence || '',
      gap_identified: s.gap_identified || false,
      recommendations: s.recommendations || [],
      improvement_noted: s.improvement_noted,
      previous_level: s.previous_level,
    })),
    overall_notes: analysis.overall_notes || '',
    career_alignment_score: Math.min(10, Math.max(0, analysis.career_alignment_score)),
    self_awareness_score: Math.min(10, Math.max(0, analysis.self_awareness_score)),
    communication_score: Math.min(10, Math.max(0, analysis.communication_score)),
    progress_summary: analysis.progress_summary,
    areas_of_improvement: analysis.areas_of_improvement,
  };
}

/**
 * Build prompt for Reality Check interview - Initial benchmark
 */
function buildRealityCheckPrompt(
  claimedSkills: Array<{ name: string; claimed_level: string }>,
  formattedTranscript: string
): string {
  return `You are an expert technical interviewer analyzing a REALITY CHECK interview transcript.

This is the candidate's FIRST interview - we're establishing their baseline skill levels.

## Candidate's Claimed Skills (from resume)
${claimedSkills.map((s) => `- ${s.name}: ${s.claimed_level}`).join('\n')}

## Interview Transcript
${formattedTranscript}

## Your Task
Analyze the transcript and VERIFY each claimed skill based on what the candidate actually demonstrated.
This is the initial benchmark - be thorough but fair.

For each skill, determine:
1. **verified_level**: The actual skill level demonstrated (learning, practicing, proficient, expert)
2. **confidence**: How confident you are in this assessment (0.0 to 1.0)
3. **evidence**: Key quotes or moments that support your assessment
4. **gap_identified**: TRUE if there's a significant gap between claimed and verified level
5. **recommendations**: Specific, actionable areas to improve

Also provide overall scores (0-10) for:
- career_alignment_score: Does their passion match their career goals?
- self_awareness_score: Do they accurately know their own abilities?
- communication_score: How clearly do they explain technical concepts?

Respond in JSON format:
{
  "skills_assessed": [
    {
      "skill_name": "Python",
      "claimed_level": "expert",
      "verified_level": "proficient",
      "confidence": 0.85,
      "evidence": "Candidate explained decorators well but struggled with metaclasses...",
      "gap_identified": true,
      "recommendations": ["Study metaclasses", "Practice design patterns"]
    }
  ],
  "overall_notes": "Summary of the candidate's baseline performance...",
  "career_alignment_score": 7.5,
  "self_awareness_score": 6.0,
  "communication_score": 8.0
}`;
}

/**
 * Build prompt for Weekly Sprint interview - Progress tracking
 */
function buildWeeklySprintPrompt(
  claimedSkills: Array<{
    name: string;
    claimed_level: string;
    previous_verified_level?: string;
    had_gap?: boolean;
  }>,
  formattedTranscript: string
): string {
  const skillsWithGaps = claimedSkills.filter(s => s.had_gap);
  const otherSkills = claimedSkills.filter(s => !s.had_gap);

  return `You are an expert technical interviewer analyzing a WEEKLY SPRINT interview transcript.

This is a FOLLOW-UP interview to track the candidate's PROGRESS since their last assessment.

## Skills with Previously Identified Gaps (FOCUS ON THESE)
${skillsWithGaps.length > 0
  ? skillsWithGaps.map((s) =>
      `- ${s.name}: Previously verified at "${s.previous_verified_level}" (gap from claimed "${s.claimed_level}")`
    ).join('\n')
  : 'No previous gaps identified'}

## Other Verified Skills
${otherSkills.map((s) =>
  `- ${s.name}: Currently at "${s.previous_verified_level || s.claimed_level}"`
).join('\n')}

## Interview Transcript
${formattedTranscript}

## Your Task
Track the candidate's PROGRESS, especially on skills where gaps were previously identified.
Look for signs of learning, practice, and improvement.

For each skill discussed, determine:
1. **verified_level**: Current skill level demonstrated (learning, practicing, proficient, expert)
2. **previous_level**: Their level from last assessment (if known)
3. **improvement_noted**: TRUE if they've improved since last assessment
4. **confidence**: How confident you are (0.0 to 1.0)
5. **evidence**: Key quotes showing improvement or current level
6. **gap_identified**: TRUE if there's still a significant gap
7. **recommendations**: Next steps to continue improving

Also provide:
- overall_notes: Summary of their progress
- progress_summary: Brief description of improvements made
- areas_of_improvement: List of areas where they showed growth
- career_alignment_score, self_awareness_score, communication_score (0-10)

Respond in JSON format:
{
  "skills_assessed": [
    {
      "skill_name": "Python",
      "claimed_level": "expert",
      "previous_level": "practicing",
      "verified_level": "proficient",
      "improvement_noted": true,
      "confidence": 0.85,
      "evidence": "Candidate now correctly explains metaclasses, showing significant improvement...",
      "gap_identified": false,
      "recommendations": ["Continue practicing advanced patterns"]
    }
  ],
  "overall_notes": "Summary of the candidate's progress this week...",
  "progress_summary": "Showed improvement in Python metaclasses and design patterns",
  "areas_of_improvement": ["Python metaclasses", "Design patterns"],
  "career_alignment_score": 8.0,
  "self_awareness_score": 7.5,
  "communication_score": 8.0
}`;
}

function normalizeLevel(
  level: string
): 'learning' | 'practicing' | 'proficient' | 'expert' {
  const normalized = level.toLowerCase();
  if (normalized.includes('expert') || normalized.includes('advanced')) {
    return 'expert';
  }
  if (normalized.includes('proficient') || normalized.includes('intermediate')) {
    return 'proficient';
  }
  if (normalized.includes('practicing') || normalized.includes('developing')) {
    return 'practicing';
  }
  return 'learning';
}

function levelToNumber(level: string): number {
  const levelMap: Record<string, number> = {
    learning: 1,
    practicing: 2,
    proficient: 3,
    expert: 4,
  };
  return levelMap[level.toLowerCase()] || 0;
}
