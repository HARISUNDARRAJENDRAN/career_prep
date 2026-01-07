/**
 * Ghosting Detector
 *
 * Detects when job applications have been "ghosted" (no response after a reasonable time).
 * Uses time-based decay to determine ghosting probability and triggers strategic responses.
 */

import { db } from '@/drizzle/db';
import { jobApplications, users } from '@/drizzle/schema';
import { eq, and, lte, gte, sql, inArray } from 'drizzle-orm';
import { createGhostingResponseDirective } from './strategic-directives-service';

// ============================================================================
// Types
// ============================================================================

export interface GhostingAnalysis {
  userId: string;
  totalApplications: number;
  ghostedApplications: number;
  ghostingRate: number;
  averageDaysSinceApplication: number;
  ghostingByPlatform: Record<string, number>;
  recommendation: string;
  shouldCreateDirective: boolean;
}

export interface ApplicationGhostingScore {
  applicationId: string;
  jobTitle: string;
  company: string;
  appliedAt: Date;
  daysSinceApplication: number;
  ghostingProbability: number; // 0-1
  status: 'likely_ghosted' | 'possibly_ghosted' | 'still_active';
}

// ============================================================================
// Ghosting Detection Constants
// ============================================================================

const GHOSTING_THRESHOLDS = {
  // Days since application
  DEFINITELY_GHOSTED: 21, // 3 weeks
  LIKELY_GHOSTED: 14,     // 2 weeks
  POSSIBLY_GHOSTED: 7,    // 1 week

  // Ghosting probability thresholds
  HIGH_PROBABILITY: 0.8,
  MEDIUM_PROBABILITY: 0.5,
  LOW_PROBABILITY: 0.2,

  // Minimum applications to analyze
  MIN_APPLICATIONS: 5,

  // Ghosting rate thresholds (for creating directives)
  HIGH_GHOSTING_RATE: 0.6,   // 60%+
  MEDIUM_GHOSTING_RATE: 0.4, // 40%+
};

// ============================================================================
// Ghosting Probability Calculation
// ============================================================================

/**
 * Calculate ghosting probability based on time elapsed
 * Uses sigmoid-like decay function
 */
function calculateGhostingProbability(daysSinceApplication: number): number {
  if (daysSinceApplication >= GHOSTING_THRESHOLDS.DEFINITELY_GHOSTED) {
    return 0.95;
  }

  if (daysSinceApplication >= GHOSTING_THRESHOLDS.LIKELY_GHOSTED) {
    // Linear interpolation between 14 and 21 days
    const ratio =
      (daysSinceApplication - GHOSTING_THRESHOLDS.LIKELY_GHOSTED) /
      (GHOSTING_THRESHOLDS.DEFINITELY_GHOSTED - GHOSTING_THRESHOLDS.LIKELY_GHOSTED);
    return 0.7 + ratio * 0.25; // 0.7 to 0.95
  }

  if (daysSinceApplication >= GHOSTING_THRESHOLDS.POSSIBLY_GHOSTED) {
    // Linear interpolation between 7 and 14 days
    const ratio =
      (daysSinceApplication - GHOSTING_THRESHOLDS.POSSIBLY_GHOSTED) /
      (GHOSTING_THRESHOLDS.LIKELY_GHOSTED - GHOSTING_THRESHOLDS.POSSIBLY_GHOSTED);
    return 0.3 + ratio * 0.4; // 0.3 to 0.7
  }

  // Less than 7 days - low but increasing probability
  const ratio = daysSinceApplication / GHOSTING_THRESHOLDS.POSSIBLY_GHOSTED;
  return ratio * 0.3; // 0 to 0.3
}

/**
 * Classify ghosting status based on probability
 */
function classifyGhostingStatus(
  probability: number
): 'likely_ghosted' | 'possibly_ghosted' | 'still_active' {
  if (probability >= GHOSTING_THRESHOLDS.HIGH_PROBABILITY) {
    return 'likely_ghosted';
  }
  if (probability >= GHOSTING_THRESHOLDS.MEDIUM_PROBABILITY) {
    return 'possibly_ghosted';
  }
  return 'still_active';
}

