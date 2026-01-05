/**
 * Interview Analyzer Job (Autonomous Agent Version)
 *
 * Triggered when: INTERVIEW_COMPLETED event is published
 * Purpose: Analyze interview transcript using the Autonomous InterviewerAgent
 *
 * This job is part of the "Truth Loop" - it closes the feedback loop
 * between what users claim and what they demonstrate in interviews.
 *
 * UPDATED: Now uses the autonomous InterviewerAgent for AI analysis with:
 * - Iterative refinement (loop until confidence threshold met)
 * - Three-tier memory (learning from past interviews)
 * - Goal decomposition and planning
 * - Tool-based execution
 *
 * Interview Types:
 * - reality_check: Initial benchmark - verifies ALL claimed skills
 * - weekly_sprint: Progress tracking - checks improvement on gaps
 * - skill_deep_dive: Deep dive into specific skills
 *
 * Flow:
 * 1. Fetch interview transcript from DB
 * 2. Fetch user's claimed skills
 * 3. Use Autonomous InterviewerAgent for analysis
 * 4. Update user_skills with verification metadata
 * 5. Create skill verification records
 * 6. Trigger roadmap repath if gaps found
 */

import { task } from '@trigger.dev/sdk';
import { db } from '@/drizzle/db';
import { interviews, userSkills, skillVerifications } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

import {
  shouldSkipEvent,
  markEventProcessing,
  markEventCompleted,
  markEventFailed,
  publishAgentEvent,
} from '@/lib/agents/message-bus';

import { analyzeInterview, type AnalysisResult } from '@/lib/agents';

// ============================================================================
// Types
// ============================================================================

interface InterviewAnalyzerPayload {
  event_id: string;
  interview_id: string;
  user_id: string;
  duration_minutes: number;
  interview_type: 'reality_check' | 'weekly_sprint' | 'skill_deep_dive';
}

interface SkillAssessmentFromAgent {
  skill_name: string;
  claimed_level: string;
  verified_level: 'learning' | 'practicing' | 'proficient' | 'expert';
  confidence: number;
  evidence: string;
  gap_identified: boolean;
  recommendations: string[];
  improvement_noted?: boolean;
  previous_level?: string;
}

// ============================================================================
// Main Task
// ============================================================================

