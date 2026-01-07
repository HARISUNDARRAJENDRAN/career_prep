/**
 * Weekly Career Sprint Job
 *
 * The orchestrator that runs the full autonomous agent workflow:
 * Strategist -> Resume -> Action -> Report
 *
 * Schedule: Every Monday at 6 AM UTC
 *
 * Workflow:
 * 1. Strategist analyzes career health and issues directives
 * 2. Resume Agent tailors resume based on directives and market data
 * 3. Action Agent applies to matching jobs with tailored resume
 * 4. Generate weekly report for user
 *
 * This is the "hands-free" career management workflow.
 */

import { task, schedules } from '@trigger.dev/sdk';
import { db } from '@/drizzle/db';
import {
  users,
  userProfiles,
  jobApplications,
  strategicDirectives,
  jobListings,
} from '@/drizzle/schema';
import { eq, desc, and, gte, count, inArray, or, isNull } from 'drizzle-orm';
import { publishAgentEvent } from '@/lib/agents/message-bus';
import { createNotification } from '@/services/notifications';
import { runGhostingDetection } from '@/services/ghosting-detector';
import { runRejectionAnalysis } from '@/services/rejection-insights';
import {
  getActiveDirectives,
  issueDirective,
} from '@/services/strategic-directives';
import {
  broadcastSprintProgress,
  broadcastSprintComplete,
  broadcastDirectiveIssued,
  broadcastAgentStatus,
} from '@/services/realtime';

// Types
interface SprintResult {
  user_id: string;
  started_at: Date;
  completed_at: Date;
  duration_ms: number;
  
  // Phase results
  strategist_phase: {
    success: boolean;
    directives_issued: number;
    health_score?: number;
    patterns_detected?: number;
  };
  
  resume_phase: {
    success: boolean;
    resume_updated: boolean;
    tailoring_applied?: string[];
  };
  
  action_phase: {
    success: boolean;
    jobs_matched: number;
    applications_created: number;
    applications_skipped: number;
  };
  
  // Summary
  summary: string;
  next_sprint_focus?: string[];
}

interface UserSprintConfig {
  user_id: string;
  enabled: boolean;
  max_applications_per_sprint: number;
  min_match_score: number;
  auto_apply: boolean;
  preferred_days: string[];
  target_roles: string[];
}

// Default sprint configuration
const DEFAULT_SPRINT_CONFIG: Omit<UserSprintConfig, 'user_id'> = {
  enabled: true,
  max_applications_per_sprint: 10,
  min_match_score: 70,
  auto_apply: false, // Default to draft mode for safety
  preferred_days: ['monday'],
  target_roles: [],
};

// =============================================================================
// Scheduled Jobs
// =============================================================================

/**
 * Weekly Career Sprint - Main orchestrator
 * Runs every Monday at 6 AM UTC
 */
export const weeklyCareerSprint = schedules.task({
  id: 'strategist.weekly-career-sprint',
  cron: '0 6 * * 1', // Monday 6 AM UTC
  run: async (payload) => {
    console.log('[Weekly Sprint] Starting career sprint at:', payload.timestamp);

    try {
      // Get all users with sprint enabled
      const activeUsers = await getSprintEnabledUsers();
      console.log(`[Weekly Sprint] Processing ${activeUsers.length} users`);

      const results: SprintResult[] = [];

      for (const userId of activeUsers) {
        try {
          const result = await runUserSprint(userId);
          results.push(result);
        } catch (error) {
          console.error(`[Weekly Sprint] Error processing user ${userId}:`, error);
          results.push({
            user_id: userId,
            started_at: new Date(),
            completed_at: new Date(),
            duration_ms: 0,
            strategist_phase: { success: false, directives_issued: 0 },
            resume_phase: { success: false, resume_updated: false },
            action_phase: { success: false, jobs_matched: 0, applications_created: 0, applications_skipped: 0 },
            summary: `Sprint failed: ${(error as Error).message}`,
          });
        }
      }

      // Aggregate results
      const successful = results.filter((r) => r.action_phase.success);
      const totalApplications = results.reduce((sum, r) => sum + r.action_phase.applications_created, 0);

      console.log('[Weekly Sprint] Completed');
      console.log(`  Users processed: ${results.length}`);
      console.log(`  Successful: ${successful.length}`);
      console.log(`  Total applications: ${totalApplications}`);

      return {
        success: true,
        users_processed: results.length,
        users_successful: successful.length,
        total_applications: totalApplications,
        results,
      };
    } catch (error) {
      console.error('[Weekly Sprint] Fatal error:', error);
      throw error;
    }
  },
});