// ============================================================================
// Core Detection Functions
// ============================================================================

/**
 * Analyze individual application for ghosting
 */
export async function analyzeApplicationGhosting(
  applicationId: string
): Promise<ApplicationGhostingScore | null> {
  const application = await db.query.jobApplications.findFirst({
    where: eq(jobApplications.id, applicationId),
    with: {
      jobListing: true,
    },
  });

  if (!application || !application.applied_at) {
    return null;
  }

  // Only analyze applications that are still "applied" (not rejected/offered/etc)
  if (application.status !== 'applied') {
    return null;
  }

  const now = new Date();
  const daysSinceApplication = Math.floor(
    (now.getTime() - application.applied_at.getTime()) / (1000 * 60 * 60 * 24)
  );

  const ghostingProbability = calculateGhostingProbability(daysSinceApplication);
  const status = classifyGhostingStatus(ghostingProbability);

  return {
    applicationId: application.id,
    jobTitle: application.jobListing?.title || application.role || 'Unknown',
    company: application.jobListing?.company || application.company || 'Unknown',
    appliedAt: application.applied_at,
    daysSinceApplication,
    ghostingProbability,
    status,
  };
}

/**
 * Analyze all applications for a user
 */
export async function analyzeUserGhosting(
  userId: string
): Promise<GhostingAnalysis> {
  // Get all "applied" applications (not rejected, offered, etc.)
  const applications = await db.query.jobApplications.findMany({
    where: and(
      eq(jobApplications.user_id, userId),
      eq(jobApplications.status, 'applied')
    ),
    with: {
      jobListing: true,
    },
  });

  const totalApplications = applications.length;

  if (totalApplications < GHOSTING_THRESHOLDS.MIN_APPLICATIONS) {
    return {
      userId,
      totalApplications,
      ghostedApplications: 0,
      ghostingRate: 0,
      averageDaysSinceApplication: 0,
      ghostingByPlatform: {},
      recommendation: 'Not enough data to analyze ghosting patterns',
      shouldCreateDirective: false,
    };
  }

  const now = new Date();
  let ghostedCount = 0;
  let totalDays = 0;
  const platformGhosting: Record<string, number> = {};

  for (const app of applications) {
    if (!app.applied_at) continue;

    const daysSince = Math.floor(
      (now.getTime() - app.applied_at.getTime()) / (1000 * 60 * 60 * 24)
    );
    totalDays += daysSince;

    const probability = calculateGhostingProbability(daysSince);

    if (probability >= GHOSTING_THRESHOLDS.HIGH_PROBABILITY) {
      ghostedCount++;

      // Track by platform
      const platform = app.jobListing?.raw_data?.source_metadata?.source as string || 'unknown';
      platformGhosting[platform] = (platformGhosting[platform] || 0) + 1;
    }
  }

  const ghostingRate = ghostedCount / totalApplications;
  const averageDaysSinceApplication = Math.floor(totalDays / totalApplications);

  // Generate recommendation
  let recommendation = '';
  let shouldCreateDirective = false;

  if (ghostingRate >= GHOSTING_THRESHOLDS.HIGH_GHOSTING_RATE) {
    recommendation = `HIGH ghosting rate detected (${Math.round(ghostingRate * 100)}%). Consider: 1) Following up on applications after 5-7 days, 2) Improving application quality/targeting, 3) Expanding to different job boards, 4) Revising resume/cover letter approach.`;
    shouldCreateDirective = true;
  } else if (ghostingRate >= GHOSTING_THRESHOLDS.MEDIUM_GHOSTING_RATE) {
    recommendation = `Moderate ghosting rate (${Math.round(ghostingRate * 100)}%). Consider following up on pending applications and reviewing your application strategy.`;
    shouldCreateDirective = true;
  } else {
    recommendation = `Ghosting rate within normal range (${Math.round(ghostingRate * 100)}%). Continue current strategy while monitoring response rates.`;
  }

  return {
    userId,
    totalApplications,
    ghostedApplications: ghostedCount,
    ghostingRate,
    averageDaysSinceApplication,
    ghostingByPlatform: platformGhosting,
    recommendation,
    shouldCreateDirective,
  };
}

