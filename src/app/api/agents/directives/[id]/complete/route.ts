/**
 * Complete Directive API
 *
 * Marks a strategic directive as completed.
 * This is called when a user has fulfilled the directive's requirements.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  startDirectiveExecution,
  completeDirectiveExecution,
} from '@/services/strategic-directives';
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

    // Start execution log
    const { log_id } = await startDirectiveExecution(id, 'user');

    // Complete the directive
    await completeDirectiveExecution(id, log_id, {
      success: true,
      logs: 'Manually marked complete by user',
      execution_time_ms: 0,
    });

    // Broadcast completion event
    broadcastDirectiveDismissed(userId, id, directive.title);

    return NextResponse.json({
      success: true,
      message: 'Directive completed successfully',
    });
  } catch (error) {
    console.error('[Complete Directive] Error:', error);
    return NextResponse.json(
      { error: 'Failed to complete directive' },
      { status: 500 }
    );
  }
}
