/**
 * Ghosting Detector Service
 *
 * Implements time-based decay of "application hope" to detect when
 * applications have likely been ghosted by employers.
 *
 * Key Concepts:
 * - "Hope Score": Probability (0-100) that an application will progress
 * - Time-based decay: Hope decreases over time without updates
 * - Platform-aware: Different platforms have different response timelines
 * - Industry-aware: Tech vs Finance vs Healthcare have different patterns
 *
 * Thresholds (based on industry data):
 * - Days 0-7: Hope ~90% (normal response window)
 * - Days 8-14: Hope ~70% (extended response window)
 * - Days 15-21: Hope ~40% (likely ghosted)
 * - Days 22-30: Hope ~20% (probably ghosted)
 * - Days 31+: Hope ~5% (definitely ghosted)
 */

import { db } from '@/drizzle/db';
import { jobApplications, jobListings } from '@/drizzle/schema';
import { eq, and, lt, gte, sql, isNull, or, inArray } from 'drizzle-orm';
import { issueGhostingResponseDirective } from '@/services/strategic-directives';
import { publishAgentEvent } from '@/lib/agents/message-bus';
import { createNotification } from '@/services/notifications';

// Types
export interface GhostedApplication {
  id: string;
  user_id: string;
  company: string;
  role: string;
  applied_at: Date;
  days_since_applied: number;
  hope_score: number;
  status: string;
  last_activity?: Date;
  platform?: string;
}

export interface GhostingReport {
  user_id: string;
  total_active_applications: number;
  ghosted_applications: GhostedApplication[];
  at_risk_applications: GhostedApplication[];
  healthy_applications: GhostedApplication[];
  average_hope_score: number;
  recommendations: string[];
  generated_at: Date;
}

export interface HopeDecayConfig {
  // Base decay rate per day (percentage points)
  base_decay_rate: number;
  // Minimum hope score (never goes below this)
  min_hope_score: number;
  // Days after which to consider definitely ghosted
  ghosted_threshold_days: number;
  // Days after which to consider at risk
  at_risk_threshold_days: number;
}

const DEFAULT_CONFIG: HopeDecayConfig = {
  base_decay_rate: 5, // 5% per day after grace period
  min_hope_score: 5,
  ghosted_threshold_days: 21,
  at_risk_threshold_days: 10,
};

// Platform-specific response time expectations (in days)
const PLATFORM_RESPONSE_TIMES: Record<string, { expected: number; max: number }> = {
  linkedin: { expected: 5, max: 14 },
  indeed: { expected: 7, max: 21 },
  glassdoor: { expected: 7, max: 21 },
  company_site: { expected: 10, max: 30 },
  referral: { expected: 3, max: 10 },
  default: { expected: 7, max: 21 },
};

// Status progression likelihood
const STATUS_HOPE_MODIFIERS: Record<string, number> = {
  draft: 100, // Not yet applied
  applied: 90, // Just applied
  interviewing: 95, // Actively engaged
  offered: 99, // Almost there
  rejected: 0, // Done
  ghosted: 0, // Done
};

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Calculate the "hope score" for an application
 * Higher score = more likely to hear back
 */
