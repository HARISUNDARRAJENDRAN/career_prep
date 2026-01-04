/**
 * Test endpoint for Vector DB (pgvector) operations
 *
 * GET /api/test/vectors - Check vector DB status and run tests
 * POST /api/test/vectors - Insert test embeddings and perform similarity search
 *
 * NOTE: This endpoint is for development/testing only.
 * Remove or protect in production.
 */

import { NextResponse } from 'next/server';
import { db } from '@/drizzle/db';
import { documentEmbeddings } from '@/drizzle/schema';
import { eq, sql, cosineDistance, desc } from 'drizzle-orm';

// GET: Check vector DB status
export async function GET() {
  try {
    // Check if pgvector extension is enabled
    const extensionCheck = await db.execute(sql`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname = 'vector'
    `);

    // Count existing embeddings
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(documentEmbeddings);

    // Check for HNSW index
    const indexCheck = await db.execute(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'document_embeddings'
      AND indexname = 'embedding_cosine_idx'
    `);

    return NextResponse.json({
      status: 'healthy',
      pgvector: {
        enabled: extensionCheck.rows.length > 0,
        version: extensionCheck.rows[0]?.extversion || null,
      },
      table: {
        name: 'document_embeddings',
        row_count: Number(count),
      },
      index: {
        hnsw_enabled: indexCheck.rows.length > 0,
        definition: indexCheck.rows[0]?.indexdef || null,
      },
      message: 'Vector DB is properly configured',
    });
  } catch (error) {
    console.error('[Vector Test] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST: Test vector operations (insert + similarity search)
export async function POST() {
  try {
    // Generate mock embeddings (1536 dimensions for OpenAI text-embedding-3-small)
    const generateMockEmbedding = (seed: number): number[] => {
      const embedding: number[] = [];
      for (let i = 0; i < 1536; i++) {
        // Generate deterministic pseudo-random values between -1 and 1
        embedding.push(Math.sin(seed * (i + 1) * 0.001) * 0.5);
      }
      // Normalize the vector
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      return embedding.map(val => val / magnitude);
    };

    // Create test embeddings for different document types
    const testDocuments = [
      {
        source_type: 'resume' as const,
        source_id: 'test-resume-001',
        chunk_text: 'Experienced software engineer with expertise in React, TypeScript, and Node.js. Built scalable microservices and led frontend architecture.',
        chunk_index: 0,
        embedding: generateMockEmbedding(1),
        metadata: { section: 'summary' as const, verified: true },
      },
      {
        source_type: 'job_listing' as const,
        source_id: 'test-job-001',
        chunk_text: 'Senior Frontend Developer needed. Must have React, TypeScript experience. GraphQL knowledge is a plus.',
        chunk_index: 0,
        embedding: generateMockEmbedding(2),
        metadata: { title: 'Senior Frontend Developer', company: 'Tech Corp' },
      },
      {
        source_type: 'job_listing' as const,
        source_id: 'test-job-002',
        chunk_text: 'Backend Engineer position. Python, Django, PostgreSQL required. Machine learning experience preferred.',
        chunk_index: 0,
        embedding: generateMockEmbedding(3),
        metadata: { title: 'Backend Engineer', company: 'Data Inc' },
      },
    ];

    // Insert test embeddings
    const inserted = await db
      .insert(documentEmbeddings)
      .values(testDocuments)
      .returning({ id: documentEmbeddings.id, source_type: documentEmbeddings.source_type });

    console.log(`[Vector Test] Inserted ${inserted.length} test embeddings`);

    // Perform similarity search using the first embedding as query
    const queryEmbedding = generateMockEmbedding(1);

    const similarDocs = await db
      .select({
        id: documentEmbeddings.id,
        source_type: documentEmbeddings.source_type,
        source_id: documentEmbeddings.source_id,
        chunk_text: documentEmbeddings.chunk_text,
        similarity: sql<number>`1 - (${documentEmbeddings.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`,
      })
      .from(documentEmbeddings)
      .orderBy(sql`${documentEmbeddings.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
      .limit(5);

    // Clean up test data
    await db
      .delete(documentEmbeddings)
      .where(
        sql`${documentEmbeddings.source_id} IN ('test-resume-001', 'test-job-001', 'test-job-002')`
      );

    console.log('[Vector Test] Cleaned up test embeddings');

    return NextResponse.json({
      success: true,
      test_results: {
        insert: {
          success: true,
          count: inserted.length,
          documents: inserted,
        },
        similarity_search: {
          success: true,
          query: 'Mock resume embedding (seed: 1)',
          results: similarDocs.map(doc => ({
            id: doc.id,
            source_type: doc.source_type,
            source_id: doc.source_id,
            chunk_preview: doc.chunk_text.substring(0, 100) + '...',
            similarity_score: doc.similarity,
          })),
        },
        cleanup: {
          success: true,
          message: 'Test embeddings deleted',
        },
      },
      message: 'All vector operations completed successfully!',
    });
  } catch (error) {
    console.error('[Vector Test] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
