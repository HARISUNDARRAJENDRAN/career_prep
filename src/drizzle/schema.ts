// Schema barrel export
// All table schemas are exported from here for centralized access

// User Domain
export * from './schema/user';
export * from './schema/user-profiles';

// Interviewer Agent Domain
export * from './schema/interviews';

// Architect Agent Domain (Roadmaps & Skills)
export * from './schema/skills';
export * from './schema/roadmaps';

// Action Agent Domain (Job Applications)
export * from './schema/jobs';

// Credentials Domain (Secure Platform Authentication)
export * from './schema/encrypted-credentials';

// Sentinel + Strategist Agents Domain (Market Intelligence)
export * from './schema/market';
export * from './schema/strategic-insights';
export * from './schema/strategic-directives';

// Agent Orchestration Domain (Message Bus)
export * from './schema/agent-events';

// Autonomous Agent Domain (Agentic Architecture)
export * from './schema/agent-memory';
export * from './schema/agent-plans';
export * from './schema/agent-states';

// Notifications Domain
export * from './schema/notifications';

// Vector Embeddings Domain (RAG/pgvector)
export * from './schema/vectors';

// Relations (for Drizzle Relational Queries)
export * from './relations';