/**
 * Run sprint for a single user (can be triggered manually)
 */
export const runUserSprintTask = task({
  id: 'strategist.run-user-sprint',
  maxDuration: 300, // 5 minutes
  run: async (payload: { user_id: string }) => {
    return runUserSprint(payload.user_id);
  },
});

/**
 * Daily ghosting check
 * Runs every day at 9 AM UTC
 */
export const dailyGhostingCheck = schedules.task({
  id: 'strategist.daily-ghosting-check',
  cron: '0 9 * * *', // 9 AM UTC daily
  run: async (payload) => {
    console.log('[Ghosting Check] Starting at:', payload.timestamp);

    const activeUsers = await getActiveUserIds(30);
    let totalGhosted = 0;

    for (const userId of activeUsers) {
      try {
        const report = await runGhostingDetection(userId, {
          auto_mark_ghosted: true,
          issue_directive: true,
          notify_user: true,
        });
        totalGhosted += report.ghosted_applications.length;
      } catch (error) {
        console.error(`[Ghosting Check] Error for user ${userId}:`, error);
      }
    }

    return {
      success: true,
      users_checked: activeUsers.length,
      total_ghosted_detected: totalGhosted,
    };
  },
});

/**
 * Weekly rejection analysis
 * Runs every Sunday at 8 PM UTC (before Monday sprint)
 */
export const weeklyRejectionAnalysis = schedules.task({
  id: 'strategist.weekly-rejection-analysis',
  cron: '0 20 * * 0', // Sunday 8 PM UTC
  run: async (payload) => {
    console.log('[Rejection Analysis] Starting at:', payload.timestamp);

    const activeUsers = await getActiveUserIds(30);
    const reports = [];

    for (const userId of activeUsers) {
      try {
        const report = await runRejectionAnalysis(userId, {
          period_days: 30,
          issue_directive: true,
        });
        reports.push({
          user_id: userId,
          rejections: report.total_rejections,
          patterns: report.patterns.length,
          skill_gaps: report.top_skill_gaps.length,
        });
      } catch (error) {
        console.error(`[Rejection Analysis] Error for user ${userId}:`, error);
      }
    }

    return {
      success: true,
      users_analyzed: reports.length,
      reports,
    };
  },
});

// =============================================================================
// Core Sprint Logic
// =============================================================================

/**
 * Run the full sprint workflow for a single user
 */
