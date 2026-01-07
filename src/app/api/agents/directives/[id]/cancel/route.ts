/**
 * Cancel Directive API
 *
 * Cancels a strategic directive.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { cancelDirective } from '@/services/strategic-directives';

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
    await cancelDirective(id, 'Cancelled by user');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Cancel Directive] Error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel directive' },
      { status: 500 }
    );
  }
}
