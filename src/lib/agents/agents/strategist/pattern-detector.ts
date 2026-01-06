/**
 * Pattern Detector
 *
 * Detects cross-domain patterns across agent events.
 * Identifies skill gap clusters, performance trends, and milestones.
 *
 * @see docs/agentic-improvements/09-STRATEGIST_AGENT.md
 */

import { db } from '@/drizzle/db';
import {
  interviews,
  jobApplications,
  userSkills,
  roadmaps,
  roadmapModules,
  agentEvents,
} from '@/drizzle/schema';
import { eq, desc, and, gte, sql, count } from 'drizzle-orm';
import type { AgentEventType } from '../../events';

// ============================================================================
// Types
// ============================================================================

/**
 * Skill gap cluster - when multiple rejections mention the same skill gap
 */
export interface SkillGapCluster {
  skill: string;
  occurrences: number;
  sources: Array<{
    type: 'rejection' | 'interview' | 'market';
    event_id: string;
    timestamp: Date;
  }>;
  severity: 'critical' | 'high' | 'medium' | 'low';
  first_detected: Date;
  last_detected: Date;
}

/**
 * Trend analysis for a specific metric
 */
export interface TrendAnalysis {
  metric: string;
  direction: 'improving' | 'stable' | 'declining';
  change_percentage: number;
  data_points: Array<{ date: Date; value: number }>;
  significance: 'significant' | 'marginal' | 'noise';
  period_days: number;
}

/**
 * Milestone detection
 */
export interface MilestoneDetection {
  type:
    | 'first_interview'
    | 'first_application'
    | 'first_response'
    | 'streak'
    | 'skill_mastery'
    | 'module_completion'
    | 'job_offer';
  description: string;
  achieved_at: Date;
  celebration_level: 'major' | 'minor';
  metadata?: Record<string, unknown>;
}

/**
 * Pattern match result
 */
export interface PatternMatch {
  type: 'skill_gap_cluster' | 'declining_trend' | 'milestone' | 'stall' | 'velocity_drop';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  detected_at: Date;
  data: SkillGapCluster | TrendAnalysis | MilestoneDetection | Record<string, unknown>;
  recommended_action?: string;
}

// ============================================================================
// Pattern Detector Class
// ============================================================================

export class PatternDetector {
  private userId: string;
  private timeWindowDays: number;

  constructor(userId: string, timeWindowDays: number = 30) {
    this.userId = userId;
    this.timeWindowDays = timeWindowDays;
  }

  /**
   * Run all pattern detection algorithms
   */
  async detectAll(): Promise<PatternMatch[]> {
    const patterns: PatternMatch[] = [];

    // Run all detectors in parallel
    const [
      skillGapPatterns,
      interviewTrends,
      applicationTrends,
      milestones,
      velocityPatterns,
    ] = await Promise.all([
      this.detectSkillGapClusters(),
      this.detectInterviewTrends(),
      this.detectApplicationTrends(),
      this.detectMilestones(),
      this.detectVelocityChanges(),
    ]);

    patterns.push(...skillGapPatterns);
    patterns.push(...interviewTrends);
    patterns.push(...applicationTrends);
    patterns.push(...milestones);
    patterns.push(...velocityPatterns);

    return patterns;
  }

