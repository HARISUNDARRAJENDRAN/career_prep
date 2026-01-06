/**
 * Velocity Tracker
 *
 * Tracks career progression metrics and velocity over time.
 * Calculates trends, detects stalls, and generates velocity reports.
 *
 * @see docs/agentic-improvements/09-STRATEGIST_AGENT.md
 */

import { db } from '@/drizzle/db';
import {
  jobApplications,
  interviews,
  roadmapModules,
  roadmaps,
  userSkills,
} from '@/drizzle/schema';
import { eq, and, gte, sql, count, desc } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

/**
 * Velocity trend analysis
 */
export interface VelocityTrend {
  direction: 'accelerating' | 'stable' | 'decelerating' | 'stalled';
  change_percentage: number;
  significance: 'significant' | 'marginal' | 'noise';
}

/**
 * Period-based metrics
 */
export interface PeriodMetrics {
  period_start: Date;
  period_end: Date;
  applications_count: number;
  interviews_count: number;
  responses_received: number;
  rejections_count: number;
  offers_count: number;
  modules_completed: number;
  skills_verified: number;
  response_rate: number;
  pass_rate: number;
}

/**
 * Full velocity report
 */
export interface VelocityReport {
  user_id: string;
  generated_at: Date;
  period_days: number;

  // Current period metrics
  current_period: PeriodMetrics;

  // Previous period metrics (for comparison)
  previous_period: PeriodMetrics | null;

  // Trend analysis
  trends: {
    applications: VelocityTrend;
    interviews: VelocityTrend;
    progress: VelocityTrend;
  };

  // Summary
  overall_velocity: 'high' | 'medium' | 'low' | 'stalled';
  velocity_score: number; // 0-100

  // Recommendations based on velocity
  recommendations: string[];
}

// ============================================================================
// Velocity Tracker Class
// ============================================================================

export class VelocityTracker {
  private userId: string;
  private periodDays: number;

  constructor(userId: string, periodDays: number = 7) {
    this.userId = userId;
    this.periodDays = periodDays;
  }

  /**
   * Generate a full velocity report
   */
  async generateReport(): Promise<VelocityReport> {
    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(
      now.getTime() - this.periodDays * 24 * 60 * 60 * 1000
    );
    const previousPeriodEnd = periodStart;
    const previousPeriodStart = new Date(
      periodStart.getTime() - this.periodDays * 24 * 60 * 60 * 1000
    );

    // Collect metrics for both periods
    const [currentMetrics, previousMetrics] = await Promise.all([
      this.collectPeriodMetrics(periodStart, periodEnd),
      this.collectPeriodMetrics(previousPeriodStart, previousPeriodEnd),
    ]);

    // Calculate trends
    const trends = this.calculateTrends(currentMetrics, previousMetrics);

    // Calculate overall velocity
    const velocityScore = this.calculateVelocityScore(currentMetrics, trends);
    const overallVelocity = this.categorizeVelocity(velocityScore);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      currentMetrics,
      previousMetrics,
      trends
    );

