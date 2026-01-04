/**
 * Job Normalizer with AI-Powered Skill Extraction
 *
 * Normalizes job listings from different sources and extracts required skills
 * using a combination of keyword matching and AI analysis.
 *
 * This makes the Sentinel Agent more "agentic" by using AI to understand
 * job requirements beyond simple keyword matching.
 */

import type {
  JoobleJob,
  AdzunaJob,
  NormalizedJob,
  JobType,
  RemoteType,
} from './types';
import OpenAI from 'openai';

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalize Jooble job to standard format
 */
export function normalizeJoobleJob(job: JoobleJob): NormalizedJob {
  const { salaryMin, salaryMax, salaryRange } = parseSalaryRange(job.salary);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // Jobs expire in 7 days

  return {
    external_id: job.id,
    source: 'jooble',
    title: job.title,
    company: job.company || 'Unknown Company',
    location: job.location || 'Unknown Location',
    description: job.snippet || '',
    salary_min: salaryMin,
    salary_max: salaryMax,
    salary_range: salaryRange,
    job_type: parseJobType(job.type),
    remote_type: parseRemoteType(job.location, job.snippet),
    application_url: job.link,
    required_skills: extractSkillsBasic(job.title + ' ' + job.snippet),
    posted_at: job.updated ? new Date(job.updated) : new Date(),
    expires_at: expiresAt,
  };
}

/**
 * Normalize Adzuna job to standard format
 */
export function normalizeAdzunaJob(job: AdzunaJob): NormalizedJob {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const salaryRange =
    job.salary_min && job.salary_max
      ? `$${Math.round(job.salary_min / 1000)}k-$${Math.round(job.salary_max / 1000)}k`
      : null;

  return {
    external_id: job.id,
    source: 'adzuna',
    title: job.title,
    company: job.company?.display_name || 'Unknown Company',
    location: job.location?.display_name || 'Unknown Location',
    description: job.description || '',
    salary_min: job.salary_min || null,
    salary_max: job.salary_max || null,
    salary_range: salaryRange,
    job_type: 'full_time', // Adzuna doesn't reliably provide job type
    remote_type: parseRemoteType(
      job.location?.display_name || '',
      job.description || ''
    ),
    application_url: job.redirect_url,
    required_skills: extractSkillsBasic(job.title + ' ' + job.description),
    posted_at: job.created ? new Date(job.created) : new Date(),
    expires_at: expiresAt,
  };
}

/**
 * Deduplicate jobs by title + company + location hash
 */
export function deduplicateJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Map<string, NormalizedJob>();

  for (const job of jobs) {
    // Create a hash key from normalized job details
    const key = createJobHash(job);

    // Keep the job with more skills extracted or more recent
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, job);
    } else if (
      job.required_skills.length > existing.required_skills.length ||
      job.posted_at > existing.posted_at
    ) {
      seen.set(key, job);
    }
  }

  return Array.from(seen.values());
}

/**
 * Create a hash key for job deduplication
 */
function createJobHash(job: NormalizedJob): string {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 50);

  return `${normalize(job.title)}-${normalize(job.company)}-${normalize(job.location)}`;
}

// ============================================================================
// Parsing Helpers
// ============================================================================

function parseSalaryRange(salary: string): {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryRange: string | null;
} {
  if (!salary) return { salaryMin: null, salaryMax: null, salaryRange: null };

  // Extract numbers from salary string like "$100,000 - $150,000" or "$80k-$120k"
  const numbers = salary.match(/\d+[,\d]*/g);
  if (!numbers || numbers.length === 0) {
    return { salaryMin: null, salaryMax: null, salaryRange: null };
  }

  let values = numbers.map((n) => parseInt(n.replace(/,/g, ''), 10));

  // Handle "k" notation (e.g., 80 -> 80000)
  if (salary.toLowerCase().includes('k')) {
    values = values.map((v) => (v < 1000 ? v * 1000 : v));
  }

  const salaryMin = values[0] || null;
  const salaryMax = values[1] || values[0] || null;
  const salaryRange = salary;

  return { salaryMin, salaryMax, salaryRange };
}

function parseJobType(type: string): JobType | null {
  if (!type) return null;
  const lower = type.toLowerCase();

  if (lower.includes('full') || lower.includes('permanent')) return 'full_time';
  if (lower.includes('part')) return 'part_time';
  if (lower.includes('contract') || lower.includes('freelance')) return 'contract';
  if (lower.includes('intern')) return 'internship';

  return null;
}

