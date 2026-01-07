# Phase 2: Email Monitoring Integration - Setup Guide

## Overview

The email monitoring system automatically tracks your job applications by monitoring your Gmail inbox for:
- ✅ **Application Confirmations**: "We received your application"
- ✅ **Rejection Emails**: "Unfortunately..." → Auto-updates status + parses reason
- ✅ **Interview Invitations**: "Schedule an interview" → Changes status to `interviewing`
- ✅ **Job Offers**: "Pleased to offer..." → Changes status to `offered`

## How It Works

```
User manually applies to job → Clicks "I Applied" in our app
  ↓
Application tracked in DB (status='applied')
  ↓
Hourly Cron Job (Trigger.dev) runs → Fetches last 2 hours of Gmail
  ↓
Email Monitoring Service classifies emails
  ↓
If match found → Updates application status automatically
  ↓
User sees updated status on /jobs/applications
```

---

## Setup Instructions

### 1. Enable Gmail API in Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing: `career-prep`
3. Enable Gmail API:
   - Go to **APIs & Services** → **Library**
   - Search for "Gmail API"
   - Click **Enable**

### 2. Create OAuth2 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Configure OAuth consent screen (if not done):
   - User Type: **External**
   - App name: **Career Prep**
   - Support email: Your email
   - Scopes: Add `gmail.readonly`
   - Test users: Add your Gmail
4. Application type: **Web application**
5. Authorized redirect URIs:
   ```
   http://localhost:3000/api/auth/gmail/callback
   https://your-production-domain.com/api/auth/gmail/callback
   ```
6. Click **Create**
7. Copy `Client ID` and `Client Secret`

### 3. Add Environment Variables

Add to `.env.local`:

```bash
# Gmail API
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/gmail/callback"

# Optional: For Gmail push notifications (advanced)
GMAIL_PUBSUB_TOPIC="projects/your-project/topics/gmail-notifications"
```

### 4. Install Dependencies

```bash
npm install googleapis
npm install date-fns  # For calendar component (already done)
```

### 5. Run Database Migration (if needed)

The `encrypted_credentials` table already exists, but verify:

```bash
npx drizzle-kit push
```

---

## Usage

### Manual Email Sync

Trigger email sync manually via API:

```bash
curl -X POST http://localhost:3000/api/emails/sync \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days_back": 7}'
```

Or create a "Sync Emails" button in the UI (future):

```typescript
const handleSync = async () => {
  const res = await fetch('/api/emails/sync', { method: 'POST' });
  const data = await res.json();
  console.log(`Processed ${data.processed} emails`);
};
```

### Automatic Monitoring

The Trigger.dev scheduled task runs every hour automatically:
- Fetches last 2 hours of Gmail messages
- Processes all users' emails
- Updates application statuses

---

## Email Classification Logic

### Confirmation Patterns
- "application received"
- "thank you for applying"
- "application confirmation"

### Rejection Patterns
- "unfortunately"
- "not moving forward"
- "other candidates"
- "position has been filled"

### Interview Patterns
- "interview invitation"
- "schedule interview"
- "phone screen"

### Offer Patterns
- "job offer"
- "offer letter"
- "pleased to offer"

---

## Application Matching Algorithm

Emails are matched to applications using:

1. **Domain Matching**: Email from `@company.com` → Application to "Company Inc"
2. **Company Name**: Email mentions company name in subject/body
3. **Role + Company**: Both mentioned together
4. **Time Window**: Only matches applications from last 60 days

---

## Database Updates

When email is processed:

### Confirmation Email
```javascript
{
  last_activity_at: email.receivedAt,
  raw_data: {
    confirmation_received: true,
    confirmation_at: "2026-01-07T...",
    email_threads: [{ date, from, subject, body }]
  }
}
```

### Rejection Email
```javascript
{
  status: 'rejected',
  last_activity_at: email.receivedAt,
  raw_data: {
    rejection_type: 'skill_gap',
    rejection_reason: "Needed 5+ years...",
    skill_gaps: [{ skill: "Kubernetes", importance: "high" }],
    rejection_confidence: 0.85
  }
}
```

### Interview Invitation
```javascript
{
  status: 'interviewing',
  raw_data: {
    interview_invited: true,
    interview_invited_at: "2026-01-07T..."
  }
}
```

---

## Testing

### Test Email Classification

```typescript
import { classifyEmail } from '@/services/email-monitoring';

const testEmail = {
  id: 'test-123',
  from: 'recruiter@company.com',
  subject: 'Thank you for applying to Software Engineer',
  body: 'We have received your application and will review it...',
  receivedAt: new Date(),
};

const classification = classifyEmail(testEmail);
console.log(classification); // 'confirmation'
```

### Test Application Matching

```typescript
import { findMatchingApplication } from '@/services/email-monitoring';

const appId = await findMatchingApplication('user_123', testEmail);
console.log(appId); // 'app-uuid-here' or null
```

---

## Security Notes

- ✅ Gmail tokens stored encrypted in `encrypted_credentials` table
- ✅ Uses AES-256-GCM encryption
- ✅ OAuth refresh tokens automatically refresh access tokens
- ✅ Credentials never exposed to client

---

## Future Enhancements

**Phase 3: Advanced Features**
- [ ] Outlook/Office 365 integration
- [ ] Email thread analysis (follow-up detection)
- [ ] Sentiment analysis on rejection emails
- [ ] Auto-reply suggestions
- [ ] Custom email rules per company

**Phase 4: Real-time Updates**
- [ ] Gmail Push Notifications (Pub/Sub)
- [ ] WebSocket updates to UI
- [ ] Instant status changes

---

## Troubleshooting

### "Gmail credentials not found"
→ User hasn't connected Gmail. Need to implement OAuth flow (next step)

### "Token expired"
→ Refresh token invalid. User needs to reconnect Gmail

### "No matching application found"
→ Company name mismatch or email too old (>60 days)
→ Check domain matching logic

---

## Next Steps

1. ✅ Email monitoring service created
2. ✅ Gmail API client created
3. ✅ Sync API route created
4. ✅ Scheduled task created
5. ⏳ **TODO**: Create Gmail OAuth flow UI (`/settings/connect-gmail`)
6. ⏳ **TODO**: Add "Sync Emails" button to Settings
7. ⏳ **TODO**: Test with real Gmail account

---

## Files Created

- `src/services/email-monitoring.ts` - Email classification & processing
- `src/services/gmail-client.ts` - Gmail API integration
- `src/app/api/emails/sync/route.ts` - Manual sync endpoint
- `trigger/email-monitoring.ts` - Hourly scheduled task