  /**
   * Detect skill gap clusters from rejections and interviews
   */
  async detectSkillGapClusters(): Promise<PatternMatch[]> {
    const patterns: PatternMatch[] = [];
    const cutoffDate = this.getCutoffDate();

    try {
      // Get rejected applications with feedback
      const rejections = await db.query.jobApplications.findMany({
        where: and(
          eq(jobApplications.user_id, this.userId),
          eq(jobApplications.status, 'rejected'),
          gte(jobApplications.created_at, cutoffDate)
        ),
        orderBy: [desc(jobApplications.created_at)],
      });

      // Get interviews with analysis
      const interviewRecords = await db.query.interviews.findMany({
        where: and(
          eq(interviews.user_id, this.userId),
          eq(interviews.status, 'completed'),
          gte(interviews.created_at, cutoffDate)
        ),
        orderBy: [desc(interviews.created_at)],
      });

      // Aggregate skill mentions
      const skillMentions = new Map<
        string,
        { sources: SkillGapCluster['sources']; dates: Date[] }
      >();

      // Extract skills from rejections (from raw_data field if available)
      for (const rejection of rejections) {
        // Try to get feedback from raw_data or email threads
        const rawData = rejection.raw_data as {
          interview_notes?: string;
          email_threads?: Array<{ body: string }>;
        } | null;

        let feedback = '';
        if (rawData?.interview_notes) {
          feedback = rawData.interview_notes;
        } else if (rawData?.email_threads?.length) {
          feedback = rawData.email_threads.map(e => e.body).join(' ');
        }
        const skills = this.extractSkillsFromText(feedback);

        for (const skill of skills) {
          const existing = skillMentions.get(skill) || { sources: [], dates: [] };
          existing.sources.push({
            type: 'rejection',
            event_id: rejection.id,
            timestamp: rejection.created_at,
          });
          existing.dates.push(rejection.created_at);
          skillMentions.set(skill, existing);
        }
      }

      // Extract skills from interview analyses
      for (const interview of interviewRecords) {
        const rawData = interview.raw_data as {
          analysis?: {
            improvements?: Array<{ category?: string; skill?: string }>;
            skill_gaps?: string[];
          };
        };

        const skills: string[] = [];

        // Get from improvements
        if (rawData?.analysis?.improvements) {
          for (const improvement of rawData.analysis.improvements) {
            if (improvement.skill) skills.push(improvement.skill);
            if (improvement.category) skills.push(improvement.category);
          }
        }

        // Get from skill_gaps
        if (rawData?.analysis?.skill_gaps) {
          skills.push(...rawData.analysis.skill_gaps);
        }

        for (const skill of skills) {
          const normalizedSkill = this.normalizeSkill(skill);
          const existing = skillMentions.get(normalizedSkill) || { sources: [], dates: [] };
          existing.sources.push({
            type: 'interview',
            event_id: interview.id,
            timestamp: interview.created_at,
          });
          existing.dates.push(interview.created_at);
          skillMentions.set(normalizedSkill, existing);
        }
      }

      // Convert to clusters with threshold >= 3
      for (const [skill, data] of skillMentions.entries()) {
        if (data.sources.length >= 3) {
          const severity = this.calculateSeverity(data.sources.length);
          const sortedDates = data.dates.sort((a, b) => a.getTime() - b.getTime());

          const cluster: SkillGapCluster = {
            skill,
            occurrences: data.sources.length,
            sources: data.sources,
            severity,
            first_detected: sortedDates[0],
            last_detected: sortedDates[sortedDates.length - 1],
          };

          patterns.push({
            type: 'skill_gap_cluster',
            severity,
            description: `Skill "${skill}" mentioned in ${data.sources.length} rejections/interviews`,
            detected_at: new Date(),
            data: cluster,
            recommended_action: 'REPATH_ROADMAP',
          });
        }
      }
    } catch (error) {
      console.error('[PatternDetector] Error detecting skill gap clusters:', error);
    }

    return patterns;
  }

