# Phase 6: Autonomous Resume & Application System ("AutoResume")

> **Status:** ✅ COMPLETE (All Milestones 1-6 Implemented)
> **Reference Repository:** [aadya940/autoresume](https://github.com/aadya940/autoresume)
> **Goal:** Transform the system from update-based tracking to autonomous career management.
> **Last Updated:** January 6, 2026

---

## 1. Executive Strategy: "Artifact First"
The user has asked the critical question: *Chicken or Egg?* (Resume Agent vs. Action Agent Fixes).

**The Decision:** We will build the **Resume Agent FIRST.**

**Reasoning:**
1.  **Immediate Value:** Even without auto-applying, a "Live Resume Builder" that tailors content to a job description is a high-value feature for the user immediately.
2.  **Dependency Chain:** The Action Agent needs an *artifact* (the PDF) to submit. If we fix the Action Agent first, it has nothing dynamic to send.
3.  **Testing Simplicity:** It is easier to test "Did the PDF generate correctly?" than "Did the headless browser successfully navigate a complex CSRF-protected form?"

---

## 2. Implementation Roadmap (The Definite Sequence)

### Milestone 1: The "Engine" (Python Layer) ✅ COMPLETE
*Objective: Port the LaTeX/Jinja2 output & Browser Automation (Headless) capabilities into our Python Services.*

**Completed Tasks:**
*   ✅ **Task 1.1:** Created `python-services/career-automation/` unified service.
*   ✅ **Task 1.2:** Created `Dockerfile` with `texlive` (LaTeX) and `playwright` (Browsers).
*   ✅ **Task 1.3:** Ported 4 templates (Modern, Classic, Minimalist, Deedy) to `templates/templates.py`.
*   ✅ **Task 1.4:** Implemented `POST /generate-resume` endpoint (JSON Profile → PDF).
*   ✅ **Task 1.5:** Implemented `POST /apply` endpoint (URL, PDF → Screenshot/Status).
*   ✅ **Task 1.6:** Implemented `POST /jobs/search` endpoint (JobSpy integration).

**Created Files:**
```
python-services/career-automation/
├── Dockerfile                    # LaTeX + Playwright
├── docker-compose.yml            # Easy local deployment
├── requirements.txt              # All dependencies
├── README.md                     # Full documentation
├── templates/
│   ├── templates.py              # 4 LaTeX templates
│   └── __init__.py
├── src/
│   ├── main.py                   # FastAPI endpoints
│   ├── services/
│   │   ├── resume_generator.py   # PDF generation service
│   │   └── __init__.py
│   └── browsers/
│       ├── base.py               # Browser automation base
│       ├── linkedin.py           # LinkedIn Easy Apply
│       ├── indeed.py             # Indeed applications
│       └── __init__.py
└── assets/                       # Generated PDFs & screenshots
```

**API Endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/parse-resume` | POST | Parse PDF/DOCX to JSON |
| `/templates` | GET | List available templates |
| `/generate-resume` | POST | JSON → PDF via LaTeX |
| `/resume/{file_id}` | GET | Download generated PDF |
| `/apply` | POST | Apply to single job |
| `/apply/batch` | POST | Apply to multiple jobs |
| `/jobs/search` | POST | Search jobs via JobSpy |

### Milestone 1.5: Integration Layer ✅ COMPLETE
*Objective: Bridge the Python microservice with the Next.js application.*

**Completed Tasks:**
*   ✅ **Task 1.5.1:** Created TypeScript client `src/lib/services/career-automation-client.ts`
    *   Zod schemas for type-safe API communication
    *   `CareerAutomationClient` class with all endpoint methods
    *   Convenience functions: `generateResume()`, `applyToJob()`, `searchJobs()`
*   ✅ **Task 1.5.2:** Added `CAREER_AUTOMATION_URL` to `.env.example`
*   ✅ **Task 1.5.3:** Created `submit_application` tool for Action Agent
    *   Browser automation for job submissions
    *   Screenshot capture for review
    *   Database status updates
*   ✅ **Task 1.5.4:** Created `generate_latex_resume` tool for Action Agent
    *   Tailored PDF generation from user profile
    *   Job-specific resume customization

**Integration Architecture:**
```
Next.js App ──► CareerAutomationClient ──► Python Service (localhost:8002)
     │                                            │
     ▼                                            ▼
Action Agent Tools                          LaTeX + Playwright
  - submit_application                        - PDF Generation
  - generate_latex_resume                     - Browser Automation
```

### Milestone 2: The "Writer" (Resume Agent) ✅ COMPLETE
*Objective: Create the specialized agent that reasons about *how* to tailor the resume.*

**Completed Tasks:**
*   ✅ **Task 2.1:** Created `src/lib/agents/agents/resume-architect/`
    *   `resume-prompts.ts` - Specialized prompts for resume tailoring
    *   `resume-tools.ts` - 6 tools for resume operations
    *   `resume-architect-agent.ts` - Main agent class with job analysis and tailoring
    *   `index.ts` - Barrel export
*   ✅ **Task 2.2:** Implemented `ResumeTailor` tool
    *   `job_analyzer` - Extracts requirements from job descriptions
    *   `resume_tailor` - Creates tailoring strategy for specific jobs
    *   `bullet_optimizer` - Optimizes individual bullet points with action verbs and metrics
    *   `summary_generator` - Generates professional summaries
    *   `skills_optimizer` - Optimizes skills section ordering and keywords
    *   `tailored_resume_generator` - Generates final PDF with all optimizations
*   ✅ **Task 2.3:** Created Frontend Interface `(dashboard)/resume/builder`
    *   Split screen layout: Form/AI Tailoring (Left) vs. PDF Preview (Right)
    *   `ResumeBuilder` - Main component with template selection
    *   `ResumeForm` - Accordion-based form for all resume sections
    *   `ResumePdfPreview` - PDF viewer with download functionality
    *   `ResumeTailoringPanel` - AI-powered job description analysis and suggestions
    *   API routes: `/api/resume/generate` and `/api/resume/analyze`
    *   Navigation added to sidebar

**Created Files:**
```
src/lib/agents/agents/resume-architect/
├── resume-prompts.ts          # Specialized prompts
├── resume-tools.ts            # 6 resume tools
├── resume-architect-agent.ts  # Main agent class
└── index.ts                   # Barrel export

src/components/resume/
├── resume-builder.tsx         # Main split-screen component
├── resume-form.tsx            # Accordion form for all sections
├── resume-pdf-preview.tsx     # PDF viewer component
├── resume-tailoring-panel.tsx # AI tailoring interface
└── index.ts                   # Barrel export

src/app/(dashboard)/resume/builder/
└── page.tsx                   # Resume builder page

src/app/api/resume/
├── generate/route.ts          # PDF generation API
└── analyze/route.ts           # AI analysis API
```

### Milestone 3: The "Keys" (Identity & Security) ✅ COMPLETE
*Objective: Securely store the session cookies required for the Action Agent to operate.*

**Completed Tasks:**
*   ✅ **Task 3.1:** Created `encrypted_credentials` table in Drizzle schema
    *   Platform enum for LinkedIn, Indeed, Glassdoor, ZipRecruiter, Dice, etc.
    *   Credential status tracking (active, expired, invalid, revoked, pending)
    *   Audit logging for all credential access and modifications
    *   User-scoped credentials with cascade deletion
*   ✅ **Task 3.2:** Built "Connected Accounts" settings UI
    *   Visual connection status for each platform
    *   Connect/Disconnect/Reconnect flows
    *   Platform badges with status indicators
    *   Integrated into Settings page
*   ✅ **Task 3.3:** Implemented AES-256-GCM encryption/decryption
    *   Node.js encryption service with PBKDF2 key derivation (100,000 iterations)
    *   Format: `version:salt:iv:authTag:ciphertext` (all base64 encoded)
    *   High-level credentials service for CRUD operations
    *   REST API for credential management (`/api/credentials`)
*   ✅ **Task 3.4:** Implemented Python decryption service
    *   Python `cryptography` library integration
    *   AES-256-GCM decryption matching Node.js format
    *   Cookie hydration utilities for browser automation
    *   Compatible PBKDF2 key derivation

**Created Files:**
```
src/drizzle/schema/encrypted-credentials.ts    # Database schema
src/lib/security/
├── encryption.ts                              # AES-256-GCM encryption
├── credentials-service.ts                     # High-level CRUD
└── index.ts                                   # Barrel export

src/app/api/credentials/route.ts               # REST API

src/components/settings/
└── connected-accounts.tsx                     # UI component

python-services/career-automation/src/security/
├── encryption.py                              # Python decryption
└── __init__.py
```

**Security Architecture:**
```
User Input (Settings UI)
    ↓
Connected Accounts Component → /api/credentials
    ↓
credentials-service.ts → encryption.ts (Node.js)
    ↓
PostgreSQL (encrypted_credentials table)
    ↓
Python Service → encryption.py (decryption)
    ↓
Browser Automation (Playwright with cookies)
```

### Milestone 4: The "Submitter" (Action Agent Upgrade) ✅ COMPLETE
*Objective: Enable "Hands-free" application submission using the Engine and Keys.*

**Completed Tasks:**
*   ✅ **Task 4.1:** `python-jobspy` already integrated into Python Service (Milestone 1)
    *   JobSpy endpoint: `POST /jobs/search`
    *   Supports Indeed, LinkedIn, Glassdoor scraping
    *   Returns structured job data with descriptions, salaries, dates
*   ✅ **Task 4.2:** Updated `ActionAgent` tools to use encrypted credentials
    *   Modified `submit_application` tool to fetch platform credentials
    *   Auto-detect platform from job URL (LinkedIn, Indeed, Glassdoor)
    *   Decrypt credentials and inject cookies into browser session
    *   Graceful fallback when credentials unavailable
*   ✅ **Task 4.3:** Implemented Hybrid Job Sourcing
    *   Created `hybrid_job_source` tool combining JobSpy + database
    *   50% live results from JobSpy (fresh opportunities)
    *   50% saved results from database (Jooble/Adzuna historical)
    *   Automatic deduplication by company + title
    *   Configurable hours_old filter and result limits

**Implementation Details:**
```typescript
// submit_application tool enhancements (action-tools.ts:783-809)
- Detect platform from job URL
- Fetch encrypted credentials: getCredentialsForPythonService()
- Decrypt cookies and inject into browser session
- Log credential usage for audit trail
- Fallback to public applications if no credentials

// hybrid_job_source tool (action-tools.ts:1031-1176)
- Parallel fetching from JobSpy API and PostgreSQL
- Deduplication logic prevents duplicate applications
- Metrics tracking: jobspy_results vs database_results
- Error resilience: continues if one source fails
```

**Security Flow:**
```
Action Agent → submit_application tool
    ↓
Platform Detection (LinkedIn/Indeed/Glassdoor)
    ↓
credentials-service.getCredentialsForPythonService()
    ↓
Decrypt cookies (AES-256-GCM)
    ↓
Python Service /apply endpoint (with session cookies)
    ↓
Playwright Browser Automation (authenticated session)
```

### Milestone 5: The "Commander" (Strategist Upgrade) ✅ COMPLETE
*Objective: Close the feedback loop and provide higher-level direction.*

**Completed Tasks:**
*   ✅ **Task 5.1:** Implemented `StrategicDirectives` service
    *   `src/services/strategic-directives/index.ts` - Full CRUD + directive templates
    *   Issue, execute, track, and supersede directives
    *   Directive types: focus_shift, skill_priority, ghosting_response, rejection_insight, resume_rewrite, etc.
*   ✅ **Task 5.2:** Built the `GhostingDetector` logic
    *   `src/services/ghosting-detector/index.ts` - Time-based hope decay
    *   Platform-aware response timelines (LinkedIn, Indeed, etc.)
    *   Hope score calculation (0-100%) with decay curves
    *   Auto-detection and notification of ghosted applications
*   ✅ **Task 5.3:** Implemented **Rejection Insight System**
    *   `src/services/rejection-insights/index.ts` - AI-powered email parsing
    *   OpenAI integration for rejection analysis
    *   Skill gap extraction and pattern detection
    *   Actionable recommendations generation
*   ✅ **Task 5.4:** Wired the "Weekly Career Sprint" cron job
    *   `src/trigger/jobs/weekly-career-sprint.ts` - Full orchestration
    *   `weeklyCareerSprint` - Monday 6 AM UTC scheduled job
    *   `dailyGhostingCheck` - Daily 9 AM UTC ghosting detection
    *   `weeklyRejectionAnalysis` - Sunday 8 PM UTC pre-sprint analysis
    *   Strategist → Resume → Action → Report workflow

**Created Files:**
```
src/services/
├── strategic-directives/
│   └── index.ts              # Directive lifecycle management
├── ghosting-detector/
│   └── index.ts              # Hope score & ghosting detection
├── rejection-insights/
│   └── index.ts              # AI rejection parsing
└── agent-notifications/
    └── index.ts              # Agent-specific notifications

src/trigger/jobs/
└── weekly-career-sprint.ts   # Scheduled sprint orchestration
```

### Milestone 6: The "Control Room" (Final UI) ✅ COMPLETE
*Objective: Provide visibility and control over the autonomous actions.*

**Completed Tasks:**
*   ✅ **Task 6.1:** Built `(dashboard)/agent-requests` page
    *   `src/app/(dashboard)/agent-requests/page.tsx` - Control Room page
    *   Agent fleet status monitoring (5 agents)
    *   Sprint control with manual trigger
    *   Quick stats: pending approvals, directives, health score
*   ✅ **Task 6.2:** Created the "Approval Queue" UI
    *   `src/components/agent-control/approval-queue.tsx` - Draft review UI
    *   Individual and bulk approval/rejection
    *   Cover letter editing before submission
    *   Match score and AI reasoning display
*   ✅ **Task 6.3:** Implemented Real-time Notifications
    *   `src/services/agent-notifications/index.ts` - Agent notification service
    *   Sprint completion, directive, ghosting, rejection notifications
    *   Activity feed with real-time updates

**Created Files:**
```
src/app/(dashboard)/agent-requests/
└── page.tsx                  # Agent Control Room page

src/components/agent-control/
├── agent-control-room.tsx    # Main dashboard component
├── approval-queue.tsx        # Draft application review
├── directives-list.tsx       # Strategic directives UI
├── agent-activity-feed.tsx   # Real-time activity log
└── index.ts                  # Barrel export

src/app/api/agents/
├── control-room/
│   ├── stats/route.ts        # Control room statistics
│   ├── agents/route.ts       # Agent status API
│   └── sprint/
│       ├── route.ts          # Sprint status
│       └── trigger/route.ts  # Manual sprint trigger
├── directives/
│   ├── route.ts              # List directives
│   └── [id]/cancel/route.ts  # Cancel directive
└── activity/route.ts         # Activity feed

src/app/api/applications/
├── drafts/route.ts           # Get draft applications
├── bulk-approve/route.ts     # Bulk approve drafts
└── [id]/
    ├── approve/route.ts      # Approve single draft
    └── reject/route.ts       # Reject single draft
```



---

## 3. Architecture Changes

### Python Service Structure
```text
python-services/
  career-automation/        <-- Unified Service
    app.py
    Dockerfile              <-- With LaTeX + Playwright
    requirements.txt        <-- fastAPI, jinja2, jobspy, playwright
    templates/
      resume/
        modern.tex
        classic.tex
    browsers/
      linkedin.py
      indeed.py
```

### New Agent Tools
| Agent | Tool | Purpose |
| :--- | :--- | :--- |
| **Resume** | `generate_latex_resume` | Calls Python service to compile PDF |
| **Resume** | `tailor_content` | Rewrites history to match target job |
| **Action** | `browse_and_apply` | Headless browser submission |
| **Action** | `scrape_job_details` | JobSpy detailed fetch |
| **Strategist** | `issue_directive` | Updates agent behavior config |

---

## 4. Success Criteria
*   **User Story:** "As a user, I wake up on Monday to find 5 tailored applications in 'Draft' state (because the agent hit captchas) and 2 fully 'Submitted', all using a resume that emphasizes the skills I learned last week."
