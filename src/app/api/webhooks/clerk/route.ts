import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { users } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import type { WebhookEvent } from '@clerk/nextjs/server';

export async function POST(req: Request) {
  // Get the webhook secret from environment
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('CLERK_WEBHOOK_SECRET is not set');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  // Get the headers for verification
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 }
    );
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    );
  }

  // Handle the webhook event
  const eventType = evt.type;

  try {
    switch (eventType) {
      case 'user.created':
        await handleUserCreated(evt.data);
        break;

      case 'user.updated':
        await handleUserUpdated(evt.data);
        break;

      case 'user.deleted':
        await handleUserDeleted(evt.data);
        break;

      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error handling ${eventType}:`, error);
    return NextResponse.json(
      { error: 'Error processing webhook' },
      { status: 500 }
    );
  }
}

// Handle user.created event
async function handleUserCreated(data: WebhookEvent['data']) {
  if (!('id' in data)) return;

  const { id, email_addresses, first_name, last_name, image_url } = data as {
    id: string;
    email_addresses: Array<{ email_address: string }>;
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
  };

  const primaryEmail = email_addresses?.[0]?.email_address;

  if (!primaryEmail) {
    console.error('No email address found for user:', id);
    return;
  }

  await db.insert(users).values({
    clerk_id: id,
    email: primaryEmail,
    first_name: first_name ?? null,
    last_name: last_name ?? null,
    image_url: image_url ?? null,
    onboarding_completed: false,
  });

  console.log(`User created in database: ${id}`);
}

// Handle user.updated event
async function handleUserUpdated(data: WebhookEvent['data']) {
  if (!('id' in data)) return;

  const { id, email_addresses, first_name, last_name, image_url } = data as {
    id: string;
    email_addresses: Array<{ email_address: string }>;
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
  };

  const primaryEmail = email_addresses?.[0]?.email_address;

  if (!primaryEmail) {
    console.error('No email address found for user:', id);
    return;
  }

  await db
    .update(users)
    .set({
      email: primaryEmail,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      image_url: image_url ?? null,
      updated_at: new Date(),
    })
    .where(eq(users.clerk_id, id));

  console.log(`User updated in database: ${id}`);
}

// Handle user.deleted event
async function handleUserDeleted(data: WebhookEvent['data']) {
  if (!('id' in data)) return;

  const { id } = data as { id: string };

  await db.delete(users).where(eq(users.clerk_id, id));

  console.log(`User deleted from database: ${id}`);
}
