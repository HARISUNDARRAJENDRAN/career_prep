/**
 * Notifications API
 *
 * GET /api/notifications - Get user notifications
 * POST /api/notifications/read - Mark notification(s) as read
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationCount,
  type NotificationType,
} from '@/services/notifications';

// GET: Fetch user notifications
export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = parseInt(searchParams.get('offset') || '0');
  const unread_only = searchParams.get('unread_only') === 'true';
  const type = searchParams.get('type') as NotificationType | null;

  try {
    const result = await getUserNotifications(userId, {
      limit,
      offset,
      unread_only,
      type: type || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Notifications API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

// POST: Mark notification(s) as read
export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { notification_id, mark_all } = body;

    if (mark_all) {
      const count = await markAllNotificationsAsRead(userId);
      return NextResponse.json({ success: true, marked_count: count });
    }

    if (!notification_id) {
      return NextResponse.json(
        { error: 'notification_id is required' },
        { status: 400 }
      );
    }

    const success = await markNotificationAsRead(notification_id, userId);

    if (!success) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Notifications API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update notification' },
      { status: 500 }
    );
  }
}
