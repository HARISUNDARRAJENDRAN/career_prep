import { z } from 'zod';

// Onboarding step constants
export const ONBOARDING_STEPS = {
  CAREER_GOALS: 'career_goals',
  EXPERIENCE: 'experience',
  EDUCATION: 'education',
  WORK_HISTORY: 'work_history',
  RESUME_UPLOAD: 'resume_upload',
  RESUME_REVIEW: 'resume_review',
  COMPLETE: 'complete',
} as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS];

export const STEP_LABELS: Record<OnboardingStep, string> = {
  [ONBOARDING_STEPS.CAREER_GOALS]: 'Career Goals',
  [ONBOARDING_STEPS.EXPERIENCE]: 'Experience',
  [ONBOARDING_STEPS.EDUCATION]: 'Education',
  [ONBOARDING_STEPS.WORK_HISTORY]: 'Work History',
  [ONBOARDING_STEPS.RESUME_UPLOAD]: 'Resume Upload',
  [ONBOARDING_STEPS.RESUME_REVIEW]: 'Review Skills',
  [ONBOARDING_STEPS.COMPLETE]: 'Complete',
};

// Options for form selects
export const TARGET_ROLE_OPTIONS = [
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'DevOps Engineer',
  'Data Scientist',
  'Machine Learning Engineer',
  'Mobile Developer',
  'Cloud Engineer',
  'Security Engineer',
  'QA Engineer',
  'Product Manager',
  'UI/UX Designer',
] as const;

export const LOCATION_OPTIONS = [
  'Remote',
  'San Francisco, CA',
  'New York, NY',
  'Seattle, WA',
  'Austin, TX',
  'Boston, MA',
  'Los Angeles, CA',
  'Chicago, IL',
  'Denver, CO',
  'Atlanta, GA',
  'India',
  'Europe',
  'Asia',
] as const;

export const DEGREE_OPTIONS = [
  'High School',
  'Associate Degree',
  'Bachelor\'s Degree',
  'Master\'s Degree',
  'PhD',
  'Bootcamp',
  'Self-taught',
  'Other',
] as const;

// Zod schemas for form validation
export const careerGoalsSchema = z.object({
  targetRoles: z.array(z.string()).min(1, 'Select at least one target role'),
  preferredLocations: z.array(z.string()).min(1, 'Select at least one location'),
  salaryMin: z.number().min(0).optional(),
  salaryMax: z.number().min(0).optional(),
  bio: z.string().max(500).optional(),
});

export type CareerGoalsData = z.infer<typeof careerGoalsSchema>;

export const experienceSchema = z.object({
  years_of_experience: z.number().min(0).max(50),
  salary_expectation_min: z.number().nullable().optional(),
  salary_expectation_max: z.number().nullable().optional(),
});

export type ExperienceData = z.infer<typeof experienceSchema>;

export const educationEntrySchema = z.object({
  degree: z.string().min(1, 'Degree is required'),
  institution: z.string().min(1, 'Institution is required'),
  field_of_study: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export const educationSchema = z.object({
  education: z.array(educationEntrySchema).min(1, 'Add at least one education entry'),
});

export type EducationData = z.infer<typeof educationSchema>;

export const workEntrySchema = z.object({
  title: z.string().min(1, 'Job title is required'),
  company: z.string().min(1, 'Company name is required'),
  location: z.string().optional(),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional(),
  description: z.string().max(1000).optional(),
  skills_used: z.array(z.string()).optional(),
});

export const workHistorySchema = z.object({
  work_history: z.array(workEntrySchema),
});

export const workHistoryFormSchema = workHistorySchema;

export type WorkHistoryData = z.infer<typeof workHistorySchema>;

export const resumeReviewSchema = z.object({
  skills: z.array(z.string()),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    technologies: z.array(z.string()).optional(),
  })).optional(),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string().optional(),
    date: z.string().optional(),
  })).optional(),
});

export type ResumeReviewData = z.infer<typeof resumeReviewSchema>;
