CLAUDE.md — Career Prep
This repository contains the Career Prep project, a multi-agent orchestration system (Next.js 16 / TS) designed to bridge the gap between academic learning and professional readiness.

##Project-context:
Career prep is a multi-agent orchestration system designed to automate the transition from student to professional. Unlike traditional job boards, the system helps to bridge the gap between raw skills and professional oppurtunities by combining emotional intelligence, real-time market sensing, and autonomous execution. It establishes a high-stakes capability benchmark through a Reality-Check Voice Interview, maintains Dynamic Roadmaps calibrated by real-time market data (Jooble/Adzuna), and executes Autonomous Job Hunting. By using Weekly Sprint Interviews and Digital Twins, the system additionally provides recruiters with verified growth metrics and "Proof of Resilience," ensuring students are matched based on true potential rather than static resumes.

##Commands
npm run dev: Start dev server (Turbopack enabled) at http://localhost:3000

npm run build: Production build

npm run lint: ESLint check

npx drizzle-kit push: Push database schema changes to PostgreSQL

##Tech Stack (Dec 2025)
Framework: Next.js 16.1 (Stable) | React 19.2 (Async Params/RSC)

Auth: Clerk v6.x (Async headers & middleware)

Database: PostgreSQL + Drizzle ORM (v0.45+)

Security: Arcjet (Rate limiting, Bot detection, Email validation)

AI/Voice: Hume AI EVI 3 (Interviewer Agent)

Styling: Tailwind CSS v4 (CSS-first config) | Shadcn UI | Geist Font

##Multi-Agent Architecture:

1. Interviewer Agent (User Profiling): Hume AI voice-to-voice for "Reality Check" benchmarks and weekly logic verification.

2. Sentinel Agent (Market Intelligence): Autonomous scrapers for Jooble, Adzuna, and GitHub Velocity.

3. Architect Agent (User Personalized): Generates modular, interleaved roadmaps stored in PostgreSQL.

4. Action Agent (Execution): Autonomous job application via RAG (Vector DB) and email thread management.

5. Strategist Agent (Feedback): Automated rejection parsing to trigger real-time roadmap re-pathing.

📝 Coding Standards & Rules
Next.js 16 / React 19 Patterns
Async Params: Always await the params and searchParams props in Server Components and Layouts.

Server Actions: Use "use server" and wrap critical logic in Arcjet security checks.

Components: Default to Server Components; use "use client" strictly for interactivity or Hume AI hooks.

Data Fetching: Use Drizzle's Relational API (db.query) for clean, nested data fetching.

Styling & UI
Tailwind v4: Use CSS variables in globals.css with the @theme directive. Avoid legacy tailwind.config.js.

Validation: Use Zod for all environment variables, API payloads, and form schemas.

Database & Auth
Middleware: clerkMiddleware() protects all routes except / and /api/webhooks.

Naming: Snake_case for DB columns, camelCase for TypeScript fields.