    return {
      user_id: this.userId,
      generated_at: now,
      period_days: this.periodDays,
      current_period: currentMetrics,
      previous_period: previousMetrics,
      trends,
      overall_velocity: overallVelocity,
      velocity_score: velocityScore,
      recommendations,
    };
  }

  /**
   * Get quick velocity score without full report
   */
  async getVelocityScore(): Promise<number> {
    const now = new Date();
    const periodStart = new Date(
      now.getTime() - this.periodDays * 24 * 60 * 60 * 1000
    );
    const previousPeriodStart = new Date(
      periodStart.getTime() - this.periodDays * 24 * 60 * 60 * 1000
    );

    const [currentMetrics, previousMetrics] = await Promise.all([
      this.collectPeriodMetrics(periodStart, now),
      this.collectPeriodMetrics(previousPeriodStart, periodStart),
    ]);

    const trends = this.calculateTrends(currentMetrics, previousMetrics);
    return this.calculateVelocityScore(currentMetrics, trends);
  }

  /**
   * Check if user is stalled
   */
  async isStalled(): Promise<{
    stalled: boolean;
    reason?: string;
    days_inactive?: number;
  }> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Check for any recent activity
    const [appCount, interviewCount, moduleCount] = await Promise.all([
      db
        .select({ count: count() })
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.user_id, this.userId),
            gte(jobApplications.created_at, sevenDaysAgo)
          )
        ),
      db
        .select({ count: count() })
        .from(interviews)
        .where(
          and(
            eq(interviews.user_id, this.userId),
            gte(interviews.created_at, sevenDaysAgo)
          )
        ),
      db
        .select({ count: count() })
        .from(roadmapModules)
        .innerJoin(roadmaps, eq(roadmapModules.roadmap_id, roadmaps.id))
        .where(
          and(
            eq(roadmaps.user_id, this.userId),
            eq(roadmapModules.status, 'completed'),
            gte(roadmapModules.updated_at, sevenDaysAgo)
          )
        ),
    ]);

    const apps = appCount[0]?.count || 0;
    const interviewsCompleted = interviewCount[0]?.count || 0;
    const modules = moduleCount[0]?.count || 0;

    const totalActivity = apps + interviewsCompleted + modules;

    if (totalActivity === 0) {
      // Find last activity date
      const lastApp = await db.query.jobApplications.findFirst({
        where: eq(jobApplications.user_id, this.userId),
        orderBy: [desc(jobApplications.created_at)],
      });

      const lastInterview = await db.query.interviews.findFirst({
        where: eq(interviews.user_id, this.userId),
        orderBy: [desc(interviews.created_at)],
      });

      const lastActivity = [lastApp?.created_at, lastInterview?.created_at]
        .filter(Boolean)
        .sort((a, b) => b!.getTime() - a!.getTime())[0];

      const daysInactive = lastActivity
        ? Math.floor(
            (Date.now() - lastActivity.getTime()) / (24 * 60 * 60 * 1000)
          )
        : 999;

      return {
        stalled: true,
        reason: 'No activity in the last 7 days',
        days_inactive: daysInactive,
      };
    }

    return { stalled: false };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async collectPeriodMetrics(
    start: Date,
    end: Date
  ): Promise<PeriodMetrics> {
    const [
      applicationsResult,
      interviewsResult,
      responsesResult,
      rejectionsResult,
      offersResult,
      modulesResult,
      skillsResult,
    ] = await Promise.all([
      // Total applications
      db
        .select({ count: count() })
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.user_id, this.userId),
            gte(jobApplications.created_at, start),
            sql`${jobApplications.created_at} < ${end}`
          )
        ),
      // Total interviews
      db
        .select({ count: count() })
        .from(interviews)
        .where(
          and(
            eq(interviews.user_id, this.userId),
            gte(interviews.created_at, start),
            sql`${interviews.created_at} < ${end}`
          )
        ),
      // Responses received (any non-pending status)
      db
        .select({ count: count() })
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.user_id, this.userId),
            gte(jobApplications.created_at, start),
            sql`${jobApplications.created_at} < ${end}`,
            sql`${jobApplications.status} NOT IN ('applied', 'pending')`
          )
        ),
      // Rejections
      db
        .select({ count: count() })
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.user_id, this.userId),
            eq(jobApplications.status, 'rejected'),
            gte(jobApplications.created_at, start),
            sql`${jobApplications.created_at} < ${end}`
          )
        ),
      // Offers
      db
        .select({ count: count() })
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.user_id, this.userId),
            eq(jobApplications.status, 'offered'),
            gte(jobApplications.created_at, start),
            sql`${jobApplications.created_at} < ${end}`
          )
        ),
      // Completed modules
      db
        .select({ count: count() })
        .from(roadmapModules)
        .innerJoin(roadmaps, eq(roadmapModules.roadmap_id, roadmaps.id))
        .where(
          and(
            eq(roadmaps.user_id, this.userId),
            eq(roadmapModules.status, 'completed'),
            gte(roadmapModules.updated_at, start),
            sql`${roadmapModules.updated_at} < ${end}`
          )
        ),
      // Verified skills
      db
        .select({ count: count() })
        .from(userSkills)
        .where(
          and(
            eq(userSkills.user_id, this.userId),
            sql`(verification_metadata->>'is_verified')::boolean = true`,
            gte(userSkills.updated_at, start),
            sql`${userSkills.updated_at} < ${end}`
          )
        ),
    ]);

    const applications = applicationsResult[0]?.count || 0;
    const interviewsDone = interviewsResult[0]?.count || 0;
    const responses = responsesResult[0]?.count || 0;
    const rejections = rejectionsResult[0]?.count || 0;
    const offers = offersResult[0]?.count || 0;
    const modules = modulesResult[0]?.count || 0;
    const skills = skillsResult[0]?.count || 0;

    return {
      period_start: start,
      period_end: end,
      applications_count: applications,
      interviews_count: interviewsDone,
      responses_received: responses,
      rejections_count: rejections,
      offers_count: offers,
      modules_completed: modules,
      skills_verified: skills,
      response_rate: applications > 0 ? (responses / applications) * 100 : 0,
      pass_rate:
        interviewsDone > 0
          ? ((interviewsDone - rejections) / interviewsDone) * 100
          : 0,
    };
  }

  private calculateTrends(
    current: PeriodMetrics,
    previous: PeriodMetrics | null
  ): VelocityReport['trends'] {
    if (!previous) {
      return {
        applications: { direction: 'stable', change_percentage: 0, significance: 'noise' },
        interviews: { direction: 'stable', change_percentage: 0, significance: 'noise' },
        progress: { direction: 'stable', change_percentage: 0, significance: 'noise' },
      };
    }

    return {
      applications: this.calculateTrend(
        current.applications_count,
        previous.applications_count
      ),
      interviews: this.calculateTrend(
        current.interviews_count,
        previous.interviews_count
      ),
      progress: this.calculateTrend(
        current.modules_completed + current.skills_verified,
        previous.modules_completed + previous.skills_verified
      ),
    };
  }

  private calculateTrend(
    current: number,
    previous: number
  ): VelocityTrend {
    if (previous === 0 && current === 0) {
      return { direction: 'stalled', change_percentage: 0, significance: 'noise' };
    }

    if (previous === 0) {
      return {
        direction: 'accelerating',
        change_percentage: 100,
        significance: current >= 3 ? 'significant' : 'marginal',
      };
    }

    const changePercent = ((current - previous) / previous) * 100;

    let direction: VelocityTrend['direction'];
    if (changePercent > 20) {
      direction = 'accelerating';
    } else if (changePercent < -20) {
      direction = 'decelerating';
    } else if (current === 0) {
      direction = 'stalled';
    } else {
      direction = 'stable';
    }

    let significance: VelocityTrend['significance'];
    if (Math.abs(changePercent) > 50 || Math.abs(current - previous) >= 5) {
      significance = 'significant';
    } else if (Math.abs(changePercent) > 20) {
      significance = 'marginal';
    } else {
      significance = 'noise';
    }

    return { direction, change_percentage: changePercent, significance };
  }

  private calculateVelocityScore(
    metrics: PeriodMetrics,
    trends: VelocityReport['trends']
  ): number {
    let score = 50; // Base score

    // Activity points (up to 30 points)
    const activityScore = Math.min(
      30,
      metrics.applications_count * 2 +
        metrics.interviews_count * 5 +
        metrics.modules_completed * 3 +
        metrics.skills_verified * 4
    );
    score += activityScore;

    // Success points (up to 20 points)
    const successScore =
      metrics.response_rate * 0.1 + // Up to 10 points for 100% response rate
      metrics.offers_count * 10; // 10 points per offer
    score += Math.min(20, successScore);

    // Trend adjustments (-10 to +10)
    let trendBonus = 0;
    if (trends.applications.direction === 'accelerating') trendBonus += 3;
    if (trends.applications.direction === 'decelerating') trendBonus -= 3;
    if (trends.interviews.direction === 'accelerating') trendBonus += 4;
    if (trends.interviews.direction === 'decelerating') trendBonus -= 4;
    if (trends.progress.direction === 'accelerating') trendBonus += 3;
    if (trends.progress.direction === 'decelerating') trendBonus -= 3;
    score += trendBonus;

    return Math.max(0, Math.min(100, score));
  }

  private categorizeVelocity(
    score: number
  ): 'high' | 'medium' | 'low' | 'stalled' {
    if (score >= 75) return 'high';
    if (score >= 50) return 'medium';
    if (score >= 25) return 'low';
    return 'stalled';
  }

  private generateRecommendations(
    current: PeriodMetrics,
    previous: PeriodMetrics | null,
    trends: VelocityReport['trends']
  ): string[] {
    const recommendations: string[] = [];

    // Application velocity
    if (current.applications_count < 5 && this.periodDays === 7) {
      recommendations.push(
        'Increase application volume - aim for at least 10 applications per week for best results'
      );
    }

    // Response rate
    if (current.response_rate < 10 && current.applications_count >= 10) {
      recommendations.push(
        'Low response rate detected - consider improving resume or adjusting target roles'
      );
    }

    // Interview practice
    if (current.interviews_count < 1 && this.periodDays >= 7) {
      recommendations.push(
        'Schedule mock interviews to stay sharp and build confidence'
      );
    }

    // Learning progress
    if (current.modules_completed === 0 && this.periodDays >= 7) {
      recommendations.push(
        'Continue progressing on your learning roadmap - complete at least one module this week'
      );
    }

    // Declining trends
    if (trends.applications.direction === 'decelerating') {
      recommendations.push(
        'Application momentum is slowing - set daily goals to maintain consistency'
      );
    }

    if (trends.progress.direction === 'stalled') {
      recommendations.push(
        'Learning progress has stalled - dedicate focused time to skill development'
      );
    }

    // Success celebration
    if (current.offers_count > 0) {
      recommendations.push(
        'Congratulations on receiving offer(s)! Continue momentum with other applications'
      );
    }

    return recommendations.slice(0, 5); // Max 5 recommendations
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createVelocityTracker(
  userId: string,
  periodDays: number = 7
): VelocityTracker {
  return new VelocityTracker(userId, periodDays);
}
