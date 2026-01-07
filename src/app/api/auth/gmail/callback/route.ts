/**
 * Gmail OAuth Callback Handler
 *
 * Receives authorization code from Google and exchanges it for tokens.
 * Stores encrypted tokens in database for email monitoring.
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { db } from '@/drizzle/db';
import { encryptedCredentials } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { encrypt } from '@/lib/security/encryption';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId from initiation
  const error = searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    console.error('[Gmail OAuth] Error from Google:', error);
    return NextResponse.redirect(
      new URL('/settings?error=gmail_permission_denied', request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings?error=gmail_missing_code', request.url)
    );
  }

  const userId = state;

  try {
    // Exchange authorization code for tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user's Gmail address for account identification
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const emailAddress = profile.data.emailAddress;

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Missing required tokens');
    }

    // Prepare credentials object
    const credentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || 'Bearer',
      expiry_date: tokens.expiry_date || Date.now() + 3600 * 1000,
      scope: tokens.scope || 'https://www.googleapis.com/auth/gmail.readonly',
    };

    // Encrypt credentials
    const encryptedData = encrypt(credentials);

    // Store in database (upsert)
    const existing = await db.query.encryptedCredentials.findFirst({
      where: eq(encryptedCredentials.user_id, userId),
    });

    if (existing) {
      // Update existing credential
      await db
        .update(encryptedCredentials)
        .set({
          encrypted_data: encryptedData,
          account_identifier: emailAddress || null,
          status: 'active',
          status_message: 'Gmail connected successfully',
          last_validated_at: new Date(),
          expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          updated_at: new Date(),
        })
        .where(eq(encryptedCredentials.id, existing.id));
    } else {
      // Create new credential
      await db.insert(encryptedCredentials).values({
        user_id: userId,
        platform: 'gmail',
        encrypted_data: encryptedData,
        account_identifier: emailAddress || null,
        status: 'active',
        status_message: 'Gmail connected successfully',
        last_validated_at: new Date(),
        expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      });
    }

    console.log(`[Gmail OAuth] Successfully connected Gmail for user ${userId}`);

    // Redirect to settings with success message
    return NextResponse.redirect(
      new URL('/settings?success=gmail_connected', request.url)
    );
  } catch (error) {
    console.error('[Gmail OAuth] Error exchanging code for tokens:', error);
    return NextResponse.redirect(
      new URL(
        `/settings?error=gmail_token_exchange_failed&message=${encodeURIComponent((error as Error).message)}`,
        request.url
      )
    );
  }
}
