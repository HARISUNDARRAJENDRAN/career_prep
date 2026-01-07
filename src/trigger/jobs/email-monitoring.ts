/**
 * Email Monitoring Scheduled Task
 *
 * Runs every hour to check for new emails from job applications.
 * Automatically detects confirmations, rejections, and interview invites.
 */

import { schedules } from '@trigger.dev/sdk';
import { db } from '@/drizzle/db';
import { fetchGmailMessages } from '@/services/gmail-client';
import { processEmails } from '@/services/email-monitoring';

export const emailMonitoringTask = schedules.task({
  id: 'email-monitoring-hourly',
  cron: '0 * * * *', // Every hour
  run: async (payload) => {
    console.log('[Email Monitoring] Starting hourly email check');

    // Get all users (in production, you'd want to batch this)
    const allUsers = await db.query.users.findMany({
      limit: 100, // Process 100 users per hour
    });

    const results = {
      usersProcessed: 0,
      totalEmails: 0,
      emailsProcessed: 0,
      errors: 0,
    };

    for (const user of allUsers) {
      try {
        // Fetch emails from last 2 hours (with overlap to avoid missing any)
        const after = new Date();
        after.setHours(after.getHours() - 2);

        const emails = await fetchGmailMessages(user.clerk_id, {
          maxResults: 50,
          after,
        });

        if (emails.length > 0) {
          const processResult = await processEmails(user.clerk_id, emails);
          results.totalEmails += processResult.total;
          results.emailsProcessed += processResult.processed;

          console.log(
            `[Email Monitoring] User ${user.clerk_id}: ${processResult.processed}/${processResult.total} emails processed`
          );
        }

        results.usersProcessed++;
      } catch (error) {
        console.error(`[Email Monitoring] Error for user ${user.clerk_id}:`, error);
        results.errors++;
        // Continue with other users
      }
    }

    console.log('[Email Monitoring] Completed:', results);

    return {
      success: true,
      timestamp: payload.timestamp,
      ...results,
    };
  },
});
