/**
 * Career Automation Service Client
 *
 * TypeScript client for the Python Career Automation microservice.
 * Provides resume generation, job application automation, and job search.
 *
 * @see python-services/career-automation/README.md
 */

import { z } from 'zod';

// ============================================================================
// Configuration
// ============================================================================

const CAREER_AUTOMATION_URL =
  process.env.CAREER_AUTOMATION_URL || 'http://localhost:8002';

// ============================================================================
// Request/Response Schemas
// ============================================================================

// Resume Generation
export const SkillsDataSchema = z.object({
  technical: z.array(z.string()).default([]),
  soft: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
});

export const ExperienceItemSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  start_date: z.string(),
  end_date: z.string().default('Present'),
  bullets: z.array(z.string()).default([]),
});

export const EducationItemSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string().optional(),
  graduation_date: z.string(),
  gpa: z.string().optional(),
  coursework: z.string().optional(),
});

export const ProjectItemSchema = z.object({
  name: z.string(),
  date: z.string().optional(),
  url: z.string().optional(),
  technologies: z.array(z.string()).default([]),
  bullets: z.array(z.string()).default([]),
});

export const CertificationItemSchema = z.object({
  name: z.string(),
  issuer: z.string(),
  date: z.string(),
});

export const ResumeProfileSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string().optional(),
  linkedin: z.string().optional(),
  linkedin_username: z.string().optional(),
  github: z.string().optional(),
  github_username: z.string().optional(),
  portfolio: z.string().optional(),
  summary: z.string().optional(),
  experience: z.array(ExperienceItemSchema).default([]),
  education: z.array(EducationItemSchema).default([]),
  skills: SkillsDataSchema.optional(),
  projects: z.array(ProjectItemSchema).default([]),
  certifications: z.array(CertificationItemSchema).default([]),
});

export const ResumeGenerationRequestSchema = z.object({
  profile: ResumeProfileSchema,
  template: z.string().default('modern'),
  job_title: z.string().optional(),
  job_description: z.string().optional(),
  job_company: z.string().optional(),
});

export const ResumeGenerationResponseSchema = z.object({
  success: z.boolean(),
  pdf_path: z.string().optional(),
  pdf_url: z.string().optional(),
  file_id: z.string(),
  template_used: z.string(),
  message: z.string(),
});

// Job Application
export const UserProfileSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  email: z.string(),
  phone: z.string(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zip_code: z.string().optional(),
  current_title: z.string().optional(),
  years_experience: z.number().optional(),
  linkedin_url: z.string().optional(),
  github_url: z.string().optional(),
  portfolio_url: z.string().optional(),
  degree: z.string().optional(),
  university: z.string().optional(),
  graduation_year: z.number().optional(),
  authorized_to_work: z.boolean().default(true),
  requires_sponsorship: z.boolean().default(false),
  willing_to_relocate: z.boolean().default(true),
});

export const ApplicationRequestSchema = z.object({
  job_url: z.string(),
  profile: UserProfileSchema,
  resume_file_id: z.string().optional(),
  cover_letter: z.string().optional(),
  session_cookies: z.record(z.string(), z.string()).optional(),
  platform: z.string().optional(),
  dry_run: z.boolean().optional().default(false),
  take_screenshot: z.boolean().optional().default(true),
});

export const ApplicationStatusSchema = z.enum([
  'success',
  'draft',
  'login_required',
  'captcha_blocked',
  'form_error',
  'timeout',
  'failed',
]);

export const ApplicationResultSchema = z.object({
  status: ApplicationStatusSchema,
  job_url: z.string(),
  company: z.string().optional(),
  job_title: z.string().optional(),
  screenshot_path: z.string().optional(),
  screenshot_url: z.string().optional(),
  message: z.string(),
  timestamp: z.string().optional(),
  fields_filled: z.number().default(0),
  fields_missing: z.array(z.string()).default([]),
  application_id: z.string().optional(),
});

// Job Search
export const JobSearchRequestSchema = z.object({
  search_term: z.string(),
  location: z.string().optional(),
  distance: z.number().default(50),
  job_type: z.string().optional(),
  remote: z.boolean().default(false),
  results_wanted: z.number().default(20),
  hours_old: z.number().default(72),
  site_names: z.array(z.string()).default(['indeed', 'linkedin', 'glassdoor']),
});

