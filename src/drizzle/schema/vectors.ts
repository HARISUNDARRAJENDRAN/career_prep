import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  vector,
} from 'drizzle-orm/pg-core';
import { users } from './user';

// Document embeddings for RAG (pgvector)
// Stores vector embeddings for semantic search across resumes, job listings, and skill verifications
export const documentEmbeddings = pgTable(
  'document_embeddings',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Source reference
    source_type: varchar('source_type', { length: 50 }).notNull(),
    // Types: 'resume', 'job_listing', 'skill_verification', 'interview_transcript'
    source_id: varchar('source_id', { length: 255 }).notNull(),

    // User reference (for user-specific content like resumes and verifications)
    user_id: varchar('user_id', { length: 255 }).references(
      () => users.clerk_id,
      { onDelete: 'cascade' }
    ),

    // Content
    chunk_text: text('chunk_text').notNull(),
    chunk_index: integer('chunk_index').default(0).notNull(),

    // Vector embedding (1536 dimensions for OpenAI text-embedding-3-small)
    embedding: vector('embedding', { dimensions: 1536 }),

    // Metadata for filtering and context
    metadata: jsonb('metadata').$type<{
      // For resumes: section type (matches ResumeSection from resume-parser.ts)
      section?: 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'awards' | 'other';
      // For skill verifications: related skill IDs
      skill_ids?: string[];
      // Whether this content is from verified sources
      verified?: boolean;
      // Additional context
      title?: string;
      company?: string;
      location?: string;
      // For interview transcripts
      interview_type?: 'reality_check' | 'weekly_sprint' | 'mock_interview';
      skills_discussed?: string[];
      duration?: number;
      sync_hash?: string;
    }>(),

    // Timestamps
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // HNSW index for fast cosine similarity search
    index('embedding_cosine_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
    // Regular indexes for filtering
    index('doc_embeddings_source_type_idx').on(table.source_type),
    index('doc_embeddings_user_id_idx').on(table.user_id),
    index('doc_embeddings_source_id_idx').on(table.source_id),
  ]
);

// TypeScript types
export type DocumentEmbedding = typeof documentEmbeddings.$inferSelect;
export type NewDocumentEmbedding = typeof documentEmbeddings.$inferInsert;
