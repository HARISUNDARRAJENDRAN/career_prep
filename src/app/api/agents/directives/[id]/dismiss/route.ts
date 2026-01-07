/**
 * Dismiss Directive API
 *
 * Dismisses a strategic directive without completing it.
 * The Strategist may re-issue a similar directive in the future.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { cancelDirective } from '@/services/strategic-directives';
import { broadcastDirectiveDismissed } from '@/services/realtime';
import { db } from '@/drizzle/db';
import { strategicDirectives } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify the directive belongs to this user
    const directive = await db.query.strategicDirectives.findFirst({
      where: eq(strategicDirectives.id, id),
    });

    if (!directive) {
      return NextResponse.json({ error: 'Directive not found' }, { status: 404 });
    }

    if (directive.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Cancel/dismiss the directive
    await cancelDirective(id, 'Dismissed by user');

    // Broadcast dismissal event
    broadcastDirectiveDismissed(userId, id, directive.title);

    return NextResponse.json({
      success: true,
      message: 'Directive dismissed',
    });
  } catch (error) {
    console.error('[Dismiss Directive] Error:', error);
    return NextResponse.json(
      { error: 'Failed to dismiss directive' },
      { status: 500 }
    );
  }
}
