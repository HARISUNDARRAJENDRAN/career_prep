import arcjet, { shield, detectBot, slidingWindow } from '@arcjet/next';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Initialize Arcjet with security rules
// Use this in API routes that need protection
export const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  rules: [
    // Shield protects against common attacks (SQL injection, XSS, etc.)
    shield({
      mode: 'LIVE',
    }),
    // Bot detection - allow search engines and monitoring services
    detectBot({
      mode: 'LIVE',
      allow: [
        'CATEGORY:SEARCH_ENGINE', // Google, Bing, etc.
        'CATEGORY:MONITOR',       // Uptime monitoring services
        'CATEGORY:PREVIEW',       // Link previews (Slack, Discord)
      ],
    }),
    // Rate limiting using sliding window algorithm
    slidingWindow({
      mode: 'LIVE',
      interval: '1m',  // 1 minute window
      max: 100,        // Max 100 requests per minute per IP
    }),
  ],
});

// Helper function to apply Arcjet protection in API routes
export async function withArcjetProtection(request: NextRequest) {
  const decision = await aj.protect(request);

  if (decision.isDenied()) {
    if (decision.reason.isRateLimit()) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }
    if (decision.reason.isBot()) {
      return NextResponse.json(
        { error: 'Bot activity detected.' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Access denied.' },
      { status: 403 }
    );
  }

  return null; // No error, continue processing
}

// Export types for use in route handlers
export type { NextRequest };

