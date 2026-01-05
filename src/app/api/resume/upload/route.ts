import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { userProfiles } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { withArcjetProtection } from '@/lib/arcjet';
import { embedAndStoreResume } from '@/lib/embeddings';
import crypto from 'crypto';

/**
 * POST /api/resume/upload
 *
 * Upload a resume, parse it, and generate embeddings for RAG.
 * This endpoint is for users who have already completed onboarding
 * and want to update their resume.
 */
export async function POST(request: NextRequest) {
  // Apply Arcjet protection
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('resume') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const validMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!validMimeTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF and DOCX are allowed.' },
        { status: 400 }
      );
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      );
    }

    // Send to Python parsing service or fallback to internal parser
    const parseFormData = new FormData();
    parseFormData.append('file', file);

    const parseUrl = process.env.RESUME_PARSER_URL || 'http://localhost:8001/parse-resume';

    let rawText = '';
    let parsedData: {
      skills: string[];
      projects?: { title: string; description: string }[];
      certifications?: string[];
      languages?: string[];
    } = { skills: [] };

    try {
      // Try Python parser first
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const parseResponse = await fetch(parseUrl, {
        method: 'POST',
        body: parseFormData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (parseResponse.ok) {
        const result = await parseResponse.json();
        rawText = result.raw_text;
        parsedData = {
          skills: result.parsed_data?.skills || [],
          projects: result.parsed_data?.projects,
          certifications: result.parsed_data?.certifications,
          languages: result.parsed_data?.languages,
        };
      } else {
        throw new Error('Python parser returned error');
      }
    } catch (parseError) {
      // Fallback to internal OpenAI parser
      console.log('Python parser unavailable, using internal parser...');

      const internalResponse = await fetch(
        new URL('/api/parse-resume', request.url),
        {
          method: 'POST',
          body: parseFormData,
        }
      );

      if (!internalResponse.ok) {
        throw new Error('Failed to parse resume');
      }

      const result = await internalResponse.json();
      rawText = result.raw_text;
      parsedData = {
        skills: result.parsed_data?.skills || [],
        projects: result.parsed_data?.projects,
        certifications: result.parsed_data?.certifications,
        languages: result.parsed_data?.languages,
      };
    }

    if (!rawText) {
      return NextResponse.json(
        { error: 'Failed to extract text from resume' },
        { status: 400 }
      );
    }

    // Update user profile with resume data
    await db
      .update(userProfiles)
      .set({
        resume_filename: file.name,
        resume_text: rawText,
        resume_parsed_data: parsedData,
        resume_uploaded_at: new Date(),
        resume_is_embedded: false, // Will be set to true after embedding
        resume_vector_metadata: {
          last_sync_hash: crypto.createHash('sha256').update(rawText).digest('hex'),
        },
        updated_at: new Date(),
      })
      .where(eq(userProfiles.user_id, userId));

    // Generate and store embeddings
    try {
      const { chunkCount } = await embedAndStoreResume(userId, rawText);

      // Update profile to mark as embedded
      await db
        .update(userProfiles)
        .set({
          resume_is_embedded: true,
          resume_embedded_at: new Date(),
        })
        .where(eq(userProfiles.user_id, userId));

      return NextResponse.json({
        success: true,
        message: 'Resume uploaded and embedded successfully',
        filename: file.name,
        chunk_count: chunkCount,
        skills_found: parsedData.skills?.length || 0,
      });
    } catch (embedError) {
      console.error('Embedding failed:', embedError);

      // Resume was saved but embedding failed - still a partial success
      return NextResponse.json({
        success: true,
        message: 'Resume uploaded but embedding failed. You can try re-embedding later.',
        filename: file.name,
        embedding_error: embedError instanceof Error ? embedError.message : 'Unknown error',
      });
    }
  } catch (error) {
    console.error('Resume upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload resume' },
      { status: 500 }
    );
  }
}
