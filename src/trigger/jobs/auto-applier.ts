/**
 * Auto Applier Job
 *
 * Triggered when: JOB_MATCH_FOUND event is published
 * Purpose: Evaluate job match and optionally auto-apply
 *
 * This job is part of the Action Agent's autonomous job application system.
 * It evaluates whether a matched job is worth applying to and, if the user
 * has auto-apply enabled, generates a cover letter and creates an application.
 *
 * Flow:
 * 1. Check if user has auto-apply enabled
 * 2. Validate match score against user's threshold
 * 3. Check daily application limit
 * 4. Check excluded companies list
 * 5. Check for blocking strategic directives
 * 6. Generate tailored cover letter using AI + RAG
 * 7. Create job_applications record
 * 8. Optionally submit via browser automation
 * 9. Publish APPLICATION_SUBMITTED event
 */

import { task } from '@trigger.dev/sdk';
import { db } from '@/drizzle/db';
import {
  userProfiles,
  jobListings,
  jobApplications,
  applicationDocuments,
} from '@/drizzle/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { generateCoverLetter } from '@/services/cover-letter';
import {
  shouldSkipEvent,
  markEventCompleted,
  markEventFailed,
  markEventProcessing,
  publishAgentEvent,
} from '@/lib/agents/message-bus';
import { createNotification } from '@/services/notifications';
import { checkDirectivesForOperation } from '@/lib/agents/utils/directive-checker';
import {
  broadcastApplicationBlocked,
  broadcastApplicationProgress,
  broadcastToUser,
} from '@/services/realtime';
import { executeActionTool } from '@/lib/agents/agents/action';

interface AutoApplierPayload {
  event_id: string;
  user_id: string;
  job_listing_id: string;
  match_score: number;
  matching_skills: string[];
  missing_skills: string[];
}

/**
 * Count applications submitted today by user
 */
async function countTodayApplications(userId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.user_id, userId),
        gte(jobApplications.applied_at, todayStart)
      )
    );

  return result[0]?.count || 0;
}

/**
 * Check if a company is in the user's exclusion list
 */
function isCompanyExcluded(
  company: string,
  excludedCompanies: string[] | null
): boolean {
  if (!excludedCompanies || excludedCompanies.length === 0) {
    return false;
  }

  const companyLower = company.toLowerCase().trim();
  return excludedCompanies.some(
    (excluded) => excluded.toLowerCase().trim() === companyLower
  );
}

