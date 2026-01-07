/**
 * Directives API
 *
 * Returns strategic directives for the user.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getDirectiveHistory } from '@/services/strategic-directives';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { directives } = await getDirectiveHistory(userId, {
      limit: 50,
    });

    return NextResponse.json(directives);
  } catch (error) {
    console.error('[Directives API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch directives' },
      { status: 500 }
    );
  }
}