function parseRemoteType(location: string, description: string): RemoteType | null {
  const text = `${location} ${description}`.toLowerCase();

  // Order matters: check hybrid first as it often contains "remote"
  if (text.includes('hybrid')) return 'hybrid';
  if (
    text.includes('remote') ||
    text.includes('work from home') ||
    text.includes('wfh')
  )
    return 'remote';
  if (text.includes('on-site') || text.includes('onsite') || text.includes('in-office'))
    return 'onsite';

  return null;
}

// ============================================================================
// Basic Skill Extraction (Keyword Matching)
// ============================================================================

// Comprehensive skill keyword list
const SKILL_KEYWORDS = [
  // Programming Languages
  'javascript',
  'typescript',
  'python',
  'java',
  'c++',
  'c#',
  'go',
  'golang',
  'rust',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'scala',
  'r',

  // Frontend
  'react',
  'reactjs',
  'react.js',
  'vue',
  'vuejs',
  'vue.js',
  'angular',
  'svelte',
  'next.js',
  'nextjs',
  'nuxt',
  'gatsby',
  'html',
  'css',
  'sass',
  'scss',
  'tailwind',
  'tailwindcss',
  'bootstrap',
  'material ui',

  // Backend
  'node.js',
  'nodejs',
  'node',
  'express',
  'expressjs',
  'fastapi',
  'django',
  'flask',
  'spring',
  'spring boot',
  'rails',
  'ruby on rails',
  '.net',
  'asp.net',
  'laravel',
  'fastify',
  'nest.js',
  'nestjs',

  // Databases
  'postgresql',
  'postgres',
  'mysql',
  'mongodb',
  'redis',
  'elasticsearch',
  'sql',
  'nosql',
  'dynamodb',
  'sqlite',
  'oracle',
  'cassandra',
  'mariadb',
  'firebase',
  'supabase',

  // Cloud & DevOps
  'aws',
  'amazon web services',
  'azure',
  'gcp',
  'google cloud',
  'docker',
  'kubernetes',
  'k8s',
  'terraform',
  'jenkins',
  'ci/cd',
  'github actions',
  'gitlab ci',
  'circleci',
  'ansible',
  'helm',
  'prometheus',
  'grafana',
  'datadog',
  'cloudflare',
  'vercel',
  'heroku',
  'netlify',

  // AI/ML
  'machine learning',
  'ml',
  'deep learning',
  'ai',
  'artificial intelligence',
  'tensorflow',
  'pytorch',
  'keras',
  'scikit-learn',
  'pandas',
  'numpy',
  'llm',
  'nlp',
  'computer vision',
  'langchain',
  'openai',

  // APIs & Protocols
  'graphql',
  'rest',
  'restful',
  'api',
  'grpc',
  'websocket',
  'oauth',
  'jwt',

  // Architecture & Patterns
  'microservices',
  'serverless',
  'event-driven',
  'distributed systems',
  'system design',
  'design patterns',
  'ddd',
  'cqrs',

  // Tools & Practices
  'git',
  'github',
  'gitlab',
  'bitbucket',
  'jira',
  'confluence',
  'agile',
  'scrum',
  'kanban',
  'tdd',
  'unit testing',
  'integration testing',
  'linux',
  'bash',
  'shell scripting',

  // Mobile
  'ios',
  'android',
  'react native',
  'flutter',
  'mobile development',
  'xcode',

  // Data
  'data science',
  'data engineering',
  'etl',
  'data pipeline',
  'spark',
  'hadoop',
  'kafka',
  'airflow',
  'dbt',
  'snowflake',
  'bigquery',
  'redshift',
  'tableau',
  'power bi',

  // Security
  'security',
  'cybersecurity',
  'penetration testing',
  'owasp',
  'encryption',
  'authentication',

  // Blockchain
  'blockchain',
  'web3',
  'solidity',
  'ethereum',
  'smart contracts',
];

/**
 * Extract skills using keyword matching (fast, no API call)
 */