  /**
   * Detect interview performance trends
   */
  async detectInterviewTrends(): Promise<PatternMatch[]> {
    const patterns: PatternMatch[] = [];
    const cutoffDate = this.getCutoffDate();

    try {
      const interviewRecords = await db.query.interviews.findMany({
        where: and(
          eq(interviews.user_id, this.userId),
          eq(interviews.status, 'completed'),
          gte(interviews.created_at, cutoffDate)
        ),
        orderBy: [desc(interviews.created_at)],
        limit: 10,
      });

      if (interviewRecords.length < 3) {
        return patterns;
      }

      // Extract scores
      const dataPoints: Array<{ date: Date; value: number }> = [];
      for (const interview of interviewRecords) {
        const rawData = interview.raw_data as {
          analysis?: { overall_score?: number };
        };
        const score = rawData?.analysis?.overall_score;
        if (score !== undefined) {
          dataPoints.push({
            date: interview.created_at,
            value: score,
          });
        }
      }

      if (dataPoints.length < 3) {
        return patterns;
      }

      // Analyze trend using linear regression
      const trend = this.analyzeTrend(dataPoints);

      // Only report significant declining trends
      if (trend.direction === 'declining' && trend.significance === 'significant') {
        patterns.push({
          type: 'declining_trend',
          severity: Math.abs(trend.change_percentage) > 20 ? 'high' : 'medium',
          description: `Interview scores declining by ${Math.abs(trend.change_percentage).toFixed(1)}% over ${this.timeWindowDays} days`,
          detected_at: new Date(),
          data: trend,
          recommended_action: 'SUGGEST_PRACTICE',
        });
      }

      // Check for consecutive low scores
      const consecutiveLow = this.checkConsecutiveLowScores(dataPoints, 50);
      if (consecutiveLow >= 3) {
        patterns.push({
          type: 'declining_trend',
          severity: 'high',
          description: `${consecutiveLow} consecutive interviews with scores below 50`,
          detected_at: new Date(),
          data: { consecutive_low_scores: consecutiveLow },
          recommended_action: 'INTENSIVE_PRACTICE',
        });
      }
    } catch (error) {
      console.error('[PatternDetector] Error detecting interview trends:', error);
    }

    return patterns;
  }

  /**
   * Detect application submission trends
   */
  async detectApplicationTrends(): Promise<PatternMatch[]> {
    const patterns: PatternMatch[] = [];
    const cutoffDate = this.getCutoffDate();

    try {
      const applications = await db.query.jobApplications.findMany({
        where: and(
          eq(jobApplications.user_id, this.userId),
          gte(jobApplications.created_at, cutoffDate)
        ),
        orderBy: [desc(jobApplications.created_at)],
      });

      if (applications.length < 5) {
        return patterns;
      }

      // Calculate response rate
      const totalApps = applications.length;
      const responses = applications.filter(
        (a) => a.status !== 'applied' && a.status !== 'draft'
      ).length;
      const rejections = applications.filter((a) => a.status === 'rejected').length;

      const responseRate = (responses / totalApps) * 100;
      const rejectionRate = (rejections / totalApps) * 100;

      // High rejection rate pattern
      if (rejectionRate > 80 && rejections >= 5) {
        patterns.push({
          type: 'declining_trend',
          severity: 'high',
          description: `High rejection rate: ${rejectionRate.toFixed(1)}% (${rejections}/${totalApps} applications)`,
          detected_at: new Date(),
          data: {
            metric: 'rejection_rate',
            value: rejectionRate,
            total_applications: totalApps,
            rejections,
          },
          recommended_action: 'REVIEW_RESUME_AND_TARGETING',
        });
      }

      // Low response rate pattern
      if (responseRate < 10 && totalApps >= 10) {
        patterns.push({
          type: 'stall',
          severity: 'medium',
          description: `Low response rate: ${responseRate.toFixed(1)}% from ${totalApps} applications`,
          detected_at: new Date(),
          data: {
            metric: 'response_rate',
            value: responseRate,
            total_applications: totalApps,
          },
          recommended_action: 'IMPROVE_RESUME_OR_TARGETING',
        });
      }
    } catch (error) {
      console.error('[PatternDetector] Error detecting application trends:', error);
    }

    return patterns;
  }

