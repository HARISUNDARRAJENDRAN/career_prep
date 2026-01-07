/**
 * Email Monitoring Service
 *
 * Automatically monitors user Gmail/Outlook for:
 * - Application confirmation emails
 * - Rejection emails
 * - Interview invitations
 * - Follow-up responses
 *
 * Updates job_applications table automatically based on email content.
 */

import { db } from '@/drizzle/db';
import { jobApplications } from '@/drizzle/schema';
import { eq, and, or, gte } from 'drizzle-orm';
import { parseRejectionEmail } from './rejection-insights';

// Email classification patterns
const EMAIL_PATTERNS = {
  confirmation: [
    /application.*received/i,
    /thank you for (your )?applying/i,
    /we have received your application/i,
    /application.*submitted successfully/i,
    /application.*confirmation/i,
    /application reference/i,
    /application.*number/i,
  ],
  rejection: [
    /unfortunately/i,
    /we regret to inform/i,
    /not moving forward/i,
    /not selected/i,
    /decided to pursue/i,
    /other candidates/i,
    /position has been filled/i,
    /going in a different direction/i,
  ],
  interview: [
    /interview invitation/i,
    /schedule.*interview/i,
    /would like to invite you/i,
    /next step.*interview/i,
    /phone screen/i,
    /technical interview/i,
    /interview.*available/i,
  ],
  offer: [
    /offer.*employment/i,
    /pleased to offer/i,
    /offer letter/i,
    /job offer/i,
    /extend.*offer/i,
  ],
};

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
  snippet?: string;
}

export type EmailClassification =
  | 'confirmation'
  | 'rejection'
  | 'interview'
  | 'offer'
  | 'followup'
  | 'unknown';

/**
 * Classify an email based on its content
 */
export function classifyEmail(email: EmailMessage): EmailClassification {
  const content = `${email.subject} ${email.body}`.toLowerCase();

  // Check patterns in order of importance
  if (EMAIL_PATTERNS.offer.some((pattern) => pattern.test(content))) {
    return 'offer';
  }
  if (EMAIL_PATTERNS.interview.some((pattern) => pattern.test(content))) {
    return 'interview';
  }
  if (EMAIL_PATTERNS.rejection.some((pattern) => pattern.test(content))) {
    return 'rejection';
  }
  if (EMAIL_PATTERNS.confirmation.some((pattern) => pattern.test(content))) {
    return 'confirmation';
  }

  return 'unknown';
}

/**
 * Find matching application for an email
 */
export async function findMatchingApplication(
  userId: string,
  email: EmailMessage
): Promise<string | null> {
  const fromDomain = email.from.split('@')[1]?.toLowerCase() || '';
  const content = `${email.subject} ${email.body}`.toLowerCase();

  // Get applications from the last 60 days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 60);

  const applications = await db.query.jobApplications.findMany({
    where: and(
      eq(jobApplications.user_id, userId),
      gte(jobApplications.created_at, cutoffDate),
      or(
        eq(jobApplications.status, 'applied'),
        eq(jobApplications.status, 'interviewing')
      )
    ),
  });

  // Try to match by company name or domain
  for (const app of applications) {
    const companyName = app.company.toLowerCase();
    const companyDomain = companyName.replace(/\s+/g, '').replace(/[,\.]/g, '');

    // Check if email is from company domain
    if (
      fromDomain.includes(companyDomain) ||
      companyDomain.includes(fromDomain.replace('.com', ''))
    ) {
      return app.id;
    }

    // Check if company name mentioned in subject/body
    if (content.includes(companyName)) {
      return app.id;
    }

    // Check if role mentioned
    const roleName = app.role.toLowerCase();
    if (content.includes(roleName) && content.includes(companyName)) {
      return app.id;
    }
  }

  return null;
}

/**
 * Process a single email and update application if matched
 */
