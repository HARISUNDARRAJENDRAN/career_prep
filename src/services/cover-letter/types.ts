/**
 * Cover Letter Generator Types
 */

export interface CoverLetterInput {
  userId: string;
  jobListingId: string;
  matchingSkills: string[];
  missingSkills: string[];
  matchScore: number;
}

export interface CoverLetterOutput {
  coverLetter: string;
  keyPoints: string[];
  customizations: {
    companyName: string;
    roleTitle: string;
    highlightedExperiences: string[];
  };
  wordCount: number;
  generatedAt: Date;
}

export interface JobContext {
  title: string;
  company: string;
  location: string | null;
  description: string;
  requirements: string[];
  remoteType: string | null;
}

export interface ResumeContext {
  chunkText: string;
  section?: string;
  similarity: number;
}