export const JobResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  job_url: z.string(),
  description: z.string().optional(),
  salary_min: z.number().optional(),
  salary_max: z.number().optional(),
  date_posted: z.string().optional(),
  job_type: z.string().optional(),
  is_remote: z.boolean().default(false),
  source: z.string(),
});

export const JobSearchResponseSchema = z.object({
  total_results: z.number(),
  jobs: z.array(JobResultSchema),
  query: z.string(),
});

// Form Analysis
export const FormFieldInfoSchema = z.object({
  name: z.string(),
  field_type: z.string(),
  label: z.string().nullable(),
  required: z.boolean(),
  options: z.array(z.string()).default([]),
});

export const FormAnalysisRequestSchema = z.object({
  job_url: z.string(),
  session_cookies: z.record(z.string(), z.string()).optional(),
});

export const FormAnalysisResponseSchema = z.object({
  success: z.boolean(),
  job_url: z.string(),
  company: z.string().nullable(),
  job_title: z.string().nullable(),
  platform: z.string(),
  fields: z.array(FormFieldInfoSchema),
  required_fields: z.array(z.string()),
  missing_profile_fields: z.array(z.string()),
  blockers: z.array(z.string()),
  can_apply: z.boolean(),
  estimated_fill_rate: z.number(),
  screenshot_url: z.string().nullable(),
  message: z.string(),
});

// Type exports
export type SkillsData = z.infer<typeof SkillsDataSchema>;
export type ExperienceItem = z.infer<typeof ExperienceItemSchema>;
export type EducationItem = z.infer<typeof EducationItemSchema>;
export type ProjectItem = z.infer<typeof ProjectItemSchema>;
export type CertificationItem = z.infer<typeof CertificationItemSchema>;
export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;
export type ResumeGenerationRequest = z.input<typeof ResumeGenerationRequestSchema>;
export type ResumeGenerationResponse = z.infer<typeof ResumeGenerationResponseSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type ApplicationRequest = z.input<typeof ApplicationRequestSchema>;
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;
export type ApplicationResult = z.infer<typeof ApplicationResultSchema>;
export type JobSearchRequest = z.input<typeof JobSearchRequestSchema>;
export type JobResult = z.infer<typeof JobResultSchema>;
export type JobSearchResponse = z.infer<typeof JobSearchResponseSchema>;
export type FormFieldInfo = z.infer<typeof FormFieldInfoSchema>;
export type FormAnalysisRequest = z.input<typeof FormAnalysisRequestSchema>;
export type FormAnalysisResponse = z.infer<typeof FormAnalysisResponseSchema>;

// ============================================================================
// Client Class
// ============================================================================

