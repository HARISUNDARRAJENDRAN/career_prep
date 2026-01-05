/**
 * Cover Letter Generator Service
 *
 * Uses RAG (Retrieval Augmented Generation) to create personalized cover letters.
 *
 * How it works:
 * 1. Retrieves relevant resume sections via vector similarity search
 * 2. Fetches job listing details
 * 3. Combines context with AI prompt
 * 4. Generates tailored cover letter with GPT-4o-mini
 *
 * The result is a cover letter that:
 * - References specific achievements from the user's resume
 * - Addresses the job's actual requirements
 * - Highlights matching skills
 * - Proactively addresses skill gaps
 */

import OpenAI from 'openai';
import { db } from '@/drizzle/db';
import { jobListings, userProfiles } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { findRelevantResumeContext } from '@/services/embeddings';
import { COVER_LETTER_SYSTEM_PROMPT, buildCoverLetterPrompt } from './prompts';
import type { CoverLetterInput, CoverLetterOutput, ResumeContext } from './types';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a personalized cover letter using RAG
 */
export async function generateCoverLetter(
  input: CoverLetterInput
): Promise<CoverLetterOutput> {
  const { userId, jobListingId, matchingSkills, missingSkills, matchScore } = input;

  console.log(`[Cover Letter] Generating for user ${userId}, job ${jobListingId}`);

  // =========================================================================
  // Step 1: Fetch job listing details
  // =========================================================================
  const job = await db.query.jobListings.findFirst({
    where: eq(jobListings.id, jobListingId),
  });

  if (!job) {
    throw new Error(`Job listing not found: ${jobListingId}`);
  }

  const jobContext = {
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.raw_data?.description || '',
    requirements: job.raw_data?.requirements || job.skills_required || [],
    remoteType: job.raw_data?.remote_type || null,
  };

  console.log(`[Cover Letter] Job: ${jobContext.title} at ${jobContext.company}`);

  // =========================================================================
  // Step 2: Retrieve relevant resume context via RAG
  // =========================================================================
  let resumeContextText = '';

  // Check if user has embedded resume
  const userProfile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.user_id, userId),
  });

  if (userProfile?.resume_is_embedded && jobContext.description) {
    console.log('[Cover Letter] Fetching relevant resume context via RAG');

    const relevantChunks = await findRelevantResumeContext(
      userId,
      `${jobContext.title} ${jobContext.description}`,
      5 // Get top 5 most relevant chunks
    );

    if (relevantChunks.length > 0) {
      const contextParts: string[] = [];

      for (const chunk of relevantChunks) {
        const section = (chunk.metadata as ResumeContext['section']) || 'experience';
        contextParts.push(`[${section}] ${chunk.chunkText}`);
      }

      resumeContextText = contextParts.join('\n\n');
      console.log(`[Cover Letter] Found ${relevantChunks.length} relevant resume sections`);
    }
  }

  // Fallback to raw resume text if no embeddings
  if (!resumeContextText && userProfile?.resume_text) {
    console.log('[Cover Letter] Using raw resume text (no embeddings)');
    // Take first 2000 chars as context
    resumeContextText = userProfile.resume_text.slice(0, 2000);
  }

  // =========================================================================
  // Step 3: Build prompt
  // =========================================================================
  const prompt = buildCoverLetterPrompt({
    company: jobContext.company,
    title: jobContext.title,
    location: jobContext.location,
    remoteType: jobContext.remoteType,
    description: jobContext.description,
    requirements: Array.isArray(jobContext.requirements) ? jobContext.requirements : [],
    matchingSkills,
    missingSkills,
    matchScore,
    resumeContext: resumeContextText,
  });

  // =========================================================================
  // Step 4: Generate with GPT-4o-mini
  // =========================================================================
  console.log('[Cover Letter] Calling OpenAI GPT-4o-mini...');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: COVER_LETTER_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  // =========================================================================
  // Step 5: Parse and validate response
  // =========================================================================
  let parsed: {
    coverLetter: string;
    keyPoints: string[];
    customizations: {
      companyName: string;
      roleTitle: string;
      highlightedExperiences: string[];
    };
  };

  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.error('[Cover Letter] Failed to parse JSON response:', content);
    throw new Error('Failed to parse cover letter response');
  }

  // Validate required fields
  if (!parsed.coverLetter || typeof parsed.coverLetter !== 'string') {
    throw new Error('Invalid cover letter response: missing coverLetter');
  }

  const wordCount = parsed.coverLetter.split(/\s+/).length;
  console.log(`[Cover Letter] Generated ${wordCount} word cover letter`);

  return {
    coverLetter: parsed.coverLetter,
    keyPoints: parsed.keyPoints || [],
    customizations: {
      companyName: parsed.customizations?.companyName || jobContext.company,
      roleTitle: parsed.customizations?.roleTitle || jobContext.title,
      highlightedExperiences: parsed.customizations?.highlightedExperiences || [],
    },
    wordCount,
    generatedAt: new Date(),
  };
}

/**
 * Generate a simple cover letter without RAG
 * Used as fallback when embeddings aren't available
 */
export async function generateSimpleCoverLetter(params: {
  company: string;
  title: string;
  location: string | null;
  description: string;
  matchingSkills: string[];
  missingSkills: string[];
  resumeText: string;
}): Promise<CoverLetterOutput> {
  const prompt = buildCoverLetterPrompt({
    company: params.company,
    title: params.title,
    location: params.location,
    remoteType: null,
    description: params.description,
    requirements: [],
    matchingSkills: params.matchingSkills,
    missingSkills: params.missingSkills,
    matchScore: 70,
    resumeContext: params.resumeText.slice(0, 2000),
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: COVER_LETTER_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  const parsed = JSON.parse(content);

  return {
    coverLetter: parsed.coverLetter,
    keyPoints: parsed.keyPoints || [],
    customizations: {
      companyName: params.company,
      roleTitle: params.title,
      highlightedExperiences: parsed.customizations?.highlightedExperiences || [],
    },
    wordCount: parsed.coverLetter.split(/\s+/).length,
    generatedAt: new Date(),
  };
}

// Export types
export type { CoverLetterInput, CoverLetterOutput } from './types';