export const interviewAnalyzer = task({
  id: 'interview.analyze',
  maxDuration: 300, // 5 minutes max
  retry: {
    maxAttempts: 2, // Reduced retries since each attempt is expensive
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

    // Mark as processing
    await markEventProcessing(event_id);

    try {
      console.log('='.repeat(60));
      console.log('[Interview Analyzer] Job triggered (Autonomous Agent Mode)');
      console.log(`  Interview ID: ${interview_id}`);
      console.log(`  User ID: ${user_id}`);
      console.log(`  Duration: ${payload.duration_minutes} minutes`);
      console.log(`  Type: ${payload.interview_type}`);
      console.log('='.repeat(60));

      // =====================================================================
      // Step 1: Fetch interview transcript from DB
      // =====================================================================
      const interview = await db.query.interviews.findFirst({
        where: eq(interviews.id, interview_id),
      });

      if (!interview || !interview.raw_data?.transcript) {
        throw new Error('Interview transcript not found');
      }

      // Format transcript for the agent - validate structure first
      const rawTranscript = interview.raw_data.transcript;
      if (!Array.isArray(rawTranscript)) {
        throw new Error('Interview transcript is not in expected array format');
      }

      const typedTranscript = rawTranscript as Array<{
        speaker?: 'user' | 'agent';
        text?: string;
        timestamp?: string;
      }>;

      const formattedTranscript = typedTranscript
        .filter(t => t && typeof t.text === 'string')
        .map((t) => `${t.speaker === 'user' ? 'Candidate' : 'Interviewer'}: ${t.text}`)
        .join('\n\n');

      // =====================================================================
      // Step 2: Fetch user's claimed skills
      // =====================================================================
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

      // For weekly sprints, focus on skills with gaps
      const skillsToAnalyze = payload.interview_type === 'weekly_sprint'
        ? claimedSkills.filter(cs =>
            cs.verification_metadata?.gap_identified ||
            cs.verification_metadata?.is_verified
          )
        : claimedSkills;

      const targetSkills = skillsToAnalyze.map(cs => cs.skill?.name || 'Unknown');

      // =====================================================================
      // Step 3: Use Autonomous InterviewerAgent for Analysis
      // =====================================================================
      console.log('[Interview Analyzer] Starting autonomous agent analysis...');
      console.log(`  Target skills: ${targetSkills.join(', ')}`);

      // Map interview type to agent's expected type
      const agentInterviewType = mapInterviewType(payload.interview_type);

      const analysisResult: AnalysisResult = await analyzeInterview(
        interview_id,
        user_id,
        formattedTranscript,
        {
          interview_type: agentInterviewType,
          // Note: job_role and company not stored in interview schema
          // These are skill verification interviews, not job-specific
          config: {
            max_iterations: 3,
            confidence_threshold: 0.85,
            timeout_ms: 90000, // 90 seconds
            enable_learning: true,
          },
        }
      );

      if (!analysisResult.success || !analysisResult.analysis) {
        // Log detailed error info
        console.error('[Interview Analyzer] Agent analysis failed!');
        console.error('  Success:', analysisResult.success);
        console.error('  Has analysis:', !!analysisResult.analysis);
        console.error('  Iterations:', analysisResult.iterations);
        console.error('  Confidence:', analysisResult.confidence);
        console.error('  Reasoning trace:', analysisResult.reasoning_trace?.slice(-5));
        throw new Error(`Autonomous agent analysis failed: success=${analysisResult.success}, hasAnalysis=${!!analysisResult.analysis}`);
      }

      console.log('[Interview Analyzer] Autonomous agent analysis complete');
      console.log(`  Iterations: ${analysisResult.iterations}`);
      console.log(`  Confidence: ${(analysisResult.confidence * 100).toFixed(1)}%`);
      console.log(`  Duration: ${analysisResult.duration_ms}ms`);

      const agentAnalysis = analysisResult.analysis;

      // =====================================================================
      // Step 4: Map Agent Output to Skill Assessments
      // =====================================================================
      const skillAssessments = mapAgentOutputToSkillAssessments(
        agentAnalysis,
        claimedSkills,
        payload.interview_type
      );

      // =====================================================================
      // Step 5: Update user_skills with verification metadata
      // =====================================================================
      let gapsFound = 0;
      let skillsVerified = 0;
      let skillsImproved = 0;

      for (const assessment of skillAssessments) {
        const userSkill = claimedSkills.find(
          (cs) => cs.skill?.name?.toLowerCase() === assessment.skill_name.toLowerCase()
        );

        if (!userSkill) continue;

        const previousLevel = userSkill.verification_metadata?.verified_level as string | undefined;
        const isImprovement = assessment.improvement_noted ||
          (previousLevel && levelToNumber(assessment.verified_level) > levelToNumber(previousLevel));

        // Update verification metadata
        const existingMetadata = userSkill.verification_metadata as Record<string, unknown> || {};
        const newMetadata = {
          ...existingMetadata,
          is_verified: true,
          verification_count: ((existingMetadata.verification_count as number) || 0) + 1,
          latest_proof: {
            interview_id,
            timestamp: new Date().toISOString(),
            transcript_snippet: assessment.evidence.slice(0, 500),
            evaluator_confidence: assessment.confidence,
            agent_analysis: true, // Mark as autonomous agent analysis
          },
          verified_level: assessment.verified_level,
          gap_identified: assessment.gap_identified,
          recommendations: assessment.recommendations,
          // Track improvement history for weekly sprints
          ...(payload.interview_type === 'weekly_sprint' && previousLevel ? {
            improvement_history: [
              ...((existingMetadata.improvement_history as Array<unknown>) || []),
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
          ? 'Reality Check (Autonomous)'
          : payload.interview_type === 'weekly_sprint'
            ? 'Weekly Sprint (Autonomous)'
            : 'Skill Deep Dive (Autonomous)';

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
            evaluator_notes: `${assessment.recommendations.join('; ')} | Agent iterations: ${analysisResult.iterations}, confidence: ${(analysisResult.confidence * 100).toFixed(1)}%`,
            confidence_score: assessment.confidence,
          },
        });

        if (assessment.gap_identified) gapsFound++;
        if (isImprovement) skillsImproved++;
        skillsVerified++;
      }

      // =====================================================================
      // Step 6: Update interview with analysis results
      // =====================================================================
      // Safely access detailed_feedback with fallbacks
      const detailedFeedback = agentAnalysis.detailed_feedback || {};
      const communicationScore = detailedFeedback.communication?.score ?? 50;
      const technicalScore = detailedFeedback.technical?.score ?? 50;
      const problemSolvingScore = detailedFeedback.problem_solving?.score ?? 50;
      const culturalFitScore = detailedFeedback.cultural_fit?.score ?? 50;

      const overallScore = (
        communicationScore +
        technicalScore +
        problemSolvingScore +
        culturalFitScore
      ) / 4;

      // Map agent output to expected schema format
      const analysisForSchema = {
        skills_assessed: skillAssessments.map(a => ({
          skill_name: a.skill_name,
          claimed_level: a.claimed_level,
          verified_level: a.verified_level,
          confidence: a.confidence,
          evidence: a.evidence,
          gap_identified: a.gap_identified,
          recommendations: a.recommendations,
        })),
        overall_notes: [
          `Analysis by Autonomous Agent (${analysisResult.iterations} iterations, ${(analysisResult.confidence * 100).toFixed(1)}% confidence)`,
          `Overall Score: ${agentAnalysis.overall_score}/100`,
          `Strengths: ${(agentAnalysis.strengths || []).map(s => s.description).join('; ')}`,
          `Areas for Improvement: ${(agentAnalysis.improvements || []).map(i => i.description).join('; ')}`,
        ].join('\n'),
        career_alignment_score: culturalFitScore,
        self_awareness_score: problemSolvingScore,
        communication_score: communicationScore,
      };

      await db
        .update(interviews)
        .set({
          overall_score: String(overallScore),
          raw_data: {
            ...interview.raw_data,
            analysis: analysisForSchema,
          },
          updated_at: new Date(),
        })
        .where(eq(interviews.id, interview_id));

      // =====================================================================
      // Step 7: Trigger roadmap repath if gaps were found (Truth Loop)
      // =====================================================================
      if (gapsFound > 0) {
        const gapSkillNames = skillAssessments
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
              autonomous_analysis: true,
            },
          },
        });
      }

      // =====================================================================
      // Complete
      // =====================================================================
      await markEventCompleted(event_id);

      console.log('[Interview Analyzer] Complete (Autonomous Agent Mode)');
      console.log(`  Interview type: ${payload.interview_type}`);
      console.log(`  Skills verified: ${skillsVerified}`);
      console.log(`  Gaps found: ${gapsFound}`);
      console.log(`  Skills improved: ${skillsImproved}`);
      console.log(`  Agent iterations: ${analysisResult.iterations}`);
      console.log(`  Agent confidence: ${(analysisResult.confidence * 100).toFixed(1)}%`);

      return {
        success: true,
        analyzed: true,
        interview_id,
        interview_type: payload.interview_type,
        skills_verified: skillsVerified,
        gaps_found: gapsFound,
        skills_improved: skillsImproved,
        agent_analysis: {
          iterations: analysisResult.iterations,
          confidence: analysisResult.confidence,
          duration_ms: analysisResult.duration_ms,
          overall_score: agentAnalysis.overall_score,
        },
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map our interview types to agent's expected types
 */
function mapInterviewType(
  type: 'reality_check' | 'weekly_sprint' | 'skill_deep_dive'
): 'behavioral' | 'technical' | 'case' | 'mixed' {
  switch (type) {
    case 'reality_check':
      return 'mixed'; // Reality check covers all aspects
    case 'weekly_sprint':
      return 'technical'; // Weekly sprints focus on technical skills
    case 'skill_deep_dive':
      return 'technical'; // Deep dives are technical
    default:
      return 'mixed';
  }
}

/**
 * Map agent output to skill assessments
 */
function mapAgentOutputToSkillAssessments(
  analysis: NonNullable<AnalysisResult['analysis']>,
  claimedSkills: Array<{
    id: string;
    skill?: { name: string } | null;
    proficiency_level: string;
    verification_metadata?: Record<string, unknown> | null;
  }>,
  interviewType: string
): SkillAssessmentFromAgent[] {
  const assessments: SkillAssessmentFromAgent[] = [];

  // Extract skills from strengths
  for (const strength of analysis.strengths) {
    const matchingSkill = claimedSkills.find(cs =>
      strength.category.toLowerCase().includes(cs.skill?.name?.toLowerCase() || '') ||
      strength.description.toLowerCase().includes(cs.skill?.name?.toLowerCase() || '')
    );

    if (matchingSkill) {
      // Check if we already have an assessment for this skill
      const existingIndex = assessments.findIndex(
        a => a.skill_name.toLowerCase() === matchingSkill.skill?.name?.toLowerCase()
      );

      if (existingIndex === -1) {
        const previousLevel = matchingSkill.verification_metadata?.verified_level as string | undefined;
        assessments.push({
          skill_name: matchingSkill.skill?.name || 'Unknown',
          claimed_level: matchingSkill.proficiency_level,
          verified_level: mapScoreToLevel(analysis.overall_score),
          confidence: analysis.overall_score / 100,
          evidence: strength.evidence,
          gap_identified: false, // Strengths don't have gaps
          recommendations: [],
          improvement_noted: interviewType === 'weekly_sprint' && previousLevel
            ? levelToNumber(mapScoreToLevel(analysis.overall_score)) > levelToNumber(previousLevel)
            : undefined,
          previous_level: previousLevel,
        });
      }
    }
  }

  // Extract skills from improvements (these are potential gaps)
  for (const improvement of analysis.improvements) {
    const matchingSkill = claimedSkills.find(cs =>
      improvement.category.toLowerCase().includes(cs.skill?.name?.toLowerCase() || '') ||
      improvement.description.toLowerCase().includes(cs.skill?.name?.toLowerCase() || '')
    );

    if (matchingSkill) {
      const existingIndex = assessments.findIndex(
        a => a.skill_name.toLowerCase() === matchingSkill.skill?.name?.toLowerCase()
      );

      const previousLevel = matchingSkill.verification_metadata?.verified_level as string | undefined;
      const verifiedLevel = improvement.priority === 'high' ? 'learning' :
                           improvement.priority === 'medium' ? 'practicing' : 'proficient';

      // Determine if there's a gap
      const claimedLevelNum = levelToNumber(matchingSkill.proficiency_level);
      const verifiedLevelNum = levelToNumber(verifiedLevel);
      const hasGap = claimedLevelNum > verifiedLevelNum;

      if (existingIndex === -1) {
        assessments.push({
          skill_name: matchingSkill.skill?.name || 'Unknown',
          claimed_level: matchingSkill.proficiency_level,
          verified_level: verifiedLevel,
          confidence: 0.7, // Lower confidence for improvement-based assessments
          evidence: improvement.description,
          gap_identified: hasGap,
          recommendations: [improvement.suggestion],
          improvement_noted: false,
          previous_level: previousLevel,
        });
      } else {
        // Update existing assessment with gap info
        assessments[existingIndex].gap_identified = hasGap;
        assessments[existingIndex].recommendations.push(improvement.suggestion);
      }
    }
  }

  // For skills not mentioned, infer from overall score
  for (const skill of claimedSkills) {
    const exists = assessments.some(
      a => a.skill_name.toLowerCase() === skill.skill?.name?.toLowerCase()
    );

    if (!exists && skill.skill?.name) {
      const previousLevel = skill.verification_metadata?.verified_level as string | undefined;
      const inferredLevel = mapScoreToLevel(analysis.overall_score);
      const claimedLevelNum = levelToNumber(skill.proficiency_level);
      const inferredLevelNum = levelToNumber(inferredLevel);

      assessments.push({
        skill_name: skill.skill.name,
        claimed_level: skill.proficiency_level,
        verified_level: inferredLevel,
        confidence: 0.5, // Lower confidence for inferred assessments
        evidence: 'Inferred from overall interview performance',
        gap_identified: claimedLevelNum > inferredLevelNum + 1, // Only flag significant gaps
        recommendations: [],
        improvement_noted: interviewType === 'weekly_sprint' && previousLevel
          ? inferredLevelNum > levelToNumber(previousLevel)
          : undefined,
        previous_level: previousLevel,
      });
    }
  }

  return assessments;
}

/**
 * Map overall score (0-100) to proficiency level
 */
function mapScoreToLevel(score: number): 'learning' | 'practicing' | 'proficient' | 'expert' {
  if (score >= 85) return 'expert';
  if (score >= 70) return 'proficient';
  if (score >= 50) return 'practicing';
  return 'learning';
}

/**
 * Convert level to number for comparison
 */
function levelToNumber(level: string): number {
  const levelMap: Record<string, number> = {
    learning: 1,
    practicing: 2,
    proficient: 3,
    expert: 4,
  };
  return levelMap[level.toLowerCase()] || 0;
}
