/**
 * Gmail OAuth Initiation Endpoint
 *
 * Starts the OAuth flow by redirecting user to Google consent screen
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Generate OAuth URL with required scopes
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Get refresh token
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly', // Read emails
      ],
      state: userId, // Pass userId to identify user in callback
      prompt: 'consent', // Force consent screen to get refresh token
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('[Gmail OAuth] Error generating auth URL:', error);
    return NextResponse.redirect(
      new URL('/settings?error=gmail_auth_failed', request.url)
    );
  }
}
