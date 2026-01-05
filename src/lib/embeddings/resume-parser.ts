/**
 * Resume Parser and Chunker
 * Splits resume text into semantic sections for embedding
 */

export type ResumeSection =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'awards'
  | 'other';

export interface ResumeChunk {
  section: ResumeSection;
  text: string;
  index: number;
}

// Patterns to identify section headers
const SECTION_PATTERNS: Record<ResumeSection, RegExp> = {
  summary:
    /^(?:summary|objective|about\s*me|profile|professional\s*summary|career\s*objective)/i,
  experience:
    /^(?:experience|work\s*experience|employment|work\s*history|professional\s*experience|career\s*history)/i,
  education:
    /^(?:education|academic|degree|university|college|school|qualifications)/i,
  skills:
    /^(?:skills|technical\s*skills|technologies|expertise|competencies|core\s*competencies|abilities)/i,
  projects:
    /^(?:projects|portfolio|work\s*samples|personal\s*projects|side\s*projects)/i,
  certifications:
    /^(?:certifications|certificates|credentials|licenses|accreditations)/i,
  awards: /^(?:awards|honors|achievements|recognition|accomplishments)/i,
  other: /^$/,
};

// Maximum chunk size (characters) - helps with embedding quality
const MAX_CHUNK_SIZE = 2000;

/**
 * Parse resume text into semantic chunks
 * Each section becomes a separate chunk for embedding
 */
export function parseResumeIntoChunks(resumeText: string): ResumeChunk[] {
  if (!resumeText || resumeText.trim().length === 0) {
    return [];
  }

  const chunks: ResumeChunk[] = [];
  let currentSection: ResumeSection = 'summary';
  let currentText = '';
  let chunkIndex = 0;

  const lines = resumeText.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check if this line is a section header
    let isHeader = false;
    for (const [section, pattern] of Object.entries(SECTION_PATTERNS)) {
      if (section === 'other') continue;

      // Section headers are typically short lines matching our patterns
      if (pattern.test(trimmedLine) && trimmedLine.length < 60) {
        // Save the previous section if it has content
        if (currentText.trim().length > 0) {
          chunks.push(...splitIntoChunks(currentSection, currentText, chunkIndex));
          chunkIndex = chunks.length;
        }
        currentSection = section as ResumeSection;
        currentText = '';
        isHeader = true;
        break;
      }
    }

    // Add line to current section (including headers for context)
    if (!isHeader || currentText.length === 0) {
      currentText += line + '\n';
    }
  }

  // Save the final section
  if (currentText.trim().length > 0) {
    chunks.push(...splitIntoChunks(currentSection, currentText, chunkIndex));
  }

  return chunks;
}

/**
 * Split a section into smaller chunks if it exceeds max size
 * Tries to split at sentence or paragraph boundaries
 */
function splitIntoChunks(
  section: ResumeSection,
  text: string,
  startIndex: number
): ResumeChunk[] {
  const trimmedText = text.trim();

  if (trimmedText.length <= MAX_CHUNK_SIZE) {
    return [{ section, text: trimmedText, index: startIndex }];
  }

  const chunks: ResumeChunk[] = [];
  let currentChunk = '';
  let index = startIndex;

  // Split by paragraphs first
  const paragraphs = trimmedText.split(/\n\s*\n/);

  for (const paragraph of paragraphs) {
    if ((currentChunk + '\n\n' + paragraph).length > MAX_CHUNK_SIZE) {
      if (currentChunk.length > 0) {
        chunks.push({ section, text: currentChunk.trim(), index: index++ });
        currentChunk = '';
      }

      // If a single paragraph is too long, split by sentences
      if (paragraph.length > MAX_CHUNK_SIZE) {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          if ((currentChunk + ' ' + sentence).length > MAX_CHUNK_SIZE) {
            if (currentChunk.length > 0) {
              chunks.push({ section, text: currentChunk.trim(), index: index++ });
              currentChunk = '';
            }
          }
          currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
      } else {
        currentChunk = paragraph;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  // Add remaining content
  if (currentChunk.trim().length > 0) {
    chunks.push({ section, text: currentChunk.trim(), index: index });
  }

  return chunks;
}

/**
 * Extract skills list from resume text
 * Returns an array of individual skills
 */
export function extractSkillsList(resumeText: string): string[] {
  const skills: Set<string> = new Set();
  const lines = resumeText.split('\n');
  let inSkillsSection = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check if we're entering skills section
    if (SECTION_PATTERNS.skills.test(trimmedLine) && trimmedLine.length < 60) {
      inSkillsSection = true;
      continue;
    }

    // Check if we're leaving skills section (entering another section)
    for (const [section, pattern] of Object.entries(SECTION_PATTERNS)) {
      if (
        section !== 'skills' &&
        section !== 'other' &&
        pattern.test(trimmedLine) &&
        trimmedLine.length < 60
      ) {
        inSkillsSection = false;
        break;
      }
    }

    // Extract skills from the current line if in skills section
    if (inSkillsSection && trimmedLine.length > 0) {
      // Split by common delimiters
      const potentialSkills = trimmedLine.split(/[,;|•·◦▪▸►]/);

      for (const skill of potentialSkills) {
        const cleanedSkill = skill
          .replace(/[•·◦▪▸►]/g, '')
          .replace(/^\s*[-–—]\s*/, '')
          .trim();

        // Filter out section headers, bullets, and very short/long strings
        if (
          cleanedSkill.length >= 2 &&
          cleanedSkill.length <= 50 &&
          !SECTION_PATTERNS.skills.test(cleanedSkill)
        ) {
          skills.add(cleanedSkill);
        }
      }
    }
  }

  return Array.from(skills);
}

/**
 * Get a summary of the resume structure
 */
export function getResumeStructure(
  chunks: ResumeChunk[]
): Record<ResumeSection, number> {
  const structure: Record<ResumeSection, number> = {
    summary: 0,
    experience: 0,
    education: 0,
    skills: 0,
    projects: 0,
    certifications: 0,
    awards: 0,
    other: 0,
  };

  for (const chunk of chunks) {
    structure[chunk.section]++;
  }

  return structure;
}