  /**
   * Detect milestones achieved
   */
  async detectMilestones(): Promise<PatternMatch[]> {
    const patterns: PatternMatch[] = [];

    try {
      // Check skill verification milestones
      const verifiedSkillsResult = await db
        .select({ count: count() })
        .from(userSkills)
        .where(
          and(
            eq(userSkills.user_id, this.userId),
            sql`(verification_metadata->>'is_verified')::boolean = true`
          )
        );

      const verifiedCount = verifiedSkillsResult[0]?.count || 0;
      const skillMilestones = [5, 10, 25, 50, 100];

      for (const milestone of skillMilestones) {
        if (verifiedCount === milestone) {
          patterns.push({
            type: 'milestone',
            severity: 'low',
            description: `Verified ${milestone} skills!`,
            detected_at: new Date(),
            data: {
              type: 'skill_mastery',
              description: `Reached ${milestone} verified skills milestone`,
              achieved_at: new Date(),
              celebration_level: milestone >= 25 ? 'major' : 'minor',
              metadata: { verified_count: verifiedCount },
            } as MilestoneDetection,
            recommended_action: 'CELEBRATE',
          });
        }
      }

      // Check module completion milestones
      const completedModulesResult = await db
        .select({ count: count() })
        .from(roadmapModules)
        .innerJoin(roadmaps, eq(roadmapModules.roadmap_id, roadmaps.id))
        .where(
          and(
            eq(roadmaps.user_id, this.userId),
            eq(roadmapModules.status, 'completed')
          )
        );

      const completedModules = completedModulesResult[0]?.count || 0;
      const moduleMilestones = [3, 5, 10, 20, 50];

      for (const milestone of moduleMilestones) {
        if (completedModules === milestone) {
          patterns.push({
            type: 'milestone',
            severity: 'low',
            description: `Completed ${milestone} roadmap modules!`,
            detected_at: new Date(),
            data: {
              type: 'module_completion',
              description: `Completed ${milestone} modules in roadmap`,
              achieved_at: new Date(),
              celebration_level: milestone >= 10 ? 'major' : 'minor',
              metadata: { completed_count: completedModules },
            } as MilestoneDetection,
            recommended_action: 'CELEBRATE',
          });
        }
      }

      // Check for first interview completion
      const firstInterview = await db.query.interviews.findFirst({
        where: and(
          eq(interviews.user_id, this.userId),
          eq(interviews.status, 'completed')
        ),
        orderBy: [desc(interviews.created_at)],
      });

      const interviewCount = await db
        .select({ count: count() })
        .from(interviews)
        .where(
          and(
            eq(interviews.user_id, this.userId),
            eq(interviews.status, 'completed')
          )
        );

      if (interviewCount[0]?.count === 1 && firstInterview) {
        // Check if this happened recently (within last 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (firstInterview.created_at >= oneDayAgo) {
          patterns.push({
            type: 'milestone',
            severity: 'low',
            description: 'Completed first mock interview!',
            detected_at: new Date(),
            data: {
              type: 'first_interview',
              description: 'Successfully completed the first mock interview',
              achieved_at: firstInterview.created_at,
              celebration_level: 'major',
            } as MilestoneDetection,
            recommended_action: 'CELEBRATE',
          });
        }
      }
    } catch (error) {
      console.error('[PatternDetector] Error detecting milestones:', error);
    }

