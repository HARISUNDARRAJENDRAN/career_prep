import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { fetchAccessToken } from 'hume';
import { withArcjetProtection } from '@/lib/arcjet';

/**
 * Generate a temporary Hume access token for client-side use.
 * Tokens expire after 30 minutes.
 *
 * This endpoint requires authentication to prevent unauthorized access.
 */
export async function GET(request: NextRequest) {
  // Apply Arcjet protection (rate limiting, bot detection, shield)
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    // Ensure user is authenticated
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if Hume credentials are configured
    const apiKey = process.env.HUME_API_KEY;
    const secretKey = process.env.HUME_SECRET_KEY;

    if (!apiKey || !secretKey) {
      console.error('[Hume Access Token] Missing HUME_API_KEY or HUME_SECRET_KEY');
      return NextResponse.json(
        { error: 'Hume AI is not configured' },
        { status: 503 }
      );
    }

    // Fetch access token from Hume
    const accessToken = await fetchAccessToken({
      apiKey,
      secretKey,
    });

    if (!accessToken) {
      console.error('[Hume Access Token] Failed to fetch access token');
      return NextResponse.json(
        { error: 'Failed to fetch access token' },
        { status: 500 }
      );
    }

    return NextResponse.json({ accessToken });
  } catch (error) {
    console.error('[Hume Access Token] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
