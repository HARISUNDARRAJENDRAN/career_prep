/**
 * Email Sync API Route
 *
 * Manually triggers email sync for the authenticated user.
 * Fetches recent Gmail messages and processes them for application updates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { fetchGmailMessages } from '@/services/gmail-client';
import { processEmails } from '@/services/email-monitoring';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { days_back = 7 } = body;

    // Calculate date to fetch emails from
    const after = new Date();
    after.setDate(after.getDate() - days_back);

    // Fetch emails from Gmail
    const emails = await fetchGmailMessages(userId, {
      maxResults: 100,
      after,
    });

    if (emails.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No new emails found',
        total: 0,
        processed: 0,
        results: [],
      });
    }

    // Process emails
    const result = await processEmails(userId, emails);

    return NextResponse.json({
      success: true,
      message: `Processed ${result.processed} out of ${result.total} emails`,
      total: result.total,
      processed: result.processed,
      results: result.results.filter((r) => r.processed), // Only return processed ones
    });
  } catch (error) {
    console.error('[Email Sync] Error:', error);

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('credentials not found')) {
        return NextResponse.json(
          {
            error: 'Gmail not connected',
            message: 'Please connect your Gmail account in Settings to enable email monitoring',
            action_required: 'connect_gmail',
          },
          { status: 400 }
        );
      }

      if (error.message.includes('invalid_grant') || error.message.includes('Token')) {
        return NextResponse.json(
          {
            error: 'Gmail token expired',
            message: 'Your Gmail connection has expired. Please reconnect in Settings',
            action_required: 'reconnect_gmail',
          },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Email sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check sync status
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if user has Gmail connected
    const { db } = await import('@/drizzle/db');
    const { encryptedCredentials } = await import('@/drizzle/schema');
    const { eq } = await import('drizzle-orm');

    const credentials = await db.query.encryptedCredentials.findFirst({
      where: eq(encryptedCredentials.user_id, userId),
    });

    if (!credentials) {
      return NextResponse.json({
        connected: false,
        message: 'Gmail not connected',
      });
    }

    return NextResponse.json({
      connected: true,
      message: 'Gmail connected',
      last_synced: credentials.updated_at.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to check status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
