# Career Prep

A multi-agent orchestration system designed to bridge the gap between academic learning and professional readiness.

## Overview

Career Prep automates the transition from student to professional by combining emotional intelligence, real-time market sensing, and autonomous execution. Unlike traditional job boards, it establishes capability benchmarks through voice interviews, maintains dynamic roadmaps calibrated by real-time market data, and executes autonomous job hunting.

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16.1, React 19.2 |
| Authentication | Clerk v6.x |
| Database | PostgreSQL + Drizzle ORM |
| Security | Arcjet (Rate limiting, Bot detection) |
| AI/Voice | Hume AI EVI 3 (planned) |
| Styling | Tailwind CSS v4, Shadcn UI |
| File Storage | Vercel Blob |

## Multi-Agent Architecture

1. **Interviewer Agent** - Autonomous agent with iterative refinement, goal decomposition, and three-tier memory (working, episodic, long-term). Uses Hume AI EVI 3 for voice-to-voice "Reality Check" benchmarks and weekly verification. Features graceful degradation when confidence threshold isn't met.
2. **Sentinel Agent** - Autonomous scrapers for Jooble, Adzuna, and GitHub Velocity
3. **Architect Agent** - Generates modular, interleaved roadmaps stored in PostgreSQL
4. **Action Agent** - Autonomous job application via RAG and email thread management
5. **Strategist Agent** - Automated rejection parsing to trigger real-time roadmap re-pathing

### Autonomous Agent Features

The Interviewer Agent implements the full autonomous agent architecture:

| Feature | Description |
|---------|-------------|
| **Iterative Execution** | Loops until 85% confidence threshold or max 5 iterations |
| **Goal Decomposition** | Breaks down analysis into sub-goals with success criteria |
| **Dynamic Tool Selection** | AI-selected tools based on current goal state |
| **Three-Tier Memory** | Working (task), Episodic (past analyses), Long-term (patterns) |
| **State Machine** | 12 explicit states with persistence and resume capability |
| **Graceful Degradation** | Accepts valid output even when confidence threshold isn't fully met |

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Python 3.11+ (for resume parser service)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/career_prep.git
cd career_prep
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.example .env
# Edit .env with your actual values
```

4. Start the PostgreSQL database:
```bash
docker-compose up -d
```

5. Push the database schema:
```bash
npm run db:push
```

6. Start the development server:
```bash
npm run dev
```

7. Start Trigger.dev dev server (in a separate terminal):
```bash
npm run dev:trigger
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Resume Parser Service (Optional)

```bash
cd python-services/resume-parser
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Turbopack |
| `npm run dev:trigger` | Start Trigger.dev dev server for background jobs |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push schema changes to database |
| `npm run db:generate` | Generate migration files |
| `npm run db:migrate` | Run migrations |
| `npm run db:studio` | Open Drizzle Studio |

## Project Structure

```
career_prep/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── api/               # API routes
│   │   │   └── webhooks/      # Clerk webhook handlers
│   │   ├── dashboard/         # Protected dashboard
│   │   ├── onboarding/        # Multi-step onboarding flow
│   │   ├── sign-in/           # Clerk sign-in
│   │   └── sign-up/           # Clerk sign-up
│   ├── components/            # React components
│   │   ├── onboarding/        # Onboarding wizard components
│   │   ├── providers/         # Context providers
│   │   └── ui/                # Shadcn UI components
│   ├── data/env/              # Zod-validated environment variables
│   ├── drizzle/               # Database schema & connection
│   │   ├── schema/            # Table definitions
│   │   └── db.ts              # Database client
│   ├── lib/                   # Utility functions
│   │   └── agents/            # Autonomous agent framework
│   │       ├── core/          # State machine, memory manager
│   │       ├── reasoning/     # Goal decomposer, plan generator, confidence scorer
│   │       ├── tools/         # Tool registry, executor, selector
│   │       └── agents/        # Agent implementations (interviewer, strategist)
│   ├── services/              # External service integrations
│   └── trigger/               # Trigger.dev background jobs
│       └── jobs/              # Job definitions (interview-analyzer, etc.)
├── python-services/           # Python microservices
│   └── resume-parser/         # Resume parsing with OpenAI
├── docs/                      # Documentation
│   └── agentic-improvements/  # Autonomous agent architecture docs
├── docker-compose.yml         # PostgreSQL container
├── drizzle.config.ts          # Drizzle Kit configuration
└── trigger.config.ts          # Trigger.dev configuration
```

## Database Schema

The database supports the multi-agent architecture with 12 tables across 5 domains:

- **User Domain**: `users`, `user_profiles`
- **Interviewer Domain**: `interviews`
- **Architect Domain**: `roadmaps`, `roadmap_modules`, `skills`, `user_skills`, `skill_verifications`
- **Action Domain**: `job_applications`, `application_documents`
- **Market Domain**: `job_listings`, `market_insights`, `application_feedback`

## Environment Variables

See `env.example` for all required environment variables. Key services needed:

- **Clerk**: Authentication ([dashboard.clerk.com](https://dashboard.clerk.com))
- **Arcjet**: Security ([app.arcjet.com](https://app.arcjet.com))
- **Vercel Blob**: File storage (Vercel Dashboard)
- **OpenAI**: Resume parsing ([platform.openai.com](https://platform.openai.com))
- **Trigger.dev**: Background job orchestration ([trigger.dev](https://trigger.dev))

### Required Environment Variables

```env
# Database
DATABASE_URL=postgresql://career_prep:career_prep_password@localhost:5432/career_prep_db

# Authentication
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Background Jobs
TRIGGER_SECRET_KEY=tr_dev_...

# Optional
OPENAI_API_KEY=sk-...
BLOB_READ_WRITE_TOKEN=vercel_blob_...
ARCJET_KEY=ajkey_...
RESUME_PARSER_URL=http://localhost:8001
```

## Setting Up Clerk Webhook

1. Go to Clerk Dashboard → Webhooks
2. Create a new webhook with endpoint: `https://your-domain.com/api/webhooks/clerk`
3. Select events: `user.created`, `user.updated`, `user.deleted`
4. Copy the signing secret to `CLERK_WEBHOOK_SECRET`

## License

This project is private and proprietary.
