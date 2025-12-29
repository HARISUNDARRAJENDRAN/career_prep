  # Career Prep - Next Phase Implementation Plan

  ## Current Status (Completed)

  | Component | Status |
  |-----------|--------|
  | Clerk Authentication | ✅ Complete |
  | Arcjet Security (Rate limiting, Bot detection) | ✅ Complete |
  | Environment Validation (t3-env + Zod) | ✅ Complete |
  | Shadcn/Tweakcn Theming + Dark Mode | ✅ Complete |
  | PostgreSQL + Docker Setup | ✅ Complete |
  | Drizzle ORM Schema (All 12 tables) | ✅ Complete |
  | Database Indexes & Constraints | ✅ Complete |
  | Clerk Webhooks (User sync) | ✅ Complete |

  ---

  ## Phase 1: User Onboarding Flow (Priority: HIGH)

  ### Overview
  After a user signs up via Clerk, they are redirected to `/onboarding`. Currently this page is a placeholder. We need to build a multi-step onboarding wizard that collects profile data and stores it in `user_profiles`.

  ### Tasks

  #### 1.1 Add Onboarding State to Users Table
  **File:** `src/drizzle/schema/user.ts`

  Add `onboarding_step` column to track wizard progress:
  ```typescript
  // Add to users table
  onboarding_step: integer('onboarding_step').default(0).notNull(),
  // 0 = not started, 1 = career goals, 2 = experience, etc.
  ```

  **Why:** Step-by-step persistence ensures users return exactly where they left off if they close the tab mid-onboarding.

  #### 1.2 Create Onboarding Wizard Component
  **File:** `src/components/onboarding/onboarding-wizard.tsx`

  - Multi-step form with progress indicator
  - **Auto-save on each step** (persists to DB immediately)
  - Resume from `users.onboarding_step` on page load
  - Steps:
    1. **Welcome** (step 0) - Brief intro to the platform
    2. **Career Goals** (step 1) - Target roles, preferred locations
    3. **Experience** (step 2) - Years of experience, salary expectations
    4. **Education** (step 3) - Degree, institution, field of study
    5. **Work History** (step 4) - Previous roles (optional, can skip)
    6. **Complete** (step 5) - Summary + confirmation

  #### 1.3 Form Validation with Zod
  **File:** `src/lib/validations/onboarding.ts`

  ```typescript
  // Schema for each step
  export const careerGoalsSchema = z.object({
    target_roles: z.array(z.string()).min(1, 'Select at least one role'),
    preferred_locations: z.array(z.string()).min(1, 'Select at least one location'),
  });

  export const experienceSchema = z.object({
    years_of_experience: z.number().min(0).max(50),
    salary_expectation_min: z.number().optional(),
    salary_expectation_max: z.number().optional(),
  });
  // ... etc
  ```

  #### 1.4 Server Actions for Profile Creation
  **File:** `src/app/onboarding/actions.ts`

  - `saveOnboardingStep(step: number, data:
   StepData)` - Upsert into `user_profiles` + update `users.onboarding_step`
  - `completeOnboarding()` - Set `users.onboarding_completed = true`

  #### 1.5 Shadcn Components Needed
  ```bash
  npx shadcn@latest add form input select checkbox textarea progress card stepper
  ```

  #### 1.6 Update Onboarding Page
  **File:** `src/app/onboarding/page.tsx`

  - Check if user already completed onboarding → redirect to dashboard
  - Fetch `users.onboarding_step` to resume from correct step
  - Render `<OnboardingWizard initialStep={step} />` component

  ---

  ## Phase 2: Dashboard Layout & Navigation (Priority: HIGH)

  ### Overview
  Build the main application shell with sidebar navigation, header, and content area.

  ### Tasks

  #### 2.1 Create Dashboard Layout
  **File:** `src/app/(dashboard)/layout.tsx`

  - Sidebar with navigation links
  - Header with user menu, theme toggle, notifications
  - Main content area
  - Mobile-responsive (collapsible sidebar)

  #### 2.2 Dashboard Route Groups
  ```
  src/app/(dashboard)/
  ├── layout.tsx           # Shared dashboard layout
  ├── dashboard/
  │   └── page.tsx         # Overview/home
  ├── roadmap/
  │   └── page.tsx         # Learning roadmap
  ├── interviews/
  │   └── page.tsx         # Interview history
  ├── jobs/
  │   └── page.tsx         # Job applications
  ├── skills/
  │   └── page.tsx         # Skill tracking
  └── settings/
      └── page.tsx         # Already exists, move here
  ```

  #### 2.3 Sidebar Navigation Component
  **File:** `src/components/dashboard/sidebar.tsx`

  Navigation items:
  - Dashboard (Home icon)
  - My Roadmap (Map icon)
  - Interviews (Mic icon)
  - Job Hunt (Briefcase icon)
  - Skills (Award icon)
  - Market Insights (TrendingUp icon)
  - Settings (Settings icon)

  #### 2.4 Shadcn Components Needed
  ```bash
  npx shadcn@latest add sidebar sheet avatar dropdown-menu tooltip
  ```

  ---

  ## Phase 3: Core API Routes (Priority: MEDIUM)

  ### Overview
  Create RESTful API routes for CRUD operations on core entities.

  ### Tasks

  #### 3.1 User Profile API
  **File:** `src/app/api/users/profile/route.ts`
  - `GET` - Fetch current user's profile
  - `PATCH` - Update profile fields

  #### 3.2 Roadmaps API
  **File:** `src/app/api/roadmaps/route.ts`
  - `GET` - List user's roadmaps
  - `POST` - Create new roadmap

  **File:** `src/app/api/roadmaps/[id]/route.ts`
  - `GET` - Get specific roadmap with modules
  - `PATCH` - Update roadmap
  - `DELETE` - Archive roadmap

  #### 3.3 Skills API
  **File:** `src/app/api/skills/route.ts`
  - `GET` - List all skills (master catalog)
  - `POST` - Add skill to user's profile

  **File:** `src/app/api/users/skills/route.ts`
  - `GET` - List user's skills with proficiency
  - `PATCH` - Update skill proficiency

  #### 3.4 Jobs API
  **File:** `src/app/api/jobs/applications/route.ts`
  - `GET` - List user's job applications
  - `POST` - Create new application

  ---

  ## Phase 3.5: Agentic Orchestrator - Message Bus (Priority: CRITICAL)

  ### The Problem
  The five agents (Interviewer, Sentinel, Architect, Action, Strategist) are currently isolated domains. There's no shared state manager or communication layer to let them talk to each other.

  **Example:** The Sentinel Agent finds a trending job on Jooble. How does it:
  - Tell the Architect Agent to add a new skill module to the user's roadmap?
  - Tell the Action Agent to auto-apply to matching jobs?
  - Update the Strategist Agent about market shifts?

  ### The Solution: Background Job Processor

  Next.js Server Actions are limited to 30-60 seconds. High-stakes tasks like "Scraping 500 jobs" or "Parsing 20 rejection emails" need to run in the background without blocking the UI.

  ### Tasks

  #### 3.5.1 Install Background Job Processor
  **Option A: Trigger.dev (Recommended for Vercel)**
  ```bash
  npx trigger.dev@latest init
  ```

  **Option B: BullMQ (Self-hosted/Railway)**
  ```bash
  npm install bullmq ioredis
  ```

  #### 3.5.2 Create Agent Event Types
  **File:** `src/lib/agents/events.ts`

  ```typescript
  export type AgentEvent =
    | { type: 'MARKET_UPDATE'; payload: { skills: string[]; demand_scores: Record<string, number> } }
    | { type: 'JOB_MATCH_FOUND'; payload: { user_id: string; job_listing_id: string; match_score: number } }
    | { type: 'INTERVIEW_COMPLETED'; payload: { interview_id: string; user_id: string } }
    | { type: 'SKILL_VERIFIED'; payload: { user_id: string; skill_id: string; confidence: number } }
    | { type: 'REJECTION_PARSED'; payload: { application_id: string; gaps: string[] } }
    | { type: 'ROADMAP_REPATH_NEEDED'; payload: { user_id: string; reason: string } };
  ```

  #### 3.5.3 Create Agent Message Bus
  **File:** `src/lib/agents/message-bus.ts`

  ```typescript
  import { trigger } from '@trigger.dev/sdk';

  export async function publishAgentEvent(event: AgentEvent) {
    // Log to agent_events table for audit trail
    await db.insert(agentEvents).values({
      event_type: event.type,
      payload: event.payload,
      status: 'pending',
    });

    // Dispatch to appropriate background job
    switch (event.type) {
      case 'INTERVIEW_COMPLETED':
        await trigger.sendEvent('interview.analyze', event.payload);
        break;
      case 'MARKET_UPDATE':
        await trigger.sendEvent('roadmap.repath.check', event.payload);
        break;
      case 'JOB_MATCH_FOUND':
        await trigger.sendEvent('action.auto-apply', event.payload);
        break;
      // ... etc
    }
  }
  ```

  #### 3.5.4 Create Agent Events Table
  **File:** `src/drizzle/schema/agent-events.ts`

  ```typescript
  export const agentEvents = pgTable('agent_events', {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    event_type: varchar('event_type', { length: 50 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: pgEnum('event_status', ['pending', 'processing', 'completed', 'failed']),
    source_agent: varchar('source_agent', { length: 50 }), // e.g., 'sentinel', 'interviewer'
    target_agent: varchar('target_agent', { length: 50 }), // e.g., 'architect', 'action'
    created_at: timestamp('created_at').defaultNow().notNull(),
    processed_at: timestamp('processed_at'),
    error_message: text('error_message'),
  });
  ```

  #### 3.5.5 Background Job Definitions
  **File:** `src/trigger/jobs/`

  ```
  src/trigger/jobs/
  ├── interview-analyzer.ts    # Post-interview skill verification
  ├── market-scraper.ts        # Jooble/Adzuna scraping (can run 10+ mins)
  ├── roadmap-repather.ts      # Re-generate roadmap based on feedback
  ├── auto-applier.ts          # Action Agent job application
  └── rejection-parser.ts      # Strategist Agent email parsing
  ```

  #### 3.5.6 Environment Variables
  ```env
  TRIGGER_API_KEY=
  TRIGGER_API_URL=
  # OR for BullMQ
  REDIS_URL=
  ```

  ---

  ## Phase 3.6: Vector Database - RAG Foundation (Priority: CRITICAL)

  ### The Problem
  For the Action Agent to "auto-apply" intelligently and the Digital Twin to answer recruiter questions, you need semantic search capabilities. Without a Vector DB:
  - Auto-apply can't match resumes to job descriptions intelligently
  - Digital Twin can't retrieve relevant context from interview transcripts
  - Skill gap analysis relies on exact keyword matches (brittle)

  ### The Solution: Vector Database (Pinecone or Supabase pgvector)

  Store embeddings for:
  1. **Resume sections** (parsed into chunks)
  2. **Job descriptions** (from Sentinel Agent scraping)
  3. **Interview transcripts** (for Digital Twin RAG)
  4. **Skill definitions** (for semantic skill matching)

  ### Recommendation: Start with pgvector

  Since PostgreSQL is already running in Docker, **pgvector is the recommended starting point**:
  - Keeps your stack simpler (no additional service to manage)
  - "Summary + Vector" data stays in the same ACID-compliant database
  - Easier local development and testing
  - Can migrate to Pinecone later if scale demands it

  ### Tasks

  #### 3.6.1 Choose Vector DB Provider
  **Option A: pgvector (Recommended for development & simplicity)**
  ```bash
  # Already using PostgreSQL, just enable the extension
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

  **Option B: Pinecone (Recommended for production scale)**
  ```bash
  npm install @pinecone-database/pinecone
  ```

  #### 3.6.2 Create Embedding Service
  **File:** `src/lib/embeddings/embedder.ts`

  ```typescript
  import OpenAI from 'openai';

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  export async function generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536, // Or 3072 for text-embedding-3-large
    });
    return response.data[0].embedding;
  }

  export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions: 1536,
    });
    return response.data.map(d => d.embedding);
  }
  ```

  #### 3.6.3 Vector Store Schema (if using pgvector)
  **File:** `src/drizzle/schema/vectors.ts`

  ```typescript
  import { pgTable, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
  import { vector } from 'drizzle-orm/pg-core'; // Requires drizzle-orm v0.30+

  export const documentEmbeddings = pgTable(
    'document_embeddings',
    {
      id: varchar('id', { length: 36 })
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),

      // Source reference
      source_type: varchar('source_type', { length: 50 }).notNull(), // 'resume', 'job_listing', 'interview_transcript', 'skill'
      source_id: varchar('source_id', { length: 36 }).notNull(),

      // Content
      chunk_text: text('chunk_text').notNull(),
      chunk_index: integer('chunk_index').default(0).notNull(),

      // The actual embedding vector
      embedding: vector('embedding', { dimensions: 1536 }).notNull(),

      // Metadata for filtering
      metadata: jsonb('metadata').$type<{
        user_id?: string;
        skill_ids?: string[];
        created_at?: string;
      }>(),

      // Timestamps
      created_at: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => [
      // HNSW index for fast approximate nearest neighbor search
      index('embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
    ]
  );
  ```

  #### 3.6.4 Pinecone Client (if using Pinecone)
  **File:** `src/lib/embeddings/pinecone.ts`

  ```typescript
  import { Pinecone } from '@pinecone-database/pinecone';

  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

  export const resumeIndex = pinecone.index('career-prep-resumes');
  export const jobsIndex = pinecone.index('career-prep-jobs');
  export const transcriptsIndex = pinecone.index('career-prep-transcripts');

  export async function upsertResume(userId: string, chunks: { text: string; embedding: number[] }[]) {
    await resumeIndex.upsert(
      chunks.map((chunk, i) => ({
        id: `${userId}-${i}`,
        values: chunk.embedding,
        metadata: {
          user_id: userId,
          text: chunk.text,
          chunk_index: i,
        },
      }))
    );
  }

  export async function searchSimilarJobs(embedding: number[], topK = 10) {
    return jobsIndex.query({
      vector: embedding,
      topK,
      includeMetadata: true,
    });
  }
  ```

  #### 3.6.5 Resume Parser & Chunker
  **File:** `src/lib/embeddings/resume-parser.ts`

  ```typescript
  export interface ResumeChunk {
    section: 'summary' | 'experience' | 'education' | 'skills' | 'projects';
    text: string;
    index: number;
  }

  export function parseResumeIntoChunks(resumeText: string): ResumeChunk[] {
    // Split resume into semantic sections
    // Each section becomes a separate chunk for embedding
    // This allows for more precise matching during RAG
  }
  ```

  #### 3.6.6 Job Description Embedder (Background Job)
  **File:** `src/trigger/jobs/embed-job-listings.ts`

  ```typescript
  export const embedJobListings = trigger.defineJob({
    id: 'embed.job-listings',
    name: 'Embed New Job Listings',
    version: '1.0.0',
    trigger: trigger.eventTrigger({ name: 'market.updated' }),
    run: async (payload, io) => {
      // Get new job listings without embeddings
      const newListings = await io.runTask('fetch-new-listings', async () => {
        return db.query.jobListings.findMany({
          where: isNull(jobListings.embedding_id),
          limit: 100,
        });
      });

      // Generate embeddings in batches
      for (const batch of chunk(newListings, 20)) {
        const embeddings = await io.runTask(`embed-batch`, async () => {
          return generateBatchEmbeddings(batch.map(j => `${j.title} ${j.description}`));
        });

        // Store in vector DB
        await io.runTask(`store-embeddings`, async () => {
          await upsertJobEmbeddings(batch, embeddings);
        });
      }
    },
  });
  ```

  #### 3.6.7 Environment Variables
  ```env
  # For Pinecone
  PINECONE_API_KEY=
  PINECONE_ENVIRONMENT=

  # For embeddings
  OPENAI_API_KEY=
  ```

  ---

  ## Phase 4: Drizzle Relations & Query Helpers (Priority: MEDIUM)

  ### Overview
  Define Drizzle relations for clean nested queries using the Relational API.

  ### Tasks

  #### 4.1 Define Relations
  **File:** `src/drizzle/relations.ts`

  ```typescript
  import { relations } from 'drizzle-orm';
  import { users, userProfiles, interviews, roadmaps, ... } from './schema';

  export const usersRelations = relations(users, ({ one, many }) => ({
    profile: one(userProfiles, {
      fields: [users.clerk_id],
      references: [userProfiles.user_id],
    }),
    interviews: many(interviews),
    roadmaps: many(roadmaps),
    skills: many(userSkills),
    applications: many(jobApplications),
  }));

  // ... define all relations
  ```

  #### 4.2 Query Helpers
  **File:** `src/drizzle/queries/users.ts`

  ```typescript
  export async function getUserWithProfile(clerkId: string) {
    return db.query.users.findFirst({
      where: eq(users.clerk_id, clerkId),
      with: {
        profile: true,
        skills: { with: { skill: true } },
      },
    });
  }
  ```

  ---

  ## Phase 5: Hume AI Integration - Interviewer Agent (Priority: HIGH)

  ### Overview
  Integrate Hume AI EVI 3 for voice-to-voice interviews (Reality Check benchmarks).

  ### Tasks

  #### 5.1 Install Hume AI SDK
  ```bash
  npm install @humeai/voice-react
  ```

  #### 5.2 Environment Variables
  ```env
  HUME_API_KEY=
  HUME_SECRET_KEY=
  ```

  #### 5.3 Create Interview Session Handler
  **File:** `src/app/api/interviews/session/route.ts`
  - Generate Hume access token
  - Create interview record in DB
  - Return session config

  #### 5.4 Interview UI Component
  **File:** `src/components/interviews/voice-interview.tsx`
  - Real-time voice interface
  - Emotion display (from Hume)
  - Session status indicators

  #### 5.5 Interview Page
  **File:** `src/app/(dashboard)/interviews/[id]/page.tsx`
  - Active interview session
  - Post-interview summary

  ---

  ## Phase 5.5: Truth Loop - Post-Interview Analysis Service (Priority: CRITICAL)

  ### The Problem
  After a 1-hour Hume interview, we have raw transcript data. But there's no service to:
  1. Compare "Claimed Skills" (from onboarding) vs "Verified Skills" (from interview)
  2. Automatically update `user_skills.verification_metadata`
  3. Trigger roadmap re-pathing if skill gaps are discovered

  ### The Solution: Post-Interview Analyzer

  This is a **background job** (via Trigger.dev/BullMQ) that runs after every interview completion.

  ### Tasks

  #### 5.5.1 Create Interview Analyzer Job
  **File:** `src/trigger/jobs/interview-analyzer.ts`

  ```typescript
  import { trigger } from '@trigger.dev/sdk';
  import { db } from '@/drizzle/db';
  import { interviews, userSkills, skillVerifications } from '@/drizzle/schema';

  export const interviewAnalyzer = trigger.defineJob({
    id: 'interview.analyze',
    name: 'Post-Interview Skill Verification',
    version: '1.0.0',
    trigger: trigger.eventTrigger({
      name: 'interview.completed',
    }),
    run: async (payload, io) => {
      const { interview_id, user_id } = payload;

      // Step 1: Fetch interview transcript from DB
      const interview = await io.runTask('fetch-interview', async () => {
        return db.query.interviews.findFirst({
          where: eq(interviews.id, interview_id),
        });
      });

      // Step 2: Fetch user's claimed skills
      const claimedSkills = await io.runTask('fetch-claimed-skills', async () => {
        return db.query.userSkills.findMany({
          where: eq(userSkills.user_id, user_id),
          with: { skill: true },
        });
      });

      // Step 3: Analyze transcript for skill demonstrations
      const verifiedSkills = await io.runTask('analyze-transcript', async () => {
        // Call AI service (OpenAI/Claude) to extract skill demonstrations
        return analyzeTranscriptForSkills(interview.raw_data.transcript, claimedSkills);
      });

      // Step 4: Update user_skills with verification metadata
      for (const verified of verifiedSkills) {
        await io.runTask(`verify-skill-${verified.skill_id}`, async () => {
          // Insert verification record
          await db.insert(skillVerifications).values({
            user_skill_id: verified.user_skill_id,
            interview_id: interview_id,
            verification_type: verified.type,
            summary: verified.summary,
            raw_data: {
              transcript_snippet: verified.snippet,
              confidence_score: verified.confidence,
            },
          });

          // Update user_skills.verification_metadata
          await db.update(userSkills)
            .set({
              verification_metadata: {
                is_verified: true,
                verification_count: sql`COALESCE((verification_metadata->>'verification_count')::int, 0) + 1`,
                latest_proof: {
                  interview_id,
                  timestamp: new Date().toISOString(),
                  transcript_snippet: verified.snippet,
                  evaluator_confidence: verified.confidence,
                },
              },
              updated_at: new Date(),
            })
            .where(eq(userSkills.id, verified.user_skill_id));
        });
      }

      // Step 5: Check for skill gaps and trigger roadmap repath
      const gaps = findSkillGaps(claimedSkills, verifiedSkills);
      if (gaps.length > 0) {
        await io.sendEvent('roadmap.repath.needed', {
          user_id,
          reason: 'skill_verification_gaps',
          gaps,
        });
      }

      return { verified: verifiedSkills.length, gaps: gaps.length };
    },
  });
  ```

  #### 5.5.2 Skill Gap Detection Logic
  **File:** `src/lib/agents/interviewer/skill-analyzer.ts`

  ```typescript
  interface SkillVerification {
    skill_id: string;
    user_skill_id: string;
    type: 'live_coding' | 'concept_explanation' | 'project_demo';
    confidence: number; // 0-1
    snippet: string;
    summary: string;
  }

  export async function analyzeTranscriptForSkills(
    transcript: Interview['raw_data']['transcript'],
    claimedSkills: UserSkill[]
  ): Promise<SkillVerification[]> {
    // Use Claude/GPT to analyze transcript
    // Returns which claimed skills were actually demonstrated
  }

  export function findSkillGaps(
    claimed: UserSkill[],
    verified: SkillVerification[]
  ): string[] {
    // Skills claimed as 'proficient' or 'expert' but not verified
    const verifiedIds = new Set(verified.map(v => v.skill_id));
    return claimed
      .filter(c =>
        ['proficient', 'expert'].includes(c.proficiency_level) &&
        !verifiedIds.has(c.skill_id)
      )
      .map(c => c.skill_id);
  }
  ```

  #### 5.5.3 Wire Up Interview Completion Trigger
  **File:** `src/app/api/interviews/complete/route.ts`

  ```typescript
  import { publishAgentEvent } from '@/lib/agents/message-bus';

  export async function POST(req: Request) {
    const { interview_id } = await req.json();

    // Mark interview as completed
    await db.update(interviews)
      .set({ status: 'completed', completed_at: new Date() })
      .where(eq(interviews.id, interview_id));

    // Trigger post-interview analysis (runs in background)
    await publishAgentEvent({
      type: 'INTERVIEW_COMPLETED',
      payload: { interview_id, user_id: auth.userId },
    });

    return NextResponse.json({ success: true });
  }
  ```

  ---

  ## Phase 6: Market Intelligence - Sentinel Agent (Priority: MEDIUM)

  ### Overview
  Set up job market scrapers for Jooble/Adzuna APIs as background jobs.

  ### Tasks

  #### 6.1 API Integrations
  **File:** `src/lib/market/jooble.ts`
  **File:** `src/lib/market/adzuna.ts`

  #### 6.2 Background Job for Market Scraping
  **File:** `src/trigger/jobs/market-scraper.ts`

  ```typescript
  export const marketScraper = trigger.defineJob({
    id: 'market.scrape',
    name: 'Daily Market Intelligence Scraper',
    version: '1.0.0',
    trigger: trigger.cronTrigger({
      cron: '0 2 * * *', // Run daily at 2 AM
    }),
    run: async (payload, io) => {
      // Scrape Jooble (can take 5-10 mins)
      const joobleJobs = await io.runTask('scrape-jooble', async () => {
        return scrapeJooble({ limit: 500 });
      });

      // Scrape Adzuna
      const adzunaJobs = await io.runTask('scrape-adzuna', async () => {
        return scrapeAdzuna({ limit: 500 });
      });

      // Bulk insert to job_listings
      await io.runTask('insert-listings', async () => {
        await db.insert(jobListings).values([...joobleJobs, ...adzunaJobs])
          .onConflictDoUpdate({
            target: [jobListings.source, jobListings.external_id],
            set: { updated_at: new Date() },
          });
      });

      // Generate market insights
      await io.runTask('generate-insights', async () => {
        await generateMarketInsights();
      });

      // Publish event for other agents
      await io.sendEvent('market.updated', {
        new_listings: joobleJobs.length + adzunaJobs.length,
      });
    },
  });
  ```

  #### 6.3 Cron Job for Stale Data Cleanup
  **File:** `src/trigger/jobs/market-cleanup.ts`

  ```typescript
  // Clean up expired job listings (older than 7 days)
  export const marketCleanup = trigger.defineJob({
    id: 'market.cleanup',
    trigger: trigger.cronTrigger({ cron: '0 3 * * *' }),
    run: async () => {
      await db.delete(jobListings).where(lt(jobListings.expires_at, new Date()));
    },
  });
  ```

  #### 6.4 Environment Variables
  ```env
  JOOBLE_API_KEY=
  ADZUNA_APP_ID=
  ADZUNA_APP_KEY=
  ```

  ---

  ## Phase 7: Digital Twin Interface - Recruiter View (Priority: HIGH)

  ### The Problem
  The entire system is student-facing. But recruiters need:
  1. A way to **discover** verified candidates
  2. A way to **interact** with a student's Digital Twin (AI-powered Q&A)
  3. **Proof of growth** beyond static resumes

  Without this, the system is a glorified learning platform, not a job-matching engine.

  ### The Solution: Public Profile + Interactive Digital Twin

  Create a public-facing route (`/profile/[username]`) where recruiters can:
  1. View verified skills with proof snippets
  2. See growth trajectory (before/after metrics)
  3. Ask questions to the student's Digital Twin (RAG-powered)
  4. Request an interview or connection

  ### Security Considerations

  **CRITICAL:** Public profiles are prime targets for malicious scrapers and token-drain attacks. Configure Arcjet specifically for these routes:

  ```typescript
  // src/middleware.ts - Add to existing Arcjet config
  const publicProfileRules = arcjet({
    key: process.env.ARCJET_KEY!,
    rules: [
      shield({ mode: 'LIVE' }),
      detectBot({
        mode: 'LIVE',
        allow: ['CATEGORY:SEARCH_ENGINE'], // Allow Google/Bing for SEO
        deny: ['CATEGORY:SCRAPER', 'CATEGORY:AI'],
      }),
      // Stricter rate limit for Digital Twin API
      slidingWindow({
        mode: 'LIVE',
        interval: '1h',
        max: 20, // 20 questions per hour per IP
      }),
    ],
  });
  ```

  **Token-Drain Protection:** The Digital Twin chat endpoint must:
  1. Rate limit by IP (unauthenticated) or user_id (authenticated)
  2. Cap response tokens at 500
  3. Only use **verified transcript snippets** (not raw transcripts) to reduce context window costs and ensure accuracy

  ### Tasks

  #### 7.1 Create Public Profile Route
  **File:** `src/app/profile/[username]/page.tsx`

  ```typescript
  import { db } from '@/drizzle/db';
  import { users, userProfiles, userSkills, skillVerifications } from '@/drizzle/schema';
  import { eq } from 'drizzle-orm';
  import { DigitalTwinChat } from '@/components/digital-twin/chat';
  import { SkillProofCard } from '@/components/profile/skill-proof-card';
  import { GrowthTimeline } from '@/components/profile/growth-timeline';

  interface ProfilePageProps {
    params: Promise<{ username: string }>;
  }

  export default async function PublicProfilePage({ params }: ProfilePageProps) {
    const { username } = await params;

    // Fetch user with profile, skills, and verifications
    const user = await db.query.users.findFirst({
      where: eq(users.username, username),
      with: {
        profile: true,
        skills: {
          with: {
            skill: true,
            verifications: {
              orderBy: (v, { desc }) => [desc(v.verified_at)],
              limit: 3,
            },
          },
        },
      },
    });

    if (!user || !user.profile?.is_public) {
      return <NotFound />;
    }

    return (
      <div className="container mx-auto py-8">
        {/* Profile Header */}
        <ProfileHeader user={user} />

        {/* Verified Skills Grid */}
        <section className="mt-8">
          <h2>Verified Skills</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {user.skills
              .filter(s => s.verification_metadata?.is_verified)
              .map(skill => (
                <SkillProofCard key={skill.id} skill={skill} />
              ))}
          </div>
        </section>

        {/* Growth Timeline */}
        <section className="mt-8">
          <h2>Growth Journey</h2>
          <GrowthTimeline userId={user.clerk_id} />
        </section>

        {/* Digital Twin Chat */}
        <section className="mt-8">
          <h2>Ask {user.first_name}'s Digital Twin</h2>
          <DigitalTwinChat userId={user.clerk_id} />
        </section>
      </div>
    );
  }
  ```

  #### 7.2 Add Username to Users Table
  **File:** `src/drizzle/schema/user.ts`

  ```typescript
  // Add to users table
  username: varchar('username', { length: 50 }).unique(),
  ```

  #### 7.3 Add Public Profile Flag
  **File:** `src/drizzle/schema/user-profiles.ts`

  ```typescript
  // Add to user_profiles table
  is_public: boolean('is_public').default(false).notNull(),
  public_bio: text('public_bio'),
  ```

  #### 7.4 Digital Twin Chat Component
  **File:** `src/components/digital-twin/chat.tsx`

  ```typescript
  'use client';

  import { useState } from 'react';
  import { Input } from '@/components/ui/input';
  import { Button } from '@/components/ui/button';
  import { Card } from '@/components/ui/card';

  interface Message {
    role: 'user' | 'assistant';
    content: string;
  }

  export function DigitalTwinChat({ userId }: { userId: string }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      if (!input.trim()) return;

      const userMessage = input;
      setInput('');
      setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
      setIsLoading(true);

      try {
        const response = await fetch('/api/digital-twin/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, message: userMessage }),
        });

        const data = await response.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } catch (error) {
        console.error('Digital Twin error:', error);
      } finally {
        setIsLoading(false);
      }
    }

    return (
      <Card className="p-4">
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg ${
                msg.role === 'user' ? 'bg-primary/10 ml-8' : 'bg-muted mr-8'
              }`}
            >
              {msg.content}
            </div>
          ))}
          {isLoading && <div className="text-muted-foreground">Thinking...</div>}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about their experience, projects, or skills..."
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading}>
            Ask
          </Button>
        </form>
      </Card>
    );
  }
  ```

  #### 7.5 Digital Twin API Route
  **File:** `src/app/api/digital-twin/chat/route.ts`

  **IMPORTANT:** Only pull **verified snippets** from skill_verifications table, not raw interview transcripts. This:
  - Reduces context window costs (verified snippets are pre-summarized)
  - Ensures accuracy (only proven skills are referenced)
  - Prevents hallucination from unverified claims

  ```typescript
  import { NextResponse } from 'next/server';
  import { db } from '@/drizzle/db';
  import { searchVerifiedContent } from '@/lib/embeddings/search';
  import { generateEmbedding } from '@/lib/embeddings/embedder';
  import OpenAI from 'openai';

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  export async function POST(req: Request) {
    const { userId, message } = await req.json();

    // Generate embedding for the question
    const questionEmbedding = await generateEmbedding(message);

    // RAG: Search ONLY verified content (skill_verifications, not raw transcripts)
    const relevantContext = await searchVerifiedContent(userId, questionEmbedding, {
      sources: ['skill_verification', 'resume'], // NOT 'interview_transcript'
      topK: 5,
      onlyVerified: true, // Critical: filter to verified snippets only
    });

    // Fetch user profile for persona
    const user = await db.query.users.findFirst({
      where: eq(users.clerk_id, userId),
      with: { profile: true },
    });

    // Generate response using RAG context
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are the Digital Twin of ${user?.first_name} ${user?.last_name}, a ${user?.profile?.target_roles?.[0] || 'professional'}.

  Answer questions about their experience, skills, and projects based ONLY on the following verified context. Be conversational but professional. If you don't have information to answer, say so honestly.

  Context from verified interviews and resume:
  ${relevantContext.map(c => c.text).join('\n\n')}`,
        },
        { role: 'user', content: message },
      ],
      max_tokens: 500, // Capped to prevent token drain
    });

    return NextResponse.json({
      reply: completion.choices[0].message.content,
    });
  }
  ```

  #### 7.6 Skill Proof Card Component
  **File:** `src/components/profile/skill-proof-card.tsx`

  ```typescript
  import { Card } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';
  import { CheckCircle } from 'lucide-react';

  interface SkillProofCardProps {
    skill: {
      skill: { name: string; category: string };
      proficiency_level: string;
      verification_metadata: {
        is_verified: boolean;
        verification_count: number;
        latest_proof?: {
          transcript_snippet: string;
          evaluator_confidence: number;
        };
      };
    };
  }

  export function SkillProofCard({ skill }: SkillProofCardProps) {
    const proof = skill.verification_metadata?.latest_proof;

    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">{skill.skill.name}</h3>
            <p className="text-sm text-muted-foreground">{skill.skill.category}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{skill.proficiency_level}</Badge>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </div>
        </div>

        {proof && (
          <div className="mt-3 p-2 bg-muted rounded text-sm">
            <p className="italic">"{proof.transcript_snippet}"</p>
            <p className="text-xs text-muted-foreground mt-1">
              Confidence: {Math.round(proof.evaluator_confidence * 100)}%
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-2">
          Verified {skill.verification_metadata.verification_count} time(s)
        </p>
      </Card>
    );
  }
  ```

  #### 7.7 Growth Timeline Component
  **File:** `src/components/profile/growth-timeline.tsx`

  ```typescript
  import { db } from '@/drizzle/db';
  import { skillVerifications, interviews } from '@/drizzle/schema';
  import { eq, desc } from 'drizzle-orm';

  export async function GrowthTimeline({ userId }: { userId: string }) {
    // Fetch verification history and interview completions
    const milestones = await db.query.skillVerifications.findMany({
      where: eq(skillVerifications.user_id, userId),
      orderBy: [desc(skillVerifications.verified_at)],
      limit: 10,
      with: {
        userSkill: { with: { skill: true } },
        interview: true,
      },
    });

    return (
      <div className="relative border-l-2 border-muted pl-6 space-y-6">
        {milestones.map((milestone) => (
          <div key={milestone.id} className="relative">
            <div className="absolute -left-8 w-4 h-4 rounded-full bg-primary" />
            <div>
              <p className="font-medium">
                Verified: {milestone.userSkill.skill.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {milestone.summary}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(milestone.verified_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }
  ```

  #### 7.8 Recruiter Connection Request
  **File:** `src/drizzle/schema/connections.ts`

  ```typescript
  import { pgTable, varchar, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
  import { users } from './user';

  export const connectionStatusEnum = pgEnum('connection_status', [
    'pending',
    'accepted',
    'declined',
  ]);

  export const connectionRequests = pgTable('connection_requests', {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Recruiter info (external, not a user)
    recruiter_name: varchar('recruiter_name', { length: 255 }).notNull(),
    recruiter_email: varchar('recruiter_email', { length: 255 }).notNull(),
    recruiter_company: varchar('recruiter_company', { length: 255 }),
    recruiter_linkedin: varchar('recruiter_linkedin', { length: 500 }),

    // Target student
    student_id: varchar('student_id', { length: 255 })
      .notNull()
      .references(() => users.clerk_id, { onDelete: 'cascade' }),

    // Request details
    message: text('message'),
    status: connectionStatusEnum('status').default('pending').notNull(),

    // Timestamps
    created_at: timestamp('created_at').defaultNow().notNull(),
    responded_at: timestamp('responded_at'),
  });
  ```

  ---

  ## Revised Implementation Order

  | Order | Phase | Reason |
  |-------|-------|--------|
  | 1 | Phase 1: Onboarding Flow | Users need to complete profile before using the app |
  | 2 | Phase 2: Dashboard Layout | Core navigation structure for all features |
  | 3 | **Phase 3.5: Agentic Orchestrator** | **CRITICAL: Sets up inter-agent communication before building agents** |
  | 4 | **Phase 3.6: Vector Database** | **CRITICAL: RAG foundation required for Action Agent and Digital Twin** |
  | 5 | Phase 4: Drizzle Relations | Required for efficient data fetching |
  | 6 | Phase 3: Core API Routes | Backend for CRUD operations |
  | 7 | Phase 5: Hume AI Integration | Core differentiator (Interviewer Agent) |
  | 8 | **Phase 5.5: Truth Loop** | **CRITICAL: Closes the feedback loop from interviews to roadmaps** |
  | 9 | Phase 6: Market Intelligence | Background data collection |
  | 10 | **Phase 7: Digital Twin Interface** | **Recruiter-facing view with verified skills and RAG-powered Q&A** |

  ---

  ## Immediate Next Step

  **Phase 1: User Onboarding Flow** (with step persistence)

  ### First Commit Goal
  - [ ] Add `onboarding_step` column to `users` table
  - [ ] Install required Shadcn components (form, input, select, stepper, etc.)
  - [ ] Create Zod validation schemas for onboarding
  - [ ] Build multi-step wizard component with auto-save
  - [ ] Create server actions for step-by-step profile creation
  - [ ] Update onboarding page with wizard (resume from saved step)
  - [ ] Add redirect logic (completed → dashboard)

  ---

  ## Architecture Diagram: Agent Communication

  ```
  ┌─────────────────────────────────────────────────────────────────────┐
  │                         MESSAGE BUS (Trigger.dev)                   │
  │                                                                     │
  │  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐        │
  │  │ Sentinel │   │Interviewer│  │ Architect│   │  Action  │        │
  │  │  Agent   │   │   Agent   │  │  Agent   │   │  Agent   │        │
  │  └────┬─────┘   └────┬──────┘  └────┬─────┘   └────┬─────┘        │
  │       │              │              │              │               │
  │       ▼              ▼              ▼              ▼               │
  │  ┌─────────────────────────────────────────────────────────────┐  │
  │  │                    AGENT EVENT QUEUE                         │  │
  │  │  • MARKET_UPDATE        • INTERVIEW_COMPLETED               │  │
  │  │  • JOB_MATCH_FOUND      • SKILL_VERIFIED                    │  │
  │  │  • REJECTION_PARSED     • ROADMAP_REPATH_NEEDED             │  │
  │  └─────────────────────────────────────────────────────────────┘  │
  │                              │                                     │
  │                              ▼                                     │
  │  ┌──────────────────────────────────────────────────────────────┐ │
  │  │                   STRATEGIST AGENT                            │ │
  │  │  (Orchestrates responses, triggers re-pathing, feedback)     │ │
  │  └──────────────────────────────────────────────────────────────┘ │
  └─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │   PostgreSQL DB   │
                      │  (Source of Truth)│
                      └──────────────────┘
  ```

  ---

  ## Questions to Consider

  1. **Background Job Provider**: Trigger.dev (serverless, Vercel-friendly) or BullMQ (self-hosted, more control)?
  2. **Onboarding Steps**: Should education and work history be required or optional?
  3. **Target Roles**: Should we provide a predefined list or allow free-text input?
  4. **Locations**: Should we use an autocomplete API for locations?
  5. **Skip Flow**: Should users be able to skip onboarding and complete later?
  6. **Vector DB Provider**: Pinecone (managed, production-ready) or pgvector (simpler, PostgreSQL-native)?
  7. **Embedding Model**: OpenAI text-embedding-3-small (cheaper, 1536 dims) or text-embedding-3-large (better quality, 3072 dims)?
  8. **Digital Twin Access**: Should recruiters need to create an account, or can they use the public profile freely?
  9. **Rate Limiting Digital Twin**: How many questions can a recruiter ask per day without auth?
  10. **Username Generation**: Auto-generate from name, or let users choose during onboarding?

  ---

  *Plan created: December 2024*
  *Next review: After Phase 1 completion*
