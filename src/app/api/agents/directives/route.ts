/**
 * Directives API
 *
 * Returns strategic directives for the user.
 * Supports filtering by blocking status.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getDirectiveHistory, getActiveDirectives } from '@/services/strategic-directives';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const blocking = searchParams.get('blocking') === 'true';

    if (blocking) {
      // Return only blocking directives (pause_applications, focus_shift)
      const directives = await getActiveDirectives(userId, {});

      const blockingTypes = ['pause_applications', 'focus_shift'];
      const blockingDirectives = directives.filter(
        (d) =>
          blockingTypes.includes(d.type) &&
          ['pending', 'active'].includes(d.status)
      );

      return NextResponse.json(blockingDirectives);
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
