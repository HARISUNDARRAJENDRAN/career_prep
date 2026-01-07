# Browser Automation Integration Plan

> **Document Version:** 1.0  
> **Created:** January 7, 2026  
> **Priority:** P0 (Critical for Demo)  
> **Estimated Effort:** 8-12 hours  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Target Architecture](#3-target-architecture)
4. [Integration Tasks](#4-integration-tasks)
5. [Code Changes Required](#5-code-changes-required)
6. [Testing Strategy](#6-testing-strategy)
7. [Demo Scenario](#7-demo-scenario)
8. [Risk Mitigation](#8-risk-mitigation)

---

## 1. Executive Summary

### Problem Statement
The browser automation infrastructure exists but is **not wired end-to-end**:
- Python service has `/apply` endpoint ✅
- TypeScript `submit_application` tool calls Python service ✅
- **Gap:** Action Agent never actually invokes `submit_application` autonomously
- **Gap:** No visual feedback of browser automation in UI
- **Gap:** No screenshot display for successful/failed applications

### Goal
Complete the pipeline so that when a user clicks "Auto-Apply" or the sprint runs, the system:
1. Generates a tailored resume (LaTeX → PDF)
2. Opens a headless browser
3. Navigates to the job URL
4. Fills the application form
5. Submits (or creates draft if blocked)
6. Shows screenshot proof in the UI

---

## 2. Current State Analysis

### What's Built

| Component | Location | Status |
|-----------|----------|--------|
| Browser Manager | `python-services/career-automation/src/browsers/base.py` | ✅ Complete |
| LinkedIn Applicator | `python-services/career-automation/src/browsers/linkedin.py` | ✅ Complete |
| Indeed Applicator | `python-services/career-automation/src/browsers/indeed.py` | ✅ Complete |
| Generic Applicator | `python-services/career-automation/src/browsers/base.py` | ✅ Complete |
| FastAPI `/apply` endpoint | `python-services/career-automation/src/main.py:270-320` | ✅ Complete |
| `submit_application` tool | `src/lib/agents/agents/action/action-tools.ts:708-850` | ✅ Complete |
| Career Automation Client | `src/lib/services/career-automation-client.ts` | ✅ Complete |
| Auto Applier Trigger Job | `src/trigger/jobs/auto-applier.ts` | ⚠️ Creates draft, doesn't submit |

### What's Missing

| Component | Description | Priority |
|-----------|-------------|----------|
| **Autonomous Submission Trigger** | Auto-applier creates draft but never calls `submit_application` | Critical |
| **Screenshot Display UI** | No component to show application screenshots | High |
| **Application Status SSE** | Real-time updates during browser automation | High |
| **Form Analysis Pre-flight** | `/analyze-form` endpoint exists but not used | Medium |
| **Credential Flow UI** | Users can't input LinkedIn/Indeed session cookies | Medium |

---

## 3. Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BROWSER AUTOMATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────────────────┐  │
│  │ Weekly      │────►│ Auto Applier │────►│ submit_application Tool     │  │
│  │ Sprint      │     │ (Trigger.dev)│     │ (action-tools.ts)           │  │
│  └─────────────┘     └──────────────┘     └──────────────┬──────────────┘  │
│                                                          │                   │
│                                                          ▼                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Python Career Automation Service                   │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │  POST /apply                                                  │   │   │
│  │  │  ┌───────────┐  ┌─────────────┐  ┌─────────────────────────┐ │   │   │
│  │  │  │ Browser   │─►│ Applicator  │─►│ Form Fill + Screenshot  │ │   │   │
│  │  │  │ Manager   │  │ Selection   │  │ + Submit/Draft          │ │   │   │
│  │  │  └───────────┘  └─────────────┘  └─────────────────────────┘ │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                          │                   │
│                                                          ▼                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Response: { status, screenshot_url, fields_filled, message }       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                          │                   │
│                                                          ▼                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  SSE Broadcast: application_submitted / application_draft_created   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                          │                   │
│                                                          ▼                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  UI Update: Agent Control Room → Application Card with Screenshot   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Integration Tasks

### Task 4.1: Wire Auto-Applier to Submit Application Tool
**File:** `src/trigger/jobs/auto-applier.ts`  
**Effort:** 2 hours

Currently at line ~300, the auto-applier creates a `job_applications` record with status `draft` or `applied` based on `require_review` setting. It never actually submits.

**Changes Required:**

```typescript
// After line 307 in auto-applier.ts (after creating application record)

// Step 11: Optionally auto-submit via browser automation
if (!userProfile.auto_apply_require_review) {
  console.log('[Auto Applier] Auto-submitting via browser automation...');
  
  // Broadcast that we're starting automation
  broadcastToUser({
    type: 'application_submitted',
    user_id,
    data: {
      status: 'submitting',
      job_id: job_listing_id,
      company: jobListing.company,
      role: jobListing.title,
      message: 'Browser automation in progress...',
    },
  });

  try {
    // Import the tool executor
    const { executeActionTool } = await import('@/lib/agents/agents/action');
    
    const submissionResult = await executeActionTool('submit_application', {
      user_id,
      job_listing_id,
      application_id: application.id,
      cover_letter: coverLetterResult.content,
      dry_run: false,
    });

    if (submissionResult.status === 'success') {
      // Update application status
      await db.update(jobApplications)
        .set({ 
          status: 'applied',
          applied_at: new Date(),
          raw_data: sql`raw_data || ${JSON.stringify({
            automation: {
              status: 'success',
              screenshot_url: submissionResult.screenshot_url,
              fields_filled: submissionResult.fields_filled,
            }
          })}::jsonb`
        })
        .where(eq(jobApplications.id, application.id));
      
      // Broadcast success
      broadcastToUser({
        type: 'application_submitted',
        user_id,
        data: {
          status: 'success',
          application_id: application.id,
          screenshot_url: submissionResult.screenshot_url,
          company: jobListing.company,
          role: jobListing.title,
        },
      });
    } else {
      // Fallback to draft
      broadcastToUser({
        type: 'application_draft_created',
        user_id,
        data: {
          status: 'draft',
          application_id: application.id,
          reason: submissionResult.message,
          company: jobListing.company,
          role: jobListing.title,
        },
      });
    }
  } catch (error) {
    console.error('[Auto Applier] Browser automation failed:', error);
    // Application remains as draft
  }
}
```

---

### Task 4.2: Create Action Tool Executor
**File:** `src/lib/agents/agents/action/index.ts` (new export)  
**Effort:** 1 hour

Add a function that executes a single action tool by ID:

```typescript
// src/lib/agents/agents/action/executor.ts

import { getActionTools } from './action-tools';

export async function executeActionTool(
  toolId: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const tools = getActionTools();
  const tool = tools.find(t => t.id === toolId);
  
  if (!tool) {
    throw new Error(`Tool ${toolId} not found`);
  }
  
  // Validate input
  const validatedInput = tool.input_schema.parse(input);
  
  // Execute
  return tool.handler(validatedInput);
}
```

---

### Task 4.3: Screenshot Display Component
**File:** `src/components/agent-control/application-screenshot.tsx` (new)  
**Effort:** 1.5 hours

```tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ApplicationScreenshotProps {
  applicationId: string;
  company: string;
  role: string;
  screenshotUrl?: string;
  status: 'success' | 'draft' | 'failed';
  fieldsFilled?: number;
  fieldsMissing?: string[];
  message?: string;
}

export function ApplicationScreenshot({
  applicationId,
  company,
  role,
  screenshotUrl,
  status,
  fieldsFilled = 0,
  fieldsMissing = [],
  message,
}: ApplicationScreenshotProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const statusConfig = {
    success: { icon: CheckCircle, color: 'bg-green-500', label: 'Submitted' },
    draft: { icon: AlertCircle, color: 'bg-yellow-500', label: 'Draft' },
    failed: { icon: AlertCircle, color: 'bg-red-500', label: 'Failed' },
  };
  
  const { icon: StatusIcon, color, label } = statusConfig[status];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Eye className="h-4 w-4" />
          View Proof
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Application: {role} at {company}
            <Badge className={color}>{label}</Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
            <div className="text-center">
              <p className="text-2xl font-bold">{fieldsFilled}</p>
              <p className="text-sm text-muted-foreground">Fields Filled</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{fieldsMissing.length}</p>
              <p className="text-sm text-muted-foreground">Fields Missing</p>
            </div>
            <div className="text-center">
              <StatusIcon className={`h-8 w-8 mx-auto ${status === 'success' ? 'text-green-500' : status === 'draft' ? 'text-yellow-500' : 'text-red-500'}`} />
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          </div>
          
          {/* Missing fields warning */}
          {fieldsMissing.length > 0 && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Missing fields: {fieldsMissing.join(', ')}
              </p>
            </div>
          )}
          
          {/* Message */}
          {message && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
          
          {/* Screenshot */}
          {screenshotUrl ? (
            <div className="relative border rounded-lg overflow-hidden">
              <Image
                src={screenshotUrl}
                alt={`Application screenshot for ${company}`}
                width={1920}
                height={1080}
                className="w-full h-auto"
              />
              <a
                href={screenshotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-2 right-2"
              >
                <Button variant="secondary" size="sm">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 bg-muted rounded-lg">
              <p className="text-muted-foreground">No screenshot available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

### Task 4.4: Update Approval Queue to Show Screenshots
**File:** `src/components/agent-control/approval-queue.tsx`  
**Effort:** 1 hour

Add the screenshot component to each application card in the approval queue.

**Locate the application card rendering and add:**

```tsx
import { ApplicationScreenshot } from './application-screenshot';

// Inside the application card component
{application.raw_data?.automation?.screenshot_url && (
  <ApplicationScreenshot
    applicationId={application.id}
    company={application.company}
    role={application.role}
    screenshotUrl={application.raw_data.automation.screenshot_url}
    status={application.raw_data.automation.status || 'draft'}
    fieldsFilled={application.raw_data.automation.fields_filled}
    fieldsMissing={application.raw_data.automation.fields_missing}
    message={application.raw_data.automation.message}
  />
)}
```

---

### Task 4.5: Serve Screenshots from Python Service
**File:** Python service is already serving `/assets/*`  
**Effort:** 30 minutes (verification + CORS)

The Python service already mounts assets:
```python
# main.py line 83
app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")
```

**Verification needed:**
1. Ensure screenshots are being saved to `ASSETS_DIR`
2. Ensure Next.js can proxy to Python service for assets
3. Add to `next.config.ts`:

```typescript
// next.config.ts
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000', // Python service port
        pathname: '/assets/**',
      },
      // Production URL
      {
        protocol: 'https',
        hostname: process.env.CAREER_AUTOMATION_HOST || 'career-automation.your-domain.com',
        pathname: '/assets/**',
      },
    ],
  },
};
```

---

### Task 4.6: Real-time Application Progress SSE
**File:** `src/services/realtime/index.ts`  
**Effort:** 1 hour

Add a new event type for application progress:

```typescript
// Add to AgentEventType union
| 'application_progress'

// Add broadcast helper
export function broadcastApplicationProgress(
  userId: string,
  data: {
    applicationId: string;
    stage: 'navigating' | 'detecting_form' | 'filling' | 'uploading_resume' | 'submitting' | 'complete';
    progress: number; // 0-100
    message: string;
    company: string;
    role: string;
  }
): void {
  broadcastToUser({
    type: 'application_progress',
    user_id: userId,
    data,
  });
}
```

**Python side (main.py):** Add webhook callback to broadcast progress:

```python
# Add callback URL parameter to /apply endpoint
class ApplyToJobRequest(BaseModel):
    # ... existing fields
    progress_webhook_url: Optional[str] = None

# Inside the apply logic, call webhook at each stage:
async def report_progress(stage: str, progress: int, message: str):
    if request.progress_webhook_url:
        async with httpx.AsyncClient() as client:
            await client.post(request.progress_webhook_url, json={
                'stage': stage,
                'progress': progress,
                'message': message,
            })
```

---

### Task 4.7: Manual Apply Button in Job Card
**File:** `src/components/jobs/job-card.tsx` (or similar)  
**Effort:** 1 hour

Add a button that triggers browser automation for a specific job:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bot, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function AutoApplyButton({ 
  jobListingId, 
  company, 
  role 
}: { 
  jobListingId: string; 
  company: string; 
  role: string;
}) {
  const [isApplying, setIsApplying] = useState(false);

  const handleAutoApply = async () => {
    setIsApplying(true);
    toast.info(`Starting auto-apply to ${company}...`);

    try {
      const response = await fetch('/api/agents/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_listing_id: jobListingId }),
      });

      const result = await response.json();

      if (result.status === 'success') {
        toast.success(`Applied to ${role} at ${company}!`);
      } else if (result.status === 'draft') {
        toast.warning(`Created draft for ${company}. Manual completion required.`);
      } else {
        toast.error(`Failed: ${result.message}`);
      }
    } catch (error) {
      toast.error('Auto-apply failed. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Button 
      onClick={handleAutoApply} 
      disabled={isApplying}
      variant="default"
      className="gap-2"
    >
      {isApplying ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Applying...
        </>
      ) : (
        <>
          <Bot className="h-4 w-4" />
          Auto Apply
        </>
      )}
    </Button>
  );
}
```

---

### Task 4.8: Create Manual Apply API Route
**File:** `src/app/api/agents/apply/route.ts` (new)  
**Effort:** 1 hour

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { jobListings, jobApplications, userProfiles } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { executeActionTool } from '@/lib/agents/agents/action/executor';
import { generateCoverLetter } from '@/services/cover-letter';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { job_listing_id } = body;

  if (!job_listing_id) {
    return NextResponse.json({ error: 'job_listing_id required' }, { status: 400 });
  }

  try {
    // Fetch job
    const job = await db.query.jobListings.findFirst({
      where: eq(jobListings.id, job_listing_id),
    });
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Check for existing application
    const existing = await db.query.jobApplications.findFirst({
      where: eq(jobApplications.job_listing_id, job_listing_id),
    });
    if (existing) {
      return NextResponse.json({ 
        error: 'Already applied', 
        application_id: existing.id 
      }, { status: 409 });
    }

    // Generate cover letter
    const coverLetter = await generateCoverLetter({
      userId,
      jobListingId: job_listing_id,
      matchingSkills: [],
      missingSkills: [],
      matchScore: 80,
    });

    // Create application record
    const [application] = await db
      .insert(jobApplications)
      .values({
        user_id: userId,
        job_listing_id,
        company: job.company,
        role: job.title,
        location: job.location,
        status: 'draft',
        source: 'manual_auto_apply',
      })
      .returning();

    // Execute browser automation
    const result = await executeActionTool('submit_application', {
      user_id: userId,
      job_listing_id,
      application_id: application.id,
      cover_letter: coverLetter.content,
      dry_run: false,
    });

    return NextResponse.json({
      status: result.status,
      application_id: application.id,
      screenshot_url: result.screenshot_url,
      message: result.message,
      fields_filled: result.fields_filled,
      fields_missing: result.fields_missing,
    });

  } catch (error) {
    console.error('[Manual Apply] Error:', error);
    return NextResponse.json({ 
      error: 'Application failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

---

## 5. Code Changes Required

### Summary of Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `src/trigger/jobs/auto-applier.ts` | Modify | Add browser automation call after draft creation |
| `src/lib/agents/agents/action/executor.ts` | Create | Tool executor for direct invocation |
| `src/lib/agents/agents/action/index.ts` | Modify | Export executor |
| `src/components/agent-control/application-screenshot.tsx` | Create | Screenshot viewer component |
| `src/components/agent-control/approval-queue.tsx` | Modify | Add screenshot display |
| `src/app/api/agents/apply/route.ts` | Create | Manual auto-apply endpoint |
| `src/components/jobs/auto-apply-button.tsx` | Create | Manual trigger button |
| `src/services/realtime/index.ts` | Modify | Add application_progress event |
| `next.config.ts` | Modify | Add image remote patterns |

---

## 6. Testing Strategy

### Unit Tests
```typescript
// src/lib/agents/agents/action/__tests__/executor.test.ts
describe('executeActionTool', () => {
  it('should execute submit_application with valid input', async () => {
    const result = await executeActionTool('submit_application', {
      user_id: 'test-user',
      job_listing_id: 'test-job',
      application_id: 'test-app',
      dry_run: true, // Don't actually submit
    });
    
    expect(result.status).toBeDefined();
  });
});
```

### Integration Tests
1. **Python Service Health:** `curl http://localhost:8000/health`
2. **Apply Endpoint (Dry Run):**
   ```bash
   curl -X POST http://localhost:8000/apply \
     -H "Content-Type: application/json" \
     -d '{
       "job_url": "https://www.indeed.com/viewjob?jk=example",
       "profile": {
         "first_name": "Test",
         "last_name": "User",
         "email": "test@example.com",
         "phone": "555-1234"
       },
       "dry_run": true
     }'
   ```

### E2E Test
1. Create test job listing in DB
2. Trigger auto-apply via API
3. Verify:
   - Application record created
   - Screenshot saved
   - SSE event broadcast
   - UI updated

---

## 7. Demo Scenario

### "The 2-Minute Demo"

**Setup:**
1. Pre-seed database with user profile
2. Pre-seed 3 Indeed job listings (Easy Apply supported)
3. Start Python service: `docker-compose up career-automation`

**Script:**
1. Open Agent Control Room (`/dashboard/agent-requests`)
2. Click "Run Sprint" or individual "Auto Apply" button
3. Watch live progress in UI:
   - "Navigating to job page..."
   - "Detecting form fields..."
   - "Filling 8 fields..."
   - "Uploading resume..."
   - "Submitting application..."
4. See screenshot proof appear
5. Show "Successfully applied to 3 jobs in 45 seconds"

**Key Visual Moments:**
- Real-time progress bar
- Screenshot thumbnail appears
- "Applied" badge turns green
- Notification toast

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Indeed/LinkedIn blocks automation | Use realistic user-agent, add delays, implement CAPTCHA fallback to "draft" |
| Python service timeout | Set `maxDuration: 60000` on Trigger.dev job |
| Screenshot storage fills up | Implement 7-day retention cleanup job |
| Rate limiting by job boards | Implement daily per-platform limits (5 LinkedIn, 10 Indeed) |
| Session cookies expire | UI prompt to refresh cookies every 7 days |

---

## Appendix: Environment Variables

```bash
# .env
CAREER_AUTOMATION_URL=http://localhost:8000
CAREER_AUTOMATION_TIMEOUT=60000

# For production
CAREER_AUTOMATION_URL=https://career-automation.railway.app
```

---

## Checklist

- [ ] Task 4.1: Wire auto-applier to submit_application
- [ ] Task 4.2: Create action tool executor
- [ ] Task 4.3: Screenshot display component
- [ ] Task 4.4: Update approval queue
- [ ] Task 4.5: Verify screenshot serving
- [ ] Task 4.6: SSE progress events
- [ ] Task 4.7: Manual apply button
- [ ] Task 4.8: Manual apply API route
- [ ] Integration testing
- [ ] Demo rehearsal
