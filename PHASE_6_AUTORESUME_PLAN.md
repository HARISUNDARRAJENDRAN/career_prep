# Phase 6: Autonomous Resume & Application System ("AutoResume")

> **Status:** Planning
> **Reference Repository:** [aadya940/autoresume](https://github.com/aadya940/autoresume)
> **Goal:** Transform the system from update-based tracking to autonomous career management.

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

### Milestone 1: The "Engine" (Python Layer)
*Objective: Port the LaTeX/Jinja2 output & Browser Automation (Headless) capabilities into our Python Services.*
*   **Task 1.1:** Upgrade `python-services/resume-parser` to `career-automation-service`.
*   **Task 1.2:** Update `Dockerfile` to include `texlive-full` (for LaTeX) and `playwright` (for Browsers).
*   **Task 1.3:** Port `autoresume` templates (Clean, Modern, Deedy) to `templates/` directory.
*   **Task 1.4:** Implement `POST /generate-resume` endpoint (Inputs: JSON Profile -> Output: PDF).
*   **Task 1.5:** Implement `POST /apply` endpoint (Input: URL, PDF -> Output: Screenshot/Status).

### Milestone 2: The "Writer" (Resume Agent)
*Objective: Create the specialized agent that reasons about *how* to tailor the resume.*
*   **Task 2.1:** Create `src/lib/agents/agents/resume-architect/`.
*   **Task 2.2:** Implement `ResumeTailor` tool.
    *   Uses LLM to rewrite bullet points: "Make this React experience sound more Senior."
    *   Maps User Skills -> Template Sections.
*   **Task 2.3:** Create Frontend Interface `(dashboard)/resume/builder`.
    *   Split screen: Chat/Form (Left) vs. PDF Preview (Right).

### Milestone 3: The "Keys" (Identity & Security)
*Objective: Securely store the session cookies required for the Action Agent to operate.*
*   **Task 3.1:** Create `encrypted_credentials` table in `drizzle/schema.ts`.
*   **Task 3.2:** Build "Connected Accounts" UI in Settings.
*   **Task 3.3:** Implement secure cookie hydration in the Python Service (decrypt at runtime).

### Milestone 4: The "Submitter" (Action Agent Upgrade)
*Objective: Enable "Hands-free" application submission using the Engine and Keys.*
*   **Task 4.1:** Integrate `python-jobspy` into the Python Service for high-quality scraping.
*   **Task 4.2:** Update `ActionAgent` tools to call the `POST /apply` endpoint with the correct credentials.
*   **Task 4.3:** Hybrid Job Sourcing: Ensure it looks at both **JobSpy Live Results** and **Saved Jobs** (Jooble/Adzuna).

### Milestone 5: The "Commander" (Strategist Upgrade)
*Objective: Close the feedback loop and provide higher-level direction.*
*   **Task 5.1:** Implement `StrategicDirectives` table and system.
*   **Task 5.2:** Build the `GhostingDetector` logic (Time-based decay of application hope).
*   **Task 5.3:** Implement **Rejection Insight System** (Email forwarding or parsing).
*   **Task 5.4:** Wire the "Weekly Career Sprint" cron job (Strategist -> Resume -> Action -> Report).

### Milestone 6: The "Control Room" (Final UI)
*Objective: Provide visibility and control over the autonomous actions.*
*   **Task 6.1:** Build `(dashboard)/agent-requests` page.
*   **Task 6.2:** Create the "Approval Queue" UI for draft applications.
*   **Task 6.3:** Implement Real-time Notifications for agent status updates.



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
