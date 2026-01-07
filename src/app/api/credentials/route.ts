import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import {
  listCredentials,
  storeCredentials,
  revokeCredentials,
  deleteCredentials,
  type PlatformCookies,
} from '@/lib/security';
import { type CredentialPlatform } from '@/drizzle/schema';

// ============================================================================
// Schemas
// ============================================================================

const PlatformSchema = z.enum([
  'linkedin',
  'indeed',
  'glassdoor',
  'ziprecruiter',
  'dice',
  'monster',
  'careerbuilder',
  'angellist',
  'wellfound',
  'greenhouse',
  'lever',
  'workday',
  'other',
]);

const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string().optional(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
});

const StoreCredentialsSchema = z.object({
  platform: PlatformSchema,
  cookies: z.array(CookieSchema),
  accountIdentifier: z.string().optional(),
  userAgent: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const DeleteCredentialsSchema = z.object({
  platform: PlatformSchema,
  permanent: z.boolean().default(false),
});

// ============================================================================
// GET - List all credentials for the user
// ============================================================================

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const credentials = await listCredentials(userId);

    return NextResponse.json({
      credentials: credentials.map((cred) => ({
        id: cred.id,
        platform: cred.platform,
        accountIdentifier: cred.accountIdentifier,
        status: cred.status,
        statusMessage: cred.statusMessage,
        lastValidatedAt: cred.lastValidatedAt?.toISOString(),
        lastUsedAt: cred.lastUsedAt?.toISOString(),
        expiresAt: cred.expiresAt?.toISOString(),
        createdAt: cred.createdAt.toISOString(),
        updatedAt: cred.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Failed to list credentials:', error);
    return NextResponse.json(
      { error: 'Failed to list credentials' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Store new credentials
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = StoreCredentialsSchema.parse(body);

    const platformCookies: PlatformCookies = {
      platform: validated.platform,
      cookies: validated.cookies,
      capturedAt: new Date().toISOString(),
      userAgent: validated.userAgent,
    };

    const credential = await storeCredentials(
      userId,
      validated.platform as CredentialPlatform,
      platformCookies,
      validated.accountIdentifier,
      validated.expiresAt ? new Date(validated.expiresAt) : undefined
    );

    return NextResponse.json({
      success: true,
      credential: {
        id: credential.id,
        platform: credential.platform,
        status: credential.status,
        accountIdentifier: credential.accountIdentifier,
      },
    });
  } catch (error) {
    console.error('Failed to store credentials:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to store credentials' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Remove credentials
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = DeleteCredentialsSchema.parse(body);

    if (validated.permanent) {
      // Permanently delete
      const deleted = await deleteCredentials(
        userId,
        validated.platform as CredentialPlatform
      );

      if (!deleted) {
        return NextResponse.json(
          { error: 'Credentials not found' },
          { status: 404 }
        );
      }
    } else {
      // Just revoke (disconnect)
      await revokeCredentials(userId, validated.platform as CredentialPlatform);
    }

    return NextResponse.json({
      success: true,
      message: validated.permanent
        ? 'Credentials permanently deleted'
        : 'Account disconnected',
    });
  } catch (error) {
    console.error('Failed to delete credentials:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete credentials' },
      { status: 500 }
    );
  }
}