export async function processEmail(
  userId: string,
  email: EmailMessage
): Promise<{
  processed: boolean;
  applicationId?: string;
  classification: EmailClassification;
  action?: string;
}> {
  // Classify the email
  const classification = classifyEmail(email);

  // Only process relevant emails
  if (classification === 'unknown') {
    return { processed: false, classification };
  }

  // Find matching application
  const applicationId = await findMatchingApplication(userId, email);

  if (!applicationId) {
    return {
      processed: false,
      classification,
      action: 'No matching application found',
    };
  }

  // Get current application
  const application = await db.query.jobApplications.findFirst({
    where: eq(jobApplications.id, applicationId),
  });

  if (!application) {
    return {
      processed: false,
      classification,
      action: 'Application not found',
    };
  }

  // Update based on classification
  switch (classification) {
    case 'confirmation':
      await db
        .update(jobApplications)
        .set({
          last_activity_at: email.receivedAt,
          raw_data: {
            ...(application.raw_data as any),
            confirmation_received: true,
            confirmation_at: email.receivedAt.toISOString(),
            email_threads: [
              ...((application.raw_data as any)?.email_threads || []),
              {
                date: email.receivedAt.toISOString(),
                from: email.from,
                subject: email.subject,
                body: email.snippet || email.body.slice(0, 500),
              },
            ],
          },
        })
        .where(eq(jobApplications.id, applicationId));

      return {
        processed: true,
        applicationId,
        classification,
        action: 'Marked as confirmed',
      };

    case 'rejection':
      // Parse rejection using AI for detailed insights
      const rejectionAnalysis = await parseRejectionEmail({
        subject: email.subject,
        body: email.body,
        company: application.company,
        role: application.role,
      });

      await db
        .update(jobApplications)
        .set({
          status: 'rejected',
          last_activity_at: email.receivedAt,
          raw_data: {
            ...(application.raw_data as any),
            rejection_parsed: true,
            rejection_type: rejectionAnalysis.category,
            rejection_reason: rejectionAnalysis.reason,
            rejection_feedback: rejectionAnalysis.feedback,
            skill_gaps: rejectionAnalysis.skill_gaps,
            rejection_confidence: rejectionAnalysis.confidence,
            rejection_parsed_at: new Date().toISOString(),
            email_threads: [
              ...((application.raw_data as any)?.email_threads || []),
              {
                date: email.receivedAt.toISOString(),
                from: email.from,
                subject: email.subject,
                body: email.snippet || email.body.slice(0, 500),
              },
            ],
          },
        })
        .where(eq(jobApplications.id, applicationId));

      return {
        processed: true,
        applicationId,
        classification,
        action: `Marked as rejected: ${rejectionAnalysis.category}`,
      };

    case 'interview':
      await db
        .update(jobApplications)
        .set({
          status: 'interviewing',
          last_activity_at: email.receivedAt,
          raw_data: {
            ...(application.raw_data as any),
            interview_invited: true,
            interview_invited_at: email.receivedAt.toISOString(),
            email_threads: [
              ...((application.raw_data as any)?.email_threads || []),
              {
                date: email.receivedAt.toISOString(),
                from: email.from,
                subject: email.subject,
                body: email.snippet || email.body.slice(0, 500),
              },
            ],
          },
        })
        .where(eq(jobApplications.id, applicationId));

      return {
        processed: true,
        applicationId,
        classification,
        action: 'Marked as interviewing',
      };

    case 'offer':
      await db
        .update(jobApplications)
        .set({
          status: 'offered',
          last_activity_at: email.receivedAt,
          raw_data: {
            ...(application.raw_data as any),
            offer_received: true,
            offer_received_at: email.receivedAt.toISOString(),
            email_threads: [
              ...((application.raw_data as any)?.email_threads || []),
              {
                date: email.receivedAt.toISOString(),
                from: email.from,
                subject: email.subject,
                body: email.snippet || email.body.slice(0, 500),
              },
            ],
          },
        })
        .where(eq(jobApplications.id, applicationId));

      return {
        processed: true,
        applicationId,
        classification,
        action: 'Marked as offered',
      };

    default:
      return {
        processed: false,
        applicationId,
        classification,
        action: 'Classification not handled',
      };
  }
}

/**
 * Process multiple emails in batch
 */
export async function processEmails(
  userId: string,
  emails: EmailMessage[]
): Promise<{
  total: number;
  processed: number;
  results: Array<{
    emailId: string;
    processed: boolean;
    classification: EmailClassification;
    applicationId?: string;
    action?: string;
  }>;
}> {
  const results = [];

  for (const email of emails) {
    const result = await processEmail(userId, email);
    results.push({
      emailId: email.id,
      ...result,
    });
  }

  const processed = results.filter((r) => r.processed).length;

  return {
    total: emails.length,
    processed,
    results,
  };
}
