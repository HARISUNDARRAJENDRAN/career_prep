/**
 * Notification Service
 *
 * Handles creating, fetching, and managing user notifications.
 * Integrates with the agent event system for automated notifications.
 */

import { db } from '@/drizzle/db';
import {
  notifications,
  notificationPreferences,
} from '@/drizzle/schema';
import { eq, and, desc, sql, lt, isNull, or } from 'drizzle-orm';

// Types
export type NotificationType =
  | 'job_match'
  | 'market_update'
  | 'skill_verified'
  | 'interview_ready'
  | 'roadmap_update'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface CreateNotificationInput {
  user_id: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  action_url?: string;
  action_label?: string;
  metadata?: Record<string, unknown>;
  expires_at?: Date;
}

export interface NotificationWithMeta {
  id: string;
  user_id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  action_url: string | null;
  action_label: string | null;
  is_read: boolean;
  read_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  expires_at: Date | null;
}

/**
 * Create a new notification for a user
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<{ id: string }> {
  // Check user preferences before creating notification
  const prefs = await getUserNotificationPreferences(input.user_id);

  if (prefs) {
    // Check if this notification type is enabled
    switch (input.type) {
      case 'job_match':
        if (!prefs.in_app_job_matches) return { id: '' };
        // Check minimum score threshold
        if (input.metadata?.match_score) {
          const minScore = parseInt(prefs.job_match_min_score || '60');
          if ((input.metadata.match_score as number) < minScore) {
            return { id: '' };
          }
        }
        break;
      case 'market_update':
        if (!prefs.in_app_market_updates) return { id: '' };
        break;
      case 'skill_verified':
        if (!prefs.in_app_skill_verified) return { id: '' };
        break;
      case 'roadmap_update':
        if (!prefs.in_app_roadmap_updates) return { id: '' };
        break;
    }
  }

  const [result] = await db
    .insert(notifications)
    .values({
      user_id: input.user_id,
      type: input.type,
      priority: input.priority || 'normal',
      title: input.title,
      message: input.message,
      action_url: input.action_url,
      action_label: input.action_label,
      metadata: input.metadata,
      expires_at: input.expires_at,
    })
    .returning({ id: notifications.id });

  return { id: result.id };
}

/**
 * Create a job match notification
 */
export async function createJobMatchNotification(params: {
  user_id: string;
  job_id: string;
  job_title: string;
  company: string;
  match_score: number;
  matching_skills: string[];
  missing_skills: string[];
}): Promise<{ id: string }> {
  const { user_id, job_title, company, match_score, matching_skills, missing_skills, job_id } = params;

  const priority: NotificationPriority =
    match_score >= 90 ? 'urgent' :
    match_score >= 80 ? 'high' :
    match_score >= 70 ? 'normal' : 'low';

  return createNotification({
    user_id,
    type: 'job_match',
    priority,
    title: `${match_score}% Match: ${job_title}`,
    message: `${company} is hiring! You match ${matching_skills.length} required skills.`,
    action_url: `/jobs?highlight=${job_id}`,
    action_label: 'View Job',
    metadata: {
      job_id,
      job_title,
      company,
      match_score,
      matching_skills,
      missing_skills,
    },
  });
}

/**
 * Create a market update notification
 */
export async function createMarketUpdateNotification(params: {
  user_id: string;
  trending_skills: string[];
  new_jobs_count: number;
}): Promise<{ id: string }> {
  const { user_id, trending_skills, new_jobs_count } = params;

  return createNotification({
    user_id,
    type: 'market_update',
    priority: 'low',
    title: 'Market Update',
    message: `${new_jobs_count} new jobs added. Trending: ${trending_skills.slice(0, 3).join(', ')}`,
    action_url: '/market-insights',
    action_label: 'View Insights',
    metadata: {
      trending_skills,
      new_jobs_count,
    },
  });
}

/**
 * Get user notifications with pagination
 */
export async function getUserNotifications(
  user_id: string,
  options: {
    limit?: number;
    offset?: number;
    unread_only?: boolean;
    type?: NotificationType;
  } = {}
): Promise<{ notifications: NotificationWithMeta[]; total: number; unread_count: number }> {
  const { limit = 20, offset = 0, unread_only = false, type } = options;

  // Build conditions
  const conditions = [
    eq(notifications.user_id, user_id),
    // Only show non-expired notifications
    or(
      isNull(notifications.expires_at),
      sql`${notifications.expires_at} > NOW()`
    ),
  ];

  if (unread_only) {
    conditions.push(eq(notifications.is_read, false));
  }

  if (type) {
    conditions.push(eq(notifications.type, type));
  }

  // Fetch notifications
  const results = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.created_at))
    .limit(limit)
    .offset(offset);

  // Get total count
  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(...conditions));

  // Get unread count
  const [{ count: unread_count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.user_id, user_id),
        eq(notifications.is_read, false),
        or(
          isNull(notifications.expires_at),
          sql`${notifications.expires_at} > NOW()`
        )
      )
    );

  return {
    notifications: results as NotificationWithMeta[],
    total: Number(total),
    unread_count: Number(unread_count),
  };
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  notification_id: string,
  user_id: string
): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({
      is_read: true,
      read_at: new Date(),
    })
    .where(
      and(
        eq(notifications.id, notification_id),
        eq(notifications.user_id, user_id)
      )
    )
    .returning({ id: notifications.id });

  return result.length > 0;
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(user_id: string): Promise<number> {
  const result = await db
    .update(notifications)
    .set({
      is_read: true,
      read_at: new Date(),
    })
    .where(
      and(
        eq(notifications.user_id, user_id),
        eq(notifications.is_read, false)
      )
    )
    .returning({ id: notifications.id });

  return result.length;
}

/**
 * Delete old notifications (cleanup job)
 */
export async function deleteOldNotifications(days: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const result = await db
    .delete(notifications)
    .where(
      and(
        lt(notifications.created_at, cutoffDate),
        eq(notifications.is_read, true)
      )
    )
    .returning({ id: notifications.id });

  return result.length;
}

/**
 * Get or create user notification preferences
 */
export async function getUserNotificationPreferences(user_id: string) {
  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.user_id, user_id),
  });

  return prefs;
}

/**
 * Update user notification preferences
 */
export async function updateNotificationPreferences(
  user_id: string,
  updates: Partial<{
    in_app_job_matches: boolean;
    in_app_market_updates: boolean;
    in_app_skill_verified: boolean;
    in_app_roadmap_updates: boolean;
    email_job_matches: boolean;
    email_weekly_digest: boolean;
    job_match_min_score: string;
  }>
): Promise<void> {
  const existing = await getUserNotificationPreferences(user_id);

  if (existing) {
    await db
      .update(notificationPreferences)
      .set({
        ...updates,
        updated_at: new Date(),
      })
      .where(eq(notificationPreferences.user_id, user_id));
  } else {
    await db.insert(notificationPreferences).values({
      user_id,
      ...updates,
    });
  }
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadNotificationCount(user_id: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.user_id, user_id),
        eq(notifications.is_read, false),
        or(
          isNull(notifications.expires_at),
          sql`${notifications.expires_at} > NOW()`
        )
      )
    );

  return Number(count);
}