    return patterns;
  }

  /**
   * Detect velocity changes (application submission rate changes)
   */
  async detectVelocityChanges(): Promise<PatternMatch[]> {
    const patterns: PatternMatch[] = [];

    try {
      // Get last 2 weeks of applications
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [thisWeekResult, lastWeekResult] = await Promise.all([
        db
          .select({ count: count() })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.user_id, this.userId),
              gte(jobApplications.created_at, oneWeekAgo)
            )
          ),
        db
          .select({ count: count() })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.user_id, this.userId),
              gte(jobApplications.created_at, twoWeeksAgo),
              sql`${jobApplications.created_at} < ${oneWeekAgo}`
            )
          ),
      ]);

      const thisWeek = thisWeekResult[0]?.count || 0;
      const lastWeek = lastWeekResult[0]?.count || 0;

      if (lastWeek > 0) {
        const changePercent = ((thisWeek - lastWeek) / lastWeek) * 100;

        // Significant velocity drop
        if (changePercent < -50 && lastWeek >= 3) {
          patterns.push({
            type: 'velocity_drop',
            severity: 'medium',
            description: `Application velocity dropped ${Math.abs(changePercent).toFixed(0)}% week-over-week (${lastWeek} → ${thisWeek})`,
            detected_at: new Date(),
            data: {
              metric: 'application_velocity',
              this_week: thisWeek,
              last_week: lastWeek,
              change_percent: changePercent,
            },
            recommended_action: 'MOTIVATE_USER',
          });
        }

        // Complete stall
        if (thisWeek === 0 && lastWeek >= 5) {
          patterns.push({
            type: 'stall',
            severity: 'high',
            description: `No applications this week after ${lastWeek} last week`,
            detected_at: new Date(),
            data: {
              metric: 'application_stall',
              this_week: 0,
              last_week: lastWeek,
            },
            recommended_action: 'CHECK_IN_WITH_USER',
          });
        }
      }
    } catch (error) {
      console.error('[PatternDetector] Error detecting velocity changes:', error);
    }

    return patterns;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getCutoffDate(): Date {
    return new Date(Date.now() - this.timeWindowDays * 24 * 60 * 60 * 1000);
  }

  private extractSkillsFromText(text: string): string[] {
    // Common skill keywords to look for in rejection feedback
    const skillPatterns = [
      'system design',
      'distributed systems',
      'algorithms',
      'data structures',
      'sql',
      'database',
      'api design',
      'rest',
      'graphql',
      'cloud',
      'aws',
      'gcp',
      'azure',
      'kubernetes',
      'docker',
      'ci/cd',
      'testing',
      'tdd',
      'leadership',
      'communication',
      'teamwork',
      'problem solving',
      'python',
      'javascript',
      'typescript',
      'java',
      'go',
      'rust',
      'react',
      'node',
      'backend',
      'frontend',
      'full stack',
      'machine learning',
      'ml',
      'ai',
      'data science',
      'analytics',
    ];

    const textLower = text.toLowerCase();
    const found: string[] = [];

    for (const skill of skillPatterns) {
      if (textLower.includes(skill)) {
        found.push(this.normalizeSkill(skill));
      }
    }

    return found;
  }

  private normalizeSkill(skill: string): string {
    return skill
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');
  }

  private calculateSeverity(
    occurrences: number
  ): 'critical' | 'high' | 'medium' | 'low' {
    if (occurrences >= 7) return 'critical';
    if (occurrences >= 5) return 'high';
    if (occurrences >= 3) return 'medium';
    return 'low';
  }

  private analyzeTrend(
    dataPoints: Array<{ date: Date; value: number }>
  ): TrendAnalysis {
    if (dataPoints.length < 2) {
      return {
        metric: 'unknown',
        direction: 'stable',
        change_percentage: 0,
        data_points: dataPoints,
        significance: 'noise',
        period_days: this.timeWindowDays,
      };
    }

    // Sort by date ascending
    const sorted = [...dataPoints].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    // Simple linear regression
    const n = sorted.length;
    const xValues = sorted.map((_, i) => i);
    const yValues = sorted.map((p) => p.value);

    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((acc, x, i) => acc + x * yValues[i], 0);
    const sumXX = xValues.reduce((acc, x) => acc + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const meanY = sumY / n;
    const ssTotal = yValues.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0);
    const ssRes = yValues.reduce((acc, y, i) => {
      const predicted = intercept + slope * xValues[i];
      return acc + Math.pow(y - predicted, 2);
    }, 0);
    const rSquared = ssTotal > 0 ? 1 - ssRes / ssTotal : 0;

    // Calculate change percentage
    const firstValue = yValues[0];
    const lastValue = yValues[yValues.length - 1];
    const changePercent =
      firstValue !== 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;

    return {
      metric: 'interview_score',
      direction:
        slope > 0.5 ? 'improving' : slope < -0.5 ? 'declining' : 'stable',
      change_percentage: changePercent,
      data_points: sorted,
      significance:
        rSquared > 0.7 ? 'significant' : rSquared > 0.3 ? 'marginal' : 'noise',
      period_days: this.timeWindowDays,
    };
  }

  private checkConsecutiveLowScores(
    dataPoints: Array<{ date: Date; value: number }>,
    threshold: number
  ): number {
    // Sort by date descending (most recent first)
    const sorted = [...dataPoints].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    );

    let consecutive = 0;
    for (const point of sorted) {
      if (point.value < threshold) {
        consecutive++;
      } else {
        break;
      }
    }

    return consecutive;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createPatternDetector(
  userId: string,
  timeWindowDays: number = 30
): PatternDetector {
  return new PatternDetector(userId, timeWindowDays);
}
