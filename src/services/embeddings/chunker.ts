/**
 * Text Chunking Utilities
 *
 * Splits text into semantic chunks suitable for embedding.
 * Uses overlapping windows to maintain context across chunks.
 */

import type { TextChunk } from './types';
import crypto from 'crypto';

// Configuration
const DEFAULT_CHUNK_SIZE = 500; // words
const DEFAULT_OVERLAP = 50; // words
const MAX_CHUNK_SIZE = 800; // words - hard limit

/**
 * Split text into overlapping chunks
 */
export function chunkText(
  text: string,
  options: {
    chunkSize?: number;
    overlap?: number;
    section?: TextChunk['section'];
  } = {}
): TextChunk[] {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    overlap = DEFAULT_OVERLAP,
    section,
  } = options;

  // Clean and normalize text
  const cleanedText = text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();

  if (!cleanedText) {
    return [];
  }

  const words = cleanedText.split(/\s+/);
  const chunks: TextChunk[] = [];

  // If text is small enough, return as single chunk
  if (words.length <= chunkSize) {
    return [{
      text: cleanedText,
      index: 0,
      section,
    }];
  }

  // Create overlapping chunks
  let index = 0;
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunkWords = words.slice(i, Math.min(i + chunkSize, words.length));
    const chunkText = chunkWords.join(' ').trim();

    if (chunkText) {
      chunks.push({
        text: chunkText,
        index,
        section,
      });
      index++;
    }

    // Break if we've reached the end
    if (i + chunkSize >= words.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Split resume text into semantic sections and chunk each section
 */
export function chunkResume(resumeText: string): TextChunk[] {
  const chunks: TextChunk[] = [];

  // Define section patterns
  const sectionPatterns: Array<{
    pattern: RegExp;
    section: TextChunk['section'];
  }> = [
    { pattern: /(?:^|\n)(summary|profile|objective|about\s*me?)[\s:]*\n/i, section: 'summary' },
    { pattern: /(?:^|\n)(experience|work\s*history|employment|professional\s*experience)[\s:]*\n/i, section: 'experience' },
    { pattern: /(?:^|\n)(education|academic|qualifications)[\s:]*\n/i, section: 'education' },
    { pattern: /(?:^|\n)(skills|technical\s*skills|competencies|technologies)[\s:]*\n/i, section: 'skills' },
    { pattern: /(?:^|\n)(projects|portfolio|personal\s*projects)[\s:]*\n/i, section: 'projects' },
    { pattern: /(?:^|\n)(certifications?|certificates?|licenses?)[\s:]*\n/i, section: 'certifications' },
    { pattern: /(?:^|\n)(awards?|honors?|achievements?)[\s:]*\n/i, section: 'awards' },
  ];

  // Find all section positions
  const sections: Array<{
    start: number;
    end: number;
    section: TextChunk['section'];
  }> = [];

  for (const { pattern, section } of sectionPatterns) {
    const match = resumeText.match(pattern);
    if (match && match.index !== undefined) {
      sections.push({
        start: match.index,
        end: resumeText.length, // Will be updated
        section,
      });
    }
  }

  // Sort by start position
  sections.sort((a, b) => a.start - b.start);

  // Update end positions
  for (let i = 0; i < sections.length; i++) {
    if (i + 1 < sections.length) {
      sections[i].end = sections[i + 1].start;
    }
  }

  // If no sections found, treat entire text as 'other'
  if (sections.length === 0) {
    return chunkText(resumeText, { section: 'other' });
  }

  // Add content before first section as 'summary' or 'other'
  if (sections[0].start > 0) {
    const preContent = resumeText.slice(0, sections[0].start).trim();
    if (preContent) {
      chunks.push(...chunkText(preContent, { section: 'summary' }));
    }
  }

  // Chunk each section
  let chunkIndex = chunks.length;
  for (const section of sections) {
    const sectionContent = resumeText.slice(section.start, section.end).trim();
    if (sectionContent) {
      const sectionChunks = chunkText(sectionContent, { section: section.section });
      // Re-index chunks
      for (const chunk of sectionChunks) {
        chunk.index = chunkIndex++;
        chunks.push(chunk);
      }
    }
  }

  return chunks;
}

/**
 * Generate a hash for content to detect changes
 */
export function generateContentHash(content: string): string {
  return crypto
    .createHash('sha256')
    .update(content)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Estimate token count for text (rough approximation)
 * OpenAI uses ~4 characters per token for English
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into batches for API calls
 * OpenAI allows up to 2048 embeddings per batch call
 */
export function batchChunks<T>(chunks: T[], batchSize: number = 100): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    batches.push(chunks.slice(i, i + batchSize));
  }
  return batches;
}
