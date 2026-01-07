/**
 * Gmail API Client
 *
 * Fetches emails from user's Gmail account using Gmail API.
 * Requires OAuth2 credentials stored in encrypted_credentials table.
 */

import { google } from 'googleapis';
import { db } from '@/drizzle/db';
import { encryptedCredentials } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { decryptJson } from '@/lib/security/encryption';
import type { EmailMessage } from './email-monitoring';

const gmail = google.gmail('v1');

interface GmailCredentials {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
}

/**
 * Get Gmail OAuth2 client for a user
 */
async function getGmailClient(userId: string) {
  // Fetch encrypted credentials
  const credRecord = await db.query.encryptedCredentials.findFirst({
    where: eq(encryptedCredentials.user_id, userId),
  });

  if (!credRecord) {
    throw new Error('Gmail credentials not found. Please connect your Gmail account.');
  }

  // Decrypt credentials
  const credentials = decryptJson<GmailCredentials>(credRecord.encrypted_data);

  if (!credentials.access_token) {
    throw new Error('Invalid Gmail credentials');
  }

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token,
    expiry_date: credentials.expiry_date,
  });

  return oauth2Client;
}

/**
 * Fetch recent emails from Gmail
 */
export async function fetchGmailMessages(
  userId: string,
  options: {
    maxResults?: number;
    query?: string;
    after?: Date; // Only fetch emails after this date
  } = {}
): Promise<EmailMessage[]> {
  const auth = await getGmailClient(userId);

  const { maxResults = 50, query, after } = options;

  // Build query string
  let gmailQuery = query || 'category:primary -category:promotions -category:social';

  // Add date filter
  if (after) {
    const afterTimestamp = Math.floor(after.getTime() / 1000);
    gmailQuery += ` after:${afterTimestamp}`;
  }

  // List messages
  const listResponse = await gmail.users.messages.list({
    auth,
    userId: 'me',
    maxResults,
    q: gmailQuery,
  });

  const messages = listResponse.data.messages || [];

  if (messages.length === 0) {
    return [];
  }

  // Fetch full message details
  const emailMessages: EmailMessage[] = [];

  for (const message of messages) {
    try {
      const msgResponse = await gmail.users.messages.get({
        auth,
        userId: 'me',
        id: message.id!,
        format: 'full',
      });

      const msg = msgResponse.data;

      // Extract headers
      const headers = msg.payload?.headers || [];
      const from = headers.find((h) => h.name === 'From')?.value || '';
      const subject = headers.find((h) => h.name === 'Subject')?.value || '';
      const date = headers.find((h) => h.name === 'Date')?.value || '';

      // Extract body
      let body = '';
      const snippet = msg.snippet || '';

      if (msg.payload?.parts) {
        // Multipart email
        for (const part of msg.payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body += Buffer.from(part.body.data, 'base64').toString('utf-8');
          } else if (part.mimeType === 'text/html' && part.body?.data && !body) {
            // Fallback to HTML if no plain text
            body += Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
        }
      } else if (msg.payload?.body?.data) {
        // Simple email
        body = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
      }

      emailMessages.push({
        id: msg.id!,
        from,
        subject,
        body: body || snippet,
        snippet,
        receivedAt: date ? new Date(date) : new Date(parseInt(msg.internalDate || '0')),
      });
    } catch (error) {
      console.error(`Failed to fetch message ${message.id}:`, error);
      // Continue with other messages
    }
  }

  return emailMessages;
}

/**
 * Watch Gmail mailbox for new emails (webhooks)
 * This sets up push notifications from Gmail
 */
export async function watchGmailMailbox(userId: string): Promise<{
  historyId: string;
  expiration: number;
}> {
  const auth = await getGmailClient(userId);

  const response = await gmail.users.watch({
    auth,
    userId: 'me',
    requestBody: {
      topicName: process.env.GMAIL_PUBSUB_TOPIC,
      labelIds: ['INBOX'],
    },
  });

  return {
    historyId: response.data.historyId!,
    expiration: parseInt(response.data.expiration!),
  };
}

/**
 * Stop watching Gmail mailbox
 */
export async function stopWatchingGmailMailbox(userId: string): Promise<void> {
  const auth = await getGmailClient(userId);

  await gmail.users.stop({
    auth,
    userId: 'me',
  });
}