export function calculateHopeScore(
  applied_at: Date,
  status: string,
  last_activity?: Date,
  platform?: string,
  config: HopeDecayConfig = DEFAULT_CONFIG
): number {
  // Already resolved statuses
  if (status === 'rejected' || status === 'ghosted') return 0;
  if (status === 'offered') return 99;
  if (status === 'interviewing') return 95;
  if (status === 'draft') return 100;

  const now = new Date();
  const referenceDate = last_activity || applied_at;
  const daysSinceReference = Math.floor(
    (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Get platform-specific timing
  const platformTiming = PLATFORM_RESPONSE_TIMES[platform || 'default'] || PLATFORM_RESPONSE_TIMES.default;

  // Grace period (no decay during expected response time)
  if (daysSinceReference <= platformTiming.expected) {
    return 90;
  }

  // Extended window (slower decay)
  if (daysSinceReference <= platformTiming.max) {
    const daysOverExpected = daysSinceReference - platformTiming.expected;
    const decayDuringExtended = daysOverExpected * (config.base_decay_rate * 0.5);
    return Math.max(90 - decayDuringExtended, 50);
  }

  // Beyond max window (faster decay)
  const daysOverMax = daysSinceReference - platformTiming.max;
  const baseScore = 50;
  const decay = daysOverMax * config.base_decay_rate;
  return Math.max(baseScore - decay, config.min_hope_score);
}

/**
 * Detect ghosted applications for a user
 */
export async function detectGhostedApplications(
  user_id: string,
  config: HopeDecayConfig = DEFAULT_CONFIG
): Promise<GhostedApplication[]> {
  // Get all active applications (not rejected, ghosted, or offered)
  const applications = await db
    .select({
      id: jobApplications.id,
      user_id: jobApplications.user_id,
      company: jobApplications.company,
      role: jobApplications.role,
      status: jobApplications.status,
      created_at: jobApplications.created_at,
      updated_at: jobApplications.updated_at,
      raw_data: jobApplications.raw_data,
    })
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.user_id, user_id),
        eq(jobApplications.status, 'applied')
      )
    );

  const ghosted: GhostedApplication[] = [];

  for (const app of applications) {
    const daysSinceApplied = Math.floor(
      (Date.now() - new Date(app.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Extract platform from raw_data if available
    const platform = (app.raw_data as Record<string, unknown>)?.source as string | undefined;

    const hopeScore = calculateHopeScore(
      new Date(app.created_at),
      app.status,
      app.updated_at ? new Date(app.updated_at) : undefined,
      platform,
      config
    );

    if (daysSinceApplied >= config.ghosted_threshold_days || hopeScore <= 20) {
      ghosted.push({
        id: app.id,
        user_id: app.user_id,
        company: app.company,
        role: app.role,
        applied_at: new Date(app.created_at),
        days_since_applied: daysSinceApplied,
        hope_score: hopeScore,
        status: app.status,
        last_activity: app.updated_at ? new Date(app.updated_at) : undefined,
        platform,
      });
    }
  }

  return ghosted;
}

/**
 * Generate a full ghosting report for a user
 */
export async function generateGhostingReport(
  user_id: string,
  config: HopeDecayConfig = DEFAULT_CONFIG
): Promise<GhostingReport> {
  // Get all active applications
  const applications = await db
    .select({
      id: jobApplications.id,
      user_id: jobApplications.user_id,
      company: jobApplications.company,
      role: jobApplications.role,
      status: jobApplications.status,
      created_at: jobApplications.created_at,
      updated_at: jobApplications.updated_at,
      raw_data: jobApplications.raw_data,
    })
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.user_id, user_id),
        inArray(jobApplications.status, ['applied', 'interviewing'])
      )
    );

  const ghosted: GhostedApplication[] = [];
  const atRisk: GhostedApplication[] = [];
  const healthy: GhostedApplication[] = [];
  let totalHope = 0;

  for (const app of applications) {
    const daysSinceApplied = Math.floor(
      (Date.now() - new Date(app.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    const platform = (app.raw_data as Record<string, unknown>)?.source as string | undefined;

    const hopeScore = calculateHopeScore(
      new Date(app.created_at),
      app.status,
      app.updated_at ? new Date(app.updated_at) : undefined,
      platform,
      config
    );

    totalHope += hopeScore;

    const appData: GhostedApplication = {
      id: app.id,
      user_id: app.user_id,
      company: app.company,
      role: app.role,
      applied_at: new Date(app.created_at),
      days_since_applied: daysSinceApplied,
      hope_score: hopeScore,
      status: app.status,
      last_activity: app.updated_at ? new Date(app.updated_at) : undefined,
      platform,
    };

    if (hopeScore <= 20 || daysSinceApplied >= config.ghosted_threshold_days) {
      ghosted.push(appData);
    } else if (hopeScore <= 50 || daysSinceApplied >= config.at_risk_threshold_days) {
      atRisk.push(appData);
    } else {
      healthy.push(appData);
    }
  }

  // Generate recommendations
  const recommendations = generateRecommendations(ghosted, atRisk, healthy);

  return {
    user_id,
    total_active_applications: applications.length,
    ghosted_applications: ghosted,
    at_risk_applications: atRisk,
    healthy_applications: healthy,
    average_hope_score: applications.length > 0 ? totalHope / applications.length : 0,
    recommendations,
    generated_at: new Date(),
  };
}

/**
 * Generate recommendations based on ghosting analysis
 */
function generateRecommendations(
  ghosted: GhostedApplication[],
  atRisk: GhostedApplication[],
  healthy: GhostedApplication[]
): string[] {
  const recommendations: string[] = [];

  if (ghosted.length > 0) {
    recommendations.push(
      `Mark ${ghosted.length} application(s) as ghosted and close them out to focus on active opportunities.`
    );

    // Check for company patterns
    const companies = ghosted.map((a) => a.company);
    const uniqueCompanies = [...new Set(companies)];
    if (uniqueCompanies.length < ghosted.length) {
      recommendations.push(
        'Notice: Multiple applications to the same company without response. Consider researching company hiring patterns before reapplying.'
      );
    }
  }

  if (atRisk.length > 3) {
    recommendations.push(
      `${atRisk.length} applications are at risk of ghosting. Consider sending follow-up emails or LinkedIn messages.`
    );
  }

  if (ghosted.length > healthy.length && healthy.length > 0) {
    recommendations.push(
      'High ghosting rate detected. Consider reviewing your resume targeting and application quality.'
    );
  }

  if (ghosted.length >= 5) {
    recommendations.push(
      'Significant ghosting pattern. Analyze if there are common factors (company size, role type, application method).'
    );
  }

  // Platform-specific recommendations
  const ghostedByPlatform = ghosted.reduce((acc, app) => {
    const platform = app.platform || 'unknown';
    acc[platform] = (acc[platform] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const maxGhostedPlatform = Object.entries(ghostedByPlatform).sort((a, b) => b[1] - a[1])[0];
  if (maxGhostedPlatform && maxGhostedPlatform[1] >= 3) {
    recommendations.push(
      `Most ghosting occurs on ${maxGhostedPlatform[0]} (${maxGhostedPlatform[1]} applications). Consider diversifying application channels.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Your application pipeline looks healthy! Keep up the momentum.');
  }

  return recommendations;
}

/**
 * Mark applications as ghosted and update their status
 */
export async function markApplicationsAsGhosted(
  application_ids: string[]
): Promise<{ updated: number }> {
  if (application_ids.length === 0) return { updated: 0 };

  const result = await db
    .update(jobApplications)
    .set({
      status: 'ghosted',
      updated_at: new Date(),
    })
    .where(inArray(jobApplications.id, application_ids));

  return { updated: application_ids.length };
}

/**
 * Run ghosting detection for a user and optionally issue directives
 */
export async function runGhostingDetection(
  user_id: string,
  options?: {
    auto_mark_ghosted?: boolean;
    issue_directive?: boolean;
    notify_user?: boolean;
  }
): Promise<GhostingReport> {
  const { auto_mark_ghosted = false, issue_directive = true, notify_user = true } = options || {};

  const report = await generateGhostingReport(user_id);

  // Auto-mark very old applications as ghosted
  if (auto_mark_ghosted && report.ghosted_applications.length > 0) {
    const veryOldApps = report.ghosted_applications
      .filter((a) => a.days_since_applied >= 30)
      .map((a) => a.id);

    if (veryOldApps.length > 0) {
      await markApplicationsAsGhosted(veryOldApps);
      console.log(`[GhostingDetector] Auto-marked ${veryOldApps.length} applications as ghosted`);
    }
  }

  // Issue strategic directive if significant ghosting detected
  if (issue_directive && report.ghosted_applications.length >= 3) {
    await issueGhostingResponseDirective(user_id, {
      ghosted_applications: report.ghosted_applications.map((a) => ({
        company: a.company,
        role: a.role,
        days_since_applied: a.days_since_applied,
      })),
      recommended_actions: report.recommendations,
    });
  }

  // Notify user
  if (notify_user && report.ghosted_applications.length > 0) {
    await createNotification({
      user_id,
      type: 'system',
      priority: 'normal',
      title: `${report.ghosted_applications.length} Application(s) May Be Ghosted`,
      message: `We've detected ${report.ghosted_applications.length} application(s) that haven't received responses in a while. Consider following up or moving on.`,
      action_url: '/jobs/applications?filter=ghosted',
      action_label: 'Review Applications',
      metadata: {
        ghosted_count: report.ghosted_applications.length,
        at_risk_count: report.at_risk_applications.length,
        average_hope_score: report.average_hope_score,
      },
    });
  }

  // Publish event
  await publishAgentEvent({
    type: 'GHOSTING_DETECTED',
    payload: {
      user_id,
      ghosted_count: report.ghosted_applications.length,
      ghosting_rate: report.average_hope_score < 50 ?
        report.ghosted_applications.length / Math.max(report.ghosted_applications.length + report.at_risk_applications.length, 1) : 0,
    },
  });

  return report;
}

/**
 * Get hope scores for all user applications (for UI display)
 */
export async function getApplicationHopeScores(
  user_id: string
): Promise<Array<{ application_id: string; hope_score: number; status: string }>> {
  const applications = await db
    .select({
      id: jobApplications.id,
      status: jobApplications.status,
      created_at: jobApplications.created_at,
      updated_at: jobApplications.updated_at,
      raw_data: jobApplications.raw_data,
    })
    .from(jobApplications)
    .where(eq(jobApplications.user_id, user_id));

  return applications.map((app) => {
    const platform = (app.raw_data as Record<string, unknown>)?.source as string | undefined;

    return {
      application_id: app.id,
      hope_score: calculateHopeScore(
        new Date(app.created_at),
        app.status,
        app.updated_at ? new Date(app.updated_at) : undefined,
        platform
      ),
      status: app.status,
    };
  });
}