export class CareerAutomationClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || CAREER_AUTOMATION_URL;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Career Automation API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // ===========================================================================
  // Health Check
  // ===========================================================================

  async healthCheck(): Promise<{ status: string; service: string; version: string }> {
    return this.fetch('/health');
  }

  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Resume Generation
  // ===========================================================================

  async getTemplates(): Promise<{ templates: string[]; default: string }> {
    return this.fetch('/templates');
  }

  async generateResume(
    request: ResumeGenerationRequest
  ): Promise<ResumeGenerationResponse> {
    const validated = ResumeGenerationRequestSchema.parse(request);

    const response = await this.fetch<ResumeGenerationResponse>(
      '/generate-resume',
      {
        method: 'POST',
        body: JSON.stringify(validated),
      }
    );

    return ResumeGenerationResponseSchema.parse(response);
  }

  getResumePdfUrl(fileId: string): string {
    return `${this.baseUrl}/resume/${fileId}`;
  }

  getAssetUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  // ===========================================================================
  // Job Application
  // ===========================================================================

  async applyToJob(request: ApplicationRequest): Promise<ApplicationResult> {
    const validated = ApplicationRequestSchema.parse(request);

    const response = await this.fetch<ApplicationResult>('/apply', {
      method: 'POST',
      body: JSON.stringify(validated),
    });

    return ApplicationResultSchema.parse(response);
  }

  async batchApply(request: {
    job_urls: string[];
    profile: UserProfile;
    resume_file_id?: string;
    cover_letter?: string;
    session_cookies?: Record<string, string>;
    dry_run?: boolean;
    max_applications?: number;
    delay_between_applications?: number;
  }): Promise<{
    total_jobs: number;
    successful: number;
    drafted: number;
    failed: number;
    results: ApplicationResult[];
  }> {
    return this.fetch('/apply/batch', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // ===========================================================================
  // Job Search
  // ===========================================================================

  async searchJobs(request: JobSearchRequest): Promise<JobSearchResponse> {
    const validated = JobSearchRequestSchema.parse(request);

    const response = await this.fetch<JobSearchResponse>('/jobs/search', {
      method: 'POST',
      body: JSON.stringify(validated),
    });

    return JobSearchResponseSchema.parse(response);
  }

  // ===========================================================================
  // Form Analysis
  // ===========================================================================

  async analyzeForm(request: FormAnalysisRequest): Promise<FormAnalysisResponse> {
    const validated = FormAnalysisRequestSchema.parse(request);

    const response = await this.fetch<FormAnalysisResponse>('/analyze-form', {
      method: 'POST',
      body: JSON.stringify(validated),
    });

    return FormAnalysisResponseSchema.parse(response);
  }

  // ===========================================================================
  // Resume Parsing
  // ===========================================================================

  async parseResume(file: File | Blob, filename: string): Promise<{
    raw_text: string;
    parsed_data: {
      technical_skills: string[];
      soft_skills: string[];
      projects: Array<{ title: string; description: string }>;
      certifications: string[];
      languages: string[];
      experience: Array<{
        title: string;
        company: string;
        start_date: string;
        end_date: string;
        description: string;
      }>;
      education: Array<{
        degree: string;
        institution: string;
        graduation_date: string;
      }>;
    };
    filename: string;
  }> {
    const formData = new FormData();
    formData.append('file', file, filename);

    const response = await fetch(`${this.baseUrl}/parse-resume`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resume parsing failed: ${response.status} - ${error}`);
    }

    return response.json();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _client: CareerAutomationClient | null = null;

export function getCareerAutomationClient(): CareerAutomationClient {
  if (!_client) {
    _client = new CareerAutomationClient();
  }
  return _client;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Generate a resume PDF from profile data
 */
export async function generateResume(
  profile: ResumeProfile,
  template: string = 'modern',
  options?: {
    job_title?: string;
    job_description?: string;
    job_company?: string;
  }
): Promise<ResumeGenerationResponse> {
  const client = getCareerAutomationClient();
  return client.generateResume({
    profile,
    template,
    ...options,
  });
}

/**
 * Apply to a job using browser automation
 */
export async function applyToJob(
  jobUrl: string,
  profile: UserProfile,
  options?: {
    resume_file_id?: string;
    cover_letter?: string;
    session_cookies?: Record<string, string>;
    dry_run?: boolean;
    take_screenshot?: boolean;
  }
): Promise<ApplicationResult> {
  const client = getCareerAutomationClient();
  return client.applyToJob({
    job_url: jobUrl,
    profile,
    take_screenshot: options?.take_screenshot ?? true,
    dry_run: options?.dry_run ?? false,
    ...options,
  });
}

/**
 * Search for jobs across multiple platforms
 */
export async function searchJobs(
  searchTerm: string,
  options?: Partial<Omit<JobSearchRequest, 'search_term'>>
): Promise<JobSearchResponse> {
  const client = getCareerAutomationClient();
  return client.searchJobs({
    search_term: searchTerm,
    ...options,
  });
}

/**
 * Check if the career automation service is available
 */
export async function isCareerAutomationAvailable(): Promise<boolean> {
  const client = getCareerAutomationClient();
  return client.isAvailable();
}

/**
 * Analyze a job application form before applying
 */
export async function analyzeJobForm(
  jobUrl: string,
  options?: {
    session_cookies?: Record<string, string>;
  }
): Promise<FormAnalysisResponse> {
  const client = getCareerAutomationClient();
  return client.analyzeForm({
    job_url: jobUrl,
    session_cookies: options?.session_cookies,
  });
}

export default CareerAutomationClient;