export function extractSkillsBasic(text: string): string[] {
  if (!text) return [];

  const lowerText = text.toLowerCase();
  const foundSkills: string[] = [];

  for (const skill of SKILL_KEYWORDS) {
    // Use word boundaries to avoid partial matches
    const regex = new RegExp(`\\b${escapeRegex(skill)}\\b`, 'i');
    if (regex.test(lowerText)) {
      // Normalize skill name (capitalize first letter of each word)
      const normalized = normalizeSkillName(skill);
      if (!foundSkills.includes(normalized)) {
        foundSkills.push(normalized);
      }
    }
  }

  return foundSkills;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSkillName(skill: string): string {
  // Special cases for acronyms and specific naming conventions
  const specialCases: Record<string, string> = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'nodejs': 'Node.js',
    'node.js': 'Node.js',
    'node': 'Node.js',
    'reactjs': 'React',
    'react.js': 'React',
    'vuejs': 'Vue.js',
    'vue.js': 'Vue.js',
    'nextjs': 'Next.js',
    'next.js': 'Next.js',
    'nestjs': 'NestJS',
    'nest.js': 'NestJS',
    'expressjs': 'Express',
    'postgresql': 'PostgreSQL',
    'postgres': 'PostgreSQL',
    'mongodb': 'MongoDB',
    'mysql': 'MySQL',
    'nosql': 'NoSQL',
    'sql': 'SQL',
    'graphql': 'GraphQL',
    'aws': 'AWS',
    'gcp': 'GCP',
    'ci/cd': 'CI/CD',
    'golang': 'Go',
    'k8s': 'Kubernetes',
    'ml': 'Machine Learning',
    'ai': 'AI',
    'nlp': 'NLP',
    'llm': 'LLM',
    'ddd': 'DDD',
    'cqrs': 'CQRS',
    'tdd': 'TDD',
    'ios': 'iOS',
    'etl': 'ETL',
    'dbt': 'dbt',
    'jwt': 'JWT',
    'oauth': 'OAuth',
    'grpc': 'gRPC',
    'tailwindcss': 'Tailwind CSS',
  };

  const lower = skill.toLowerCase();
  if (specialCases[lower]) {
    return specialCases[lower];
  }

  // Default: capitalize first letter of each word
  return skill
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ============================================================================
// AI-Powered Skill Extraction (More Agentic)
// ============================================================================

/**
 * Extract skills using AI for better accuracy
 * This is more "agentic" - the AI understands context and can identify
 * skills that aren't in our keyword list.
 *
 * Use this for high-priority job matches or when basic extraction fails.
 */
export async function extractSkillsWithAI(
  jobTitle: string,
  jobDescription: string
): Promise<string[]> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.warn('[Skill Extractor] OpenAI not configured, using basic extraction');
    return extractSkillsBasic(jobTitle + ' ' + jobDescription);
  }

  try {
    const openai = new OpenAI({ apiKey: openaiKey });

    const prompt = `Extract the technical skills and technologies required from this job posting.

Job Title: ${jobTitle}

Job Description:
${jobDescription.slice(0, 2000)}

Return ONLY a JSON array of skill names, normalized and deduplicated.
Focus on:
- Programming languages
- Frameworks and libraries
- Databases and data stores
- Cloud platforms and services
- DevOps tools
- Methodologies (e.g., Agile, TDD)

Example output: ["JavaScript", "React", "Node.js", "PostgreSQL", "AWS", "Docker"]

Important:
- Use standard naming conventions (e.g., "JavaScript" not "JS", "React" not "ReactJS")
- Include only technical skills, not soft skills
- Return 5-15 most relevant skills`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a technical recruiter assistant. Extract skills from job postings. Always respond with valid JSON arrays only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    // Parse the JSON array
    const skills = JSON.parse(content) as string[];
    return skills.filter((s) => typeof s === 'string' && s.length > 0);
  } catch (error) {
    console.error('[Skill Extractor] AI extraction failed:', error);
    // Fallback to basic extraction
    return extractSkillsBasic(jobTitle + ' ' + jobDescription);
  }
}

/**
 * Batch extract skills with AI for multiple jobs
 * More efficient than individual calls
 */
export async function batchExtractSkillsWithAI(
  jobs: NormalizedJob[],
  maxJobs = 50
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();
  const jobsToProcess = jobs.slice(0, maxJobs);

  // Process in parallel with concurrency limit
  const concurrency = 5;
  for (let i = 0; i < jobsToProcess.length; i += concurrency) {
    const batch = jobsToProcess.slice(i, i + concurrency);
    const promises = batch.map(async (job) => {
      const skills = await extractSkillsWithAI(job.title, job.description);
      results.set(job.external_id, skills);
    });

    await Promise.all(promises);
  }

  return results;
}
