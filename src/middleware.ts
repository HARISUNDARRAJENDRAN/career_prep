import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import arcjet, { shield, detectBot, slidingWindow } from '@arcjet/next';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Initialize Arcjet with security rules
const aj = arcjet({
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

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
]);

export default clerkMiddleware(async (auth, request: NextRequest) => {
  // Apply Arcjet protection first
  const decision = await aj.protect(request);

  // If Arcjet denies the request, return an error response
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

  // Apply Clerk authentication for protected routes
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};