/**
 * Auto-update application statuses to "ghosted" based on time decay
 */
export async function autoMarkGhostedApplications(
  userId: string,
  dryRun: boolean = false
): Promise<{ updated: number; applications: string[] }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - GHOSTING_THRESHOLDS.DEFINITELY_GHOSTED);

  const ghostedApplications = await db.query.jobApplications.findMany({
    where: and(
      eq(jobApplications.user_id, userId),
      eq(jobApplications.status, 'applied'),
      lte(jobApplications.applied_at, cutoffDate)
    ),
  });

  const applicationIds = ghostedApplications.map((app) => app.id);

  if (!dryRun && applicationIds.length > 0) {
    await db
      .update(jobApplications)
      .set({
        status: 'ghosted',
        last_activity_at: new Date(),
        raw_data: sql`raw_data || ${JSON.stringify({
          ghosted_reason: 'auto_detected',
          ghosted_at: new Date().toISOString(),
          days_since_application: GHOSTING_THRESHOLDS.DEFINITELY_GHOSTED,
        })}::jsonb`,
      })
      .where(inArray(jobApplications.id, applicationIds));
  }

  return {
    updated: applicationIds.length,
    applications: applicationIds,
  };
}

/**
 * Run full ghosting detection and create directive if needed
 */
export async function detectAndRespondToGhosting(
  userId: string,
  autoMarkAsGhosted: boolean = true
): Promise<{
  analysis: GhostingAnalysis;
  markedAsGhosted: number;
  directiveCreated: boolean;
  directiveId?: string;
}> {
  // Step 1: Analyze current ghosting patterns
  const analysis = await analyzeUserGhosting(userId);

  // Step 2: Auto-mark definitely ghosted applications
  let markedAsGhosted = 0;
  if (autoMarkAsGhosted) {
    const result = await autoMarkGhostedApplications(userId, false);
    markedAsGhosted = result.updated;
  }

  // Step 3: Create strategic directive if needed
  let directiveCreated = false;
  let directiveId: string | undefined;

  if (analysis.shouldCreateDirective) {
    const directive = await createGhostingResponseDirective(
      userId,
      analysis.ghostedApplications,
      analysis.averageDaysSinceApplication,
      analysis.recommendation
    );
    directiveCreated = true;
    directiveId = directive.id;
  }

  return {
    analysis,
    markedAsGhosted,
    directiveCreated,
    directiveId,
  };
}

/**
 * Get ghosting statistics for dashboard
 */
export async function getGhostingStats(userId: string): Promise<{
  total: number;
  ghosted: number;
  likelyGhosted: number;
  possiblyGhosted: number;
  stillActive: number;
  ghostingRate: number;
}> {
  const applications = await db.query.jobApplications.findMany({
    where: and(
      eq(jobApplications.user_id, userId),
      eq(jobApplications.status, 'applied')
    ),
  });

  let ghosted = 0;
  let likelyGhosted = 0;
  let possiblyGhosted = 0;
  let stillActive = 0;

  const now = new Date();

  for (const app of applications) {
    if (!app.applied_at) continue;

    const daysSince = Math.floor(
      (now.getTime() - app.applied_at.getTime()) / (1000 * 60 * 60 * 24)
    );

    const probability = calculateGhostingProbability(daysSince);
    const status = classifyGhostingStatus(probability);

    if (daysSince >= GHOSTING_THRESHOLDS.DEFINITELY_GHOSTED) {
      ghosted++;
    } else if (status === 'likely_ghosted') {
      likelyGhosted++;
    } else if (status === 'possibly_ghosted') {
      possiblyGhosted++;
    } else {
      stillActive++;
    }
  }

  const total = applications.length;
  const ghostingRate = total > 0 ? (ghosted + likelyGhosted) / total : 0;

  return {
    total,
    ghosted,
    likelyGhosted,
    possiblyGhosted,
    stillActive,
    ghostingRate,
  };
}