async function runUserSprint(user_id: string): Promise<SprintResult> {
  const startTime = Date.now();
  console.log(`[Sprint] Starting sprint for user ${user_id}`);

  // Broadcast sprint started
  broadcastSprintProgress(user_id, 'Initialization', 0, 'Starting weekly career sprint');
  broadcastAgentStatus(user_id, 'strategist', 'running', 'Weekly sprint initiated');

  const result: SprintResult = {
    user_id,
    started_at: new Date(),
    completed_at: new Date(),
    duration_ms: 0,
    strategist_phase: { success: false, directives_issued: 0 },
    resume_phase: { success: false, resume_updated: false },
    action_phase: { success: false, jobs_matched: 0, applications_created: 0, applications_skipped: 0 },
    summary: '',
  };

  try {
    // =========================================================================
    // Phase 1: Strategist Analysis
    // =========================================================================
    console.log(`[Sprint] Phase 1: Strategist Analysis`);
    broadcastSprintProgress(user_id, 'Strategist Analysis', 10, 'Analyzing career health and market trends');

    // Run ghosting detection
    const ghostingReport = await runGhostingDetection(user_id, {
      auto_mark_ghosted: true,
      issue_directive: false, // We'll issue directives manually
      notify_user: false,
    });

    broadcastSprintProgress(user_id, 'Strategist Analysis', 25, 'Checking for ghosted applications');

    // Run rejection analysis
    const rejectionReport = await runRejectionAnalysis(user_id, {
      period_days: 7,
      issue_directive: false,
    });

    broadcastSprintProgress(user_id, 'Strategist Analysis', 40, 'Analyzing rejection patterns');

    // Calculate health score
    const healthScore = calculateHealthScore(ghostingReport, rejectionReport);

    // Issue strategic directive based on analysis
    let directivesIssued = 0;

    if (rejectionReport.top_skill_gaps.length >= 2) {
      const directive = await issueDirective({
        user_id,
        type: 'skill_priority',
        priority: 'medium',
        title: 'Sprint Focus: Skill Development',
        description: `Based on rejection analysis, prioritize these skills: ${rejectionReport.top_skill_gaps.slice(0, 3).map((g) => g.skill).join(', ')}`,
        reasoning: 'Recurring skill gaps detected in recent rejections',
        target_agent: 'architect',
        action_required: 'Repath roadmap to include these skills',
        context: { skill_gaps: rejectionReport.top_skill_gaps },
      });

      // Broadcast directive issued
      broadcastDirectiveIssued(user_id, {
        id: directive.id,
        type: directive.type,
        title: directive.title,
        priority: directive.priority,
      });

      directivesIssued++;
    }

    if (ghostingReport.average_hope_score < 40) {
      const directive = await issueDirective({
        user_id,
        type: 'application_strategy',
        priority: 'high',
        title: 'Sprint Focus: Application Quality',
        description: 'Low response rate detected. Focus on quality over quantity.',
        reasoning: `Average hope score: ${ghostingReport.average_hope_score.toFixed(1)}%`,
        target_agent: 'action',
        action_required: 'Reduce application volume, increase targeting',
      });

      // Broadcast directive issued
      broadcastDirectiveIssued(user_id, {
        id: directive.id,
        type: directive.type,
        title: directive.title,
        priority: directive.priority,
      });

      directivesIssued++;
    }

    result.strategist_phase = {
      success: true,
      directives_issued: directivesIssued,
      health_score: healthScore,
      patterns_detected: rejectionReport.patterns.length,
    };

    broadcastSprintProgress(user_id, 'Strategist Analysis', 50, `Analysis complete. Health score: ${healthScore}%`);

    // =========================================================================
    // Phase 2: Resume Tailoring (if needed)
    // =========================================================================
    console.log(`[Sprint] Phase 2: Resume Tailoring`);
    broadcastSprintProgress(user_id, 'Resume Tailoring', 55, 'Checking if resume update is needed');
    broadcastAgentStatus(user_id, 'resume', 'running', 'Resume tailoring in progress');

    // Check if resume update is needed
    const activeDirectives = await getActiveDirectives(user_id, {
      type: 'resume_rewrite',
    });

    let resumeUpdated = false;
    const tailoringApplied: string[] = [];

    if (activeDirectives.length > 0 || rejectionReport.top_skill_gaps.length > 0) {
      // Publish event for Resume Agent to handle
      await publishAgentEvent({
        type: 'RESUME_UPDATE_REQUESTED',
        payload: {
          user_id,
          reason: 'weekly_sprint',
          priority_skills: rejectionReport.top_skill_gaps.map((g) => g.skill),
          directive_ids: activeDirectives.map((d) => d.id),
        },
      });

      tailoringApplied.push(...rejectionReport.top_skill_gaps.slice(0, 3).map((g) => g.skill));
      resumeUpdated = true;
      broadcastSprintProgress(user_id, 'Resume Tailoring', 65, `Resume updated with skills: ${tailoringApplied.join(', ')}`);
    } else {
      broadcastSprintProgress(user_id, 'Resume Tailoring', 65, 'Resume is up to date');
    }

    result.resume_phase = {
      success: true,
      resume_updated: resumeUpdated,
      tailoring_applied: tailoringApplied,
    };

    broadcastAgentStatus(user_id, 'resume', 'idle', 'Resume tailoring complete');

    // =========================================================================
    // Phase 3: Job Matching & Application
    // =========================================================================
    console.log(`[Sprint] Phase 3: Job Matching & Application`);
    broadcastSprintProgress(user_id, 'Job Application', 70, 'Checking for blocking directives');
    broadcastAgentStatus(user_id, 'action', 'running', 'Job matching and application in progress');

    // Check for blocking directives (pause_applications)
    const blockingDirectives = await db
      .select()
      .from(strategicDirectives)
      .where(
        and(
          eq(strategicDirectives.user_id, user_id),
          eq(strategicDirectives.type, 'pause_applications'),
          inArray(strategicDirectives.status, ['pending', 'active']),
          or(
            isNull(strategicDirectives.expires_at),
            gte(strategicDirectives.expires_at, new Date())
          )
        )
      );

    if (blockingDirectives.length > 0) {
      console.log(`[Sprint] Applications PAUSED for user ${user_id} due to ${blockingDirectives.length} blocking directive(s)`);
      result.action_phase = {
        success: true,
        jobs_matched: 0,
        applications_created: 0,
        applications_skipped: 0,
      };
      result.summary = `Sprint paused: ${blockingDirectives[0].title}. ${blockingDirectives[0].description}`;
      result.next_sprint_focus = ['Complete the required preparation before resuming applications'];

      // Notify user about paused sprint
      await createNotification({
        user_id,
        type: 'system',
        priority: 'normal',
        title: '⏸️ Weekly Sprint Paused',
        message: `Applications are paused: ${blockingDirectives[0].title}. Complete the required preparation to resume.`,
        action_url: '/dashboard/agent-requests?tab=directives',
        action_label: 'View Directives',
        metadata: {
          blocking_directive_id: blockingDirectives[0].id,
        },
      });

      result.completed_at = new Date();
      result.duration_ms = Date.now() - startTime;
      return result;
    }

    // Get user's sprint config (or use defaults)
    const sprintConfig = await getUserSprintConfig(user_id);

    // Find matching jobs
    const matchingJobs = await findMatchingJobs(user_id, {
      min_score: sprintConfig.min_match_score,
      limit: sprintConfig.max_applications_per_sprint,
      target_roles: sprintConfig.target_roles,
    });

    let applicationsCreated = 0;
    let applicationsSkipped = 0;

    if (matchingJobs.length > 0 && sprintConfig.auto_apply) {
      // Trigger batch application
      await publishAgentEvent({
        type: 'BATCH_APPLICATION_REQUESTED',
        payload: {
          user_id,
          job_ids: matchingJobs.map((j) => j.id),
          source: 'weekly_sprint',
          create_as_draft: !sprintConfig.auto_apply,
        },
      });

      applicationsCreated = matchingJobs.length;
    } else if (matchingJobs.length > 0) {
      // Create draft applications for review
      for (const job of matchingJobs) {
        try {
          await db.insert(jobApplications).values({
            user_id,
            job_listing_id: job.id,
            company: job.company || 'Unknown',
            role: job.title || 'Unknown',
            location: job.location,
            status: 'draft',
            raw_data: {
              match_score: job.match_score,
              source: 'weekly_sprint',
              created_by: 'sprint_automation',
            },
          });
          applicationsCreated++;
        } catch {
          applicationsSkipped++;
        }
      }
    }

    result.action_phase = {
      success: true,
      jobs_matched: matchingJobs.length,
      applications_created: applicationsCreated,
      applications_skipped: applicationsSkipped,
    };

    // =========================================================================
    // Phase 4: Generate Report
    // =========================================================================
    console.log(`[Sprint] Phase 4: Generate Report`);

    const summary = generateSprintSummary(result);
    result.summary = summary;

    // Send notification to user
    await createNotification({
      user_id,
      type: 'system',
      priority: 'normal',
      title: '🏃 Weekly Career Sprint Complete',
      message: summary,
      action_url: '/jobs/applications?filter=draft',
      action_label: 'Review Applications',
      metadata: {
        sprint_results: result,
      },
    });

    result.completed_at = new Date();
    result.duration_ms = Date.now() - startTime;

    // Broadcast sprint complete
    broadcastSprintComplete(user_id, {
      applications_created: result.action_phase.applications_created,
      health_score: result.strategist_phase.health_score || 0,
      directives_issued: result.strategist_phase.directives_issued,
    });

    // Set agents back to idle
    broadcastAgentStatus(user_id, 'strategist', 'idle', 'Weekly sprint complete');
    broadcastAgentStatus(user_id, 'resume', 'idle', 'Sprint complete');
    broadcastAgentStatus(user_id, 'action', 'idle', 'Sprint complete');

    console.log(`[Sprint] Completed for user ${user_id} in ${result.duration_ms}ms`);

    return result;
  } catch (error) {
    console.error(`[Sprint] Error for user ${user_id}:`, error);

    // Broadcast error
    broadcastAgentStatus(user_id, 'strategist', 'error', `Sprint failed: ${(error as Error).message}`);

    result.summary = `Sprint failed: ${(error as Error).message}`;
    result.completed_at = new Date();
    result.duration_ms = Date.now() - startTime;
    return result;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get users who have sprint enabled
 */
async function getSprintEnabledUsers(): Promise<string[]> {
  // For now, return all active users
  // In production, check user settings for sprint opt-in
  return getActiveUserIds(30);
}

/**
 * Get users with recent activity
 */
async function getActiveUserIds(days: number): Promise<string[]> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Get users with recent applications or interviews
  const activeUsers = await db
    .selectDistinct({ user_id: jobApplications.user_id })
    .from(jobApplications)
    .where(gte(jobApplications.created_at, cutoffDate));

  return activeUsers.map((u) => u.user_id);
}

/**
 * Get user's sprint configuration
 */
async function getUserSprintConfig(user_id: string): Promise<UserSprintConfig> {
  // In production, fetch from user_settings table
  // For now, return defaults
  return {
    user_id,
    ...DEFAULT_SPRINT_CONFIG,
  };
}

/**
 * Find matching jobs for user
 */
async function findMatchingJobs(
  user_id: string,
  options: { min_score: number; limit: number; target_roles: string[] }
): Promise<Array<{ id: string; title: string | null; company: string | null; location: string | null; match_score: number }>> {
  // Get recent job listings that haven't been applied to
  const appliedJobIds = await db
    .select({ job_id: jobApplications.job_listing_id })
    .from(jobApplications)
    .where(eq(jobApplications.user_id, user_id));

  const appliedIds = appliedJobIds.map((j) => j.job_id).filter(Boolean) as string[];

  // Get fresh job listings
  const jobs = await db
    .select({
      id: jobListings.id,
      title: jobListings.title,
      company: jobListings.company,
      location: jobListings.location,
    })
    .from(jobListings)
    .where(gte(jobListings.expires_at, new Date()))
    .orderBy(desc(jobListings.scraped_at))
    .limit(options.limit * 2);

  // Filter out already applied and add mock match score
  // In production, use actual embedding-based matching
  return jobs
    .filter((j) => !appliedIds.includes(j.id))
    .slice(0, options.limit)
    .map((j) => ({
      ...j,
      match_score: Math.floor(Math.random() * 30) + 70, // Mock score 70-100
    }));
}

/**
 * Calculate overall health score
 */
function calculateHealthScore(
  ghostingReport: { average_hope_score: number; ghosted_applications: unknown[] },
  rejectionReport: { rejection_rate: number; patterns: unknown[] }
): number {
  let score = 100;

  // Deduct for low hope score
  if (ghostingReport.average_hope_score < 50) {
    score -= (50 - ghostingReport.average_hope_score);
  }

  // Deduct for ghosted applications
  score -= ghostingReport.ghosted_applications.length * 3;

  // Deduct for high rejection rate
  if (rejectionReport.rejection_rate > 50) {
    score -= (rejectionReport.rejection_rate - 50) / 2;
  }

  // Deduct for patterns
  score -= rejectionReport.patterns.length * 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Generate human-readable sprint summary
 */
function generateSprintSummary(result: SprintResult): string {
  const parts: string[] = [];

  if (result.strategist_phase.success) {
    parts.push(`Health score: ${result.strategist_phase.health_score?.toFixed(0) || 'N/A'}%`);
    if (result.strategist_phase.directives_issued > 0) {
      parts.push(`${result.strategist_phase.directives_issued} strategic focus area(s) identified`);
    }
  }

  if (result.action_phase.jobs_matched > 0) {
    parts.push(`Found ${result.action_phase.jobs_matched} matching job(s)`);
    if (result.action_phase.applications_created > 0) {
      parts.push(`Created ${result.action_phase.applications_created} draft application(s) for your review`);
    }
  } else {
    parts.push('No new matching jobs this week');
  }

  return parts.join('. ') + '.';
}
