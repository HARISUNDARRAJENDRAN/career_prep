# Operational Gap Analysis & Final Implementation Checklist

> **Document Version:** 1.0
> **Created:** January 6, 2026
> **Purpose:** Consolidated list of *operational* and *infrastructure* components missing from the codebase that are required to support the new "AutoResume" autonomous architecture.

---

## 1. Identity & Access Management (The "Keys")

**Problem:** The Action Agent (using JobSpy/Playwright) cannot apply to jobs on LinkedIn/Indeed/Glassdoor without being logged in. Our current `users` table only stores Clerk IDs for *our* app.

**Missing Implementation:**
*   **Secure Credential Vault:**
    *   **Schema Update:** Create `encrypted_credentials` table.
        *   `user_id`, `platform` ('linkedin', 'indeed'), `encrypted_session_cookie`, `updated_at`.
    *   **UI Component:** "Connected Accounts" settings page where users can input cookies (or use a browser extension helper to extract them).
    *   **Security:** AES-256 encryption for all stored session tokens. The Python service must decrypt them at runtime in memory only.

---

## 2. Human-in-the-Loop Interface (The "Control Room")

**Problem:** The Action Agent will generate "Draft" applications when it hits blockers (Captchas) or needs confirmation. Currently, we have no UI for the user to see these drafts easily.

**Missing Implementation:**
*   **Agent Approval Queue:**
    *   **New Dashboard Tab:** `/dashboard/agent-requests`.
    *   **cards:** "Action Agent wants to apply to [Google - Senior Eng]. Confidence: 92%. [Approve] | [Edit] | [Reject]".
    *   **Magic Link View:** For "Draft" fallbacks, a button that opens the specific job URL and copies the relevant resume to the clipboard automatically.

*   **Real-time Notification System:**
    *   **Infrastructure:** WebSockets or Server-Sent Events (SSE) to push updates ("Agent is applying now...") to the frontend without page refreshes.
    *   **Integration:** Connect `agent-events` table inserts to a realtime trigger.

---

## 3. Data Engineering Pipelines (The "Memory")

**Problem:** The Strategist Agent needs to "remember" why a user failed previous interviews to guide the Resume Agent. Currently, interview transcripts exist but aren't automatically vectorized for *cross-agent* retrieval.

**Missing Implementation:**
*   **Vector Write Pipeline:**
    *   **Trigger Job:** `on_interview_complete`.
    *   **Action:** Take transcript -> Chunk it -> Generate Embeddings (OpenAI) -> Store in `vectors` table.
    *   **Metadata:** Tag with verified skills and identified gaps.
*   **Rejection Ingestion:**
    *   **Email Parser:** A dedicated service (or SendGrid Inbound Parse / Mailgun) to receive forwarded rejection emails.
    *   **Regex Engine:** Extract company name and sentiment from the forwarded body.

---

## 4. Infrastructure & Deployment (The "Engine")

**Problem:** The new "Resume Agent" and "Action Agent" rely heavily on a Python service that runs a *Wait-heavy* (Headless Browser) and *Compute-heavy* (LaTeX compilation) workload. This is different from a standard Next.js API.

**Missing Implementation:**
*   **Python Worker Hosting:**
    *   The `python-services` folder cannot just be a Vercel serverless function (timeout limits).
    *   **Requirement:** Docker container hosted on Fly.io / Railway / AWS ECS.
    *   **Dependencies:** Must include `playwright-browsers` and `texlive-full` (large image size plan required).
*   **Trigger.dev Production:**
    *   Move from `@trigger.dev/sdk` local stubs to a deployed Trigger.dev cloud project.
    *   Ensure long-running jobs (browser automation can take 5+ mins) are supported.

---

## 5. Summary Checklist for "Go-Live"

| Category | Item | Priority | Status |
| :--- | :--- | :--- | :--- |
| **Security** | Encrypted Credential Vault Table | Critical | 🔴 Missing |
| **UI** | Agent Approval Dashboard | High | 🔴 Missing |
| **Backend** | Vector Embedding Trigger | High | 🟡 Planned |
| ** backend** | Rejection Email Parser | Medium | 🔴 Missing |
| **DevOps** | Python Docker (LaTeX+Playwright) | Critical | 🟡 Planned |
| **DevOps** | Trigger.dev Prod Setup | Critical | 🔴 Missing |
