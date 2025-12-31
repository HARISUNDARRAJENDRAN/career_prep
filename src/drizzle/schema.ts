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

// Sentinel + Strategist Agents Domain (Market Intelligence)
export * from './schema/market';

// Relations (for Drizzle Relational Queries)
export * from './relations';