export const autoApplier = task({
  id: 'action.evaluate-match',
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: AutoApplierPayload) => {
    const {
      event_id,
      user_id,
      job_listing_id,
      match_score,
      matching_skills,
      missing_skills,
    } = payload;

    // =========================================================================
    // IDEMPOTENCY CHECK
    // =========================================================================
    const idempotencyCheck = await shouldSkipEvent(event_id);
    if (idempotencyCheck.skip) {
      console.log(`[Auto Applier] Skipping event ${event_id}: ${idempotencyCheck.reason}`);
      return {
        success: true,
        skipped: true,
        reason: idempotencyCheck.reason,
      };
    }

    await markEventProcessing(event_id);

    try {
      console.log('='.repeat(60));
      console.log('[Auto Applier] Evaluating job match');
      console.log(`  User ID: ${user_id}`);
      console.log(`  Job Listing ID: ${job_listing_id}`);
      console.log(`  Match Score: ${match_score}%`);
      console.log(`  Matching Skills: ${matching_skills.join(', ')}`);
      console.log(`  Missing Skills: ${missing_skills.join(', ')}`);
      console.log('='.repeat(60));

      // =========================================================================
      // Step 1: Fetch user profile with auto-apply settings
      // =========================================================================
      const userProfile = await db.query.userProfiles.findFirst({
        where: eq(userProfiles.user_id, user_id),
      });

      if (!userProfile) {
        throw new Error(`User profile not found for ${user_id}`);
      }

      // =========================================================================
      // Step 2: Check if auto-apply is enabled
      // =========================================================================
      if (!userProfile.auto_apply_enabled) {
        console.log('[Auto Applier] Auto-apply not enabled for user');
        await markEventCompleted(event_id);
        return {
          success: true,
          applied: false,
          reason: 'auto_apply_disabled',
          user_id,
          job_listing_id,
        };
      }

      // =========================================================================
      // Step 3: Check match score threshold
      // =========================================================================
      const threshold = userProfile.auto_apply_threshold || 75;
      if (match_score < threshold) {
        console.log(
          `[Auto Applier] Match score ${match_score}% below threshold ${threshold}%`
        );
        await markEventCompleted(event_id);
        return {
          success: true,
          applied: false,
          reason: 'below_threshold',
          match_score,
          threshold,
          user_id,
          job_listing_id,
        };
      }

      // =========================================================================
      // Step 4: Check daily application limit
      // =========================================================================
      const todayCount = await countTodayApplications(user_id);
      const dailyLimit = userProfile.auto_apply_daily_limit || 5;

      if (todayCount >= dailyLimit) {
        console.log(
          `[Auto Applier] Daily limit reached (${todayCount}/${dailyLimit})`
        );
        await markEventCompleted(event_id);
        return {
          success: true,
          applied: false,
          reason: 'daily_limit_reached',
          today_count: todayCount,
          daily_limit: dailyLimit,
          user_id,
          job_listing_id,
        };
      }

      // =========================================================================
      // Step 5: Fetch job listing details
      // =========================================================================
      const jobListing = await db.query.jobListings.findFirst({
        where: eq(jobListings.id, job_listing_id),
      });

      if (!jobListing) {
        throw new Error(`Job listing not found: ${job_listing_id}`);
      }

      console.log(`[Auto Applier] Job: ${jobListing.title} at ${jobListing.company}`);

      // =========================================================================
      // Step 6: Check excluded companies
      // =========================================================================
      if (isCompanyExcluded(jobListing.company, userProfile.auto_apply_excluded_companies)) {
        console.log(`[Auto Applier] Company "${jobListing.company}" is excluded`);
        await markEventCompleted(event_id);
        return {
          success: true,
          applied: false,
          reason: 'company_excluded',
          company: jobListing.company,
          user_id,
          job_listing_id,
        };
      }

      // =========================================================================
      // Step 7: Check if already applied to this job
      // =========================================================================
      const existingApplication = await db.query.jobApplications.findFirst({
        where: and(
          eq(jobApplications.user_id, user_id),
          eq(jobApplications.job_listing_id, job_listing_id)
        ),
      });

      if (existingApplication) {
        console.log('[Auto Applier] Already applied to this job');
        await markEventCompleted(event_id);
        return {
          success: true,
          applied: false,
          reason: 'already_applied',
          existing_application_id: existingApplication.id,
          user_id,
          job_listing_id,
        };
      }

      // =========================================================================
      // Step 7.5: Check for blocking strategic directives
      // =========================================================================
      console.log('[Auto Applier] Checking strategic directives...');

      const directiveCheck = await checkDirectivesForOperation({
        userId: user_id,
        agentType: 'action',
        operation: 'apply',
      });

      if (directiveCheck.blocked && directiveCheck.directive) {
        console.log(`[Auto Applier] BLOCKED by directive: ${directiveCheck.directive.title}`);

        // Broadcast to UI that application was blocked
        broadcastApplicationBlocked(user_id, {
          directive_id: directiveCheck.directive.id,
          directive_title: directiveCheck.directive.title,
          directive_type: directiveCheck.directive.type,
          reason: directiveCheck.reason || directiveCheck.directive.description,
          action_required: directiveCheck.requiredAction,
          job_company: jobListing.company,
          job_role: jobListing.title,
        });

        // Create notification for user
        await createNotification({
          user_id,
          type: 'system',
          priority: 'high',
          title: `Application Blocked: ${jobListing.company}`,
          message: `Strategic directive "${directiveCheck.directive.title}" is active. ${directiveCheck.directive.description}`,
          action_url: '/dashboard/agent-requests?tab=directives',
          action_label: 'View Directive',
          metadata: {
            directive_id: directiveCheck.directive.id,
            blocked_job_id: job_listing_id,
          },
        });

        await markEventCompleted(event_id);

        return {
          success: true,
          applied: false,
          reason: 'blocked_by_directive',
          directive_id: directiveCheck.directive.id,
          directive_title: directiveCheck.directive.title,
          user_id,
          job_listing_id,
        };
      }

      // =========================================================================
      // Step 8: Generate personalized cover letter
      // =========================================================================
      console.log('[Auto Applier] Generating cover letter...');

      const coverLetterResult = await generateCoverLetter({
        userId: user_id,
        jobListingId: job_listing_id,
        matchingSkills: matching_skills,
        missingSkills: missing_skills,
        matchScore: match_score,
      });

      console.log(
        `[Auto Applier] Cover letter generated (${coverLetterResult.wordCount} words)`
      );

      // =========================================================================
      // Step 9: Create application document record
      // =========================================================================
      const [coverLetterDoc] = await db
        .insert(applicationDocuments)
        .values({
          user_id,
          type: 'cover_letter',
          version: 1,
          name: `Cover Letter - ${jobListing.company} - ${jobListing.title}`,
          metadata: {
            target_role: jobListing.title,
            skills_highlighted: matching_skills,
            last_modified_by: 'agent',
          },
        })
        .returning();

      console.log(`[Auto Applier] Created cover letter document: ${coverLetterDoc.id}`);

      // =========================================================================
      // Step 10: Create job application record
      // =========================================================================
      const applicationStatus = userProfile.auto_apply_require_review
        ? 'draft' // Require user review
        : 'applied'; // Auto-submit

      const [application] = await db
        .insert(jobApplications)
        .values({
          user_id,
          job_listing_id,
          document_id: coverLetterDoc.id,
          company: jobListing.company,
          role: jobListing.title,
          location: jobListing.location,
          status: applicationStatus,
          applied_at: applicationStatus === 'applied' ? new Date() : null,
          last_activity_at: new Date(),
          raw_data: {
            job_description: jobListing.raw_data?.description,
            match_score,
            agent_reasoning: coverLetterResult.keyPoints.join('; '),
          },
        })
        .returning();

      console.log(
        `[Auto Applier] Created application: ${application.id} (status: ${applicationStatus})`
      );

      // =========================================================================
      // Step 10.5: Optionally auto-submit via browser automation
      // =========================================================================
      let browserAutomationResult: {
        status: string;
        screenshot_url?: string;
        fields_filled?: number;
        message?: string;
      } | null = null;

      if (!userProfile.auto_apply_require_review) {
        console.log('[Auto Applier] Attempting browser automation submission...');

        // Broadcast that we're starting automation
        broadcastApplicationProgress(user_id, {
          applicationId: application.id,
          stage: 'navigating',
          progress: 10,
          message: 'Starting browser automation...',
          company: jobListing.company,
          role: jobListing.title,
        });

        try {
          const submissionResult = await executeActionTool<{
            status: string;
            message: string;
            screenshot_url?: string;
            fields_filled: number;
            fields_missing: string[];
          }>('submit_application', {
            user_id,
            job_listing_id,
            application_id: application.id,
            cover_letter: coverLetterResult.coverLetter,
            dry_run: false,
          });

          browserAutomationResult = {
            status: submissionResult.status,
            screenshot_url: submissionResult.screenshot_url,
            fields_filled: submissionResult.fields_filled,
            message: submissionResult.message,
          };

          if (submissionResult.status === 'success') {
            // Update application status to applied
            await db.update(jobApplications)
              .set({
                status: 'applied',
                applied_at: new Date(),
                last_activity_at: new Date(),
                raw_data: sql`COALESCE(raw_data, '{}'::jsonb) || ${JSON.stringify({
                  automation: {
                    status: 'success',
                    screenshot_url: submissionResult.screenshot_url,
                    fields_filled: submissionResult.fields_filled,
                    submitted_at: new Date().toISOString(),
                  },
                })}::jsonb`,
              })
              .where(eq(jobApplications.id, application.id));

            // Broadcast success
            broadcastToUser({
              type: 'application_submitted',
              user_id,
              data: {
                status: 'success',
                application_id: application.id,
                screenshot_url: submissionResult.screenshot_url,
                company: jobListing.company,
                role: jobListing.title,
              },
            });

            console.log('[Auto Applier] Browser automation successful');
          } else {
            // Fallback to draft - browser automation couldn't complete
            await db.update(jobApplications)
              .set({
                status: 'draft',
                raw_data: sql`COALESCE(raw_data, '{}'::jsonb) || ${JSON.stringify({
                  automation: {
                    status: submissionResult.status,
                    message: submissionResult.message,
                    screenshot_url: submissionResult.screenshot_url,
                    fields_missing: submissionResult.fields_missing,
                    attempted_at: new Date().toISOString(),
                  },
                })}::jsonb`,
              })
              .where(eq(jobApplications.id, application.id));

            // Broadcast that it's now a draft
            broadcastToUser({
              type: 'application_draft_created',
              user_id,
              data: {
                status: 'draft',
                application_id: application.id,
                reason: submissionResult.message,
                company: jobListing.company,
                role: jobListing.title,
              },
            });

            console.log(`[Auto Applier] Browser automation fallback to draft: ${submissionResult.message}`);
          }
        } catch (error) {
          console.error('[Auto Applier] Browser automation failed:', error);
          // Application remains as draft - don't fail the whole job
          browserAutomationResult = {
            status: 'failed',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }

      // =========================================================================
      // Step 11: Publish APPLICATION_SUBMITTED event
      // =========================================================================
      if (applicationStatus === 'applied') {
        await publishAgentEvent({
          type: 'APPLICATION_SUBMITTED',
          payload: {
            application_id: application.id,
            user_id,
            job_listing_id,
            method: 'auto',
            match_score,
            cover_letter_id: coverLetterDoc.id,
          },
        });

        console.log('[Auto Applier] Published APPLICATION_SUBMITTED event');
      }

      // Mark event as completed
      await markEventCompleted(event_id);

      console.log('='.repeat(60));
      console.log('[Auto Applier] Application process complete!');
      console.log(`  Status: ${applicationStatus}`);
      console.log(`  Application ID: ${application.id}`);
      console.log('='.repeat(60));

      return {
        success: true,
        applied: applicationStatus === 'applied' || browserAutomationResult?.status === 'success',
        requires_review: applicationStatus === 'draft' && browserAutomationResult?.status !== 'success',
        application_id: application.id,
        cover_letter_id: coverLetterDoc.id,
        company: jobListing.company,
        role: jobListing.title,
        match_score,
        key_points: coverLetterResult.keyPoints,
        user_id,
        job_listing_id,
        // Browser automation result
        automation: browserAutomationResult ? {
          status: browserAutomationResult.status,
          screenshot_url: browserAutomationResult.screenshot_url,
          fields_filled: browserAutomationResult.fields_filled,
        } : undefined,
      };
    } catch (error) {
      console.error('[Auto Applier] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  },
});

/**
 * Execute Apply Job
 *
 * Triggered when: User approves a draft application or AUTO_APPLY_TRIGGERED
 * Purpose: Actually execute the application submission
 *
 * This job handles the final submission step for applications that required review.
 */
export const executeApply = task({
  id: 'action.execute-apply',
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 15000,
  },
  run: async (payload: {
    event_id: string;
    application_id: string;
    user_id: string;
  }) => {
    const { event_id, application_id, user_id } = payload;

    // Idempotency check
    const idempotencyCheck = await shouldSkipEvent(event_id);
    if (idempotencyCheck.skip) {
      return { success: true, skipped: true, reason: idempotencyCheck.reason };
    }

    await markEventProcessing(event_id);

    try {
      console.log('[Execute Apply] Submitting application');
      console.log(`  Application ID: ${application_id}`);
      console.log(`  User ID: ${user_id}`);

      // Fetch application
      const application = await db.query.jobApplications.findFirst({
        where: and(
          eq(jobApplications.id, application_id),
          eq(jobApplications.user_id, user_id)
        ),
      });

      if (!application) {
        throw new Error(`Application not found: ${application_id}`);
      }

      if (application.status !== 'draft') {
        console.log(`[Execute Apply] Application already submitted (status: ${application.status})`);
        await markEventCompleted(event_id);
        return {
          success: true,
          applied: false,
          reason: 'already_submitted',
          current_status: application.status,
        };
      }

      // Update application status to 'applied'
      await db
        .update(jobApplications)
        .set({
          status: 'applied',
          applied_at: new Date(),
          last_activity_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(jobApplications.id, application_id));

      // Publish APPLICATION_SUBMITTED event
      await publishAgentEvent({
        type: 'APPLICATION_SUBMITTED',
        payload: {
          application_id,
          user_id,
          job_listing_id: application.job_listing_id,
          method: 'manual', // User approved this one
          match_score: (application.raw_data as { match_score?: number })?.match_score || 0,
        },
      });

      await markEventCompleted(event_id);

      console.log('[Execute Apply] Application submitted successfully');

      return {
        success: true,
        applied: true,
        application_id,
        company: application.company,
        role: application.role,
      };
    } catch (error) {
      console.error('[Execute Apply] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  },
});
