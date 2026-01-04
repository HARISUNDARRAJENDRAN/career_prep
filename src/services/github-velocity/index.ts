/**
 * GitHub Velocity Service
 *
 * Tracks trending repositories, languages, and technologies on GitHub
 * to provide market intelligence on emerging tech trends.
 */

export interface GitHubRepoTrend {
  name: string;
  full_name: string;
  description: string | null;
  url: string;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  created_at: string;
  updated_at: string;
  stars_today: number;
}

export interface LanguageTrend {
  language: string;
  repos_count: number;
  total_stars: number;
  avg_stars: number;
  trending_repos: string[];
}

export interface TechVelocity {
  name: string;
  category: 'language' | 'framework' | 'tool' | 'library';
  velocity_score: number; // 0-100 score based on growth
  github_stars: number;
  weekly_growth: number; // percentage
  trend: 'rising' | 'stable' | 'declining';
  related_skills: string[];
}

export interface GitHubVelocityReport {
  trending_repos: GitHubRepoTrend[];
  language_trends: LanguageTrend[];
  tech_velocity: TechVelocity[];
  scraped_at: Date;
}

// GitHub API base URL
const GITHUB_API = 'https://api.github.com';

// Tech categories for skill mapping
const TECH_CATEGORIES: Record<string, { category: TechVelocity['category']; related_skills: string[] }> = {
  // Languages
  'typescript': { category: 'language', related_skills: ['JavaScript', 'Node.js', 'React', 'Angular', 'Vue.js'] },
  'python': { category: 'language', related_skills: ['Django', 'Flask', 'FastAPI', 'Machine Learning', 'Data Science'] },
  'rust': { category: 'language', related_skills: ['Systems Programming', 'WebAssembly', 'Performance'] },
  'go': { category: 'language', related_skills: ['Microservices', 'Docker', 'Kubernetes', 'Cloud'] },
  'java': { category: 'language', related_skills: ['Spring', 'Maven', 'Enterprise', 'Android'] },
  'kotlin': { category: 'language', related_skills: ['Android', 'JVM', 'Spring'] },
  'swift': { category: 'language', related_skills: ['iOS', 'macOS', 'Apple'] },

  // Frameworks
  'react': { category: 'framework', related_skills: ['JavaScript', 'TypeScript', 'Redux', 'Next.js'] },
  'vue': { category: 'framework', related_skills: ['JavaScript', 'TypeScript', 'Nuxt.js'] },
  'angular': { category: 'framework', related_skills: ['TypeScript', 'RxJS'] },
  'nextjs': { category: 'framework', related_skills: ['React', 'TypeScript', 'Vercel'] },
  'django': { category: 'framework', related_skills: ['Python', 'PostgreSQL', 'REST API'] },
  'fastapi': { category: 'framework', related_skills: ['Python', 'REST API', 'Async'] },
  'spring': { category: 'framework', related_skills: ['Java', 'Microservices', 'Enterprise'] },

  // Tools
  'docker': { category: 'tool', related_skills: ['Containers', 'Kubernetes', 'DevOps'] },
  'kubernetes': { category: 'tool', related_skills: ['Docker', 'Cloud', 'DevOps', 'Microservices'] },
  'terraform': { category: 'tool', related_skills: ['Infrastructure as Code', 'AWS', 'Azure', 'GCP'] },
  'github-actions': { category: 'tool', related_skills: ['CI/CD', 'DevOps', 'Automation'] },

  // Libraries
  'langchain': { category: 'library', related_skills: ['LLM', 'AI', 'Python', 'RAG'] },
  'pytorch': { category: 'library', related_skills: ['Machine Learning', 'Deep Learning', 'Python'] },
  'tensorflow': { category: 'library', related_skills: ['Machine Learning', 'Deep Learning', 'Python'] },
  'huggingface': { category: 'library', related_skills: ['NLP', 'Transformers', 'AI', 'Python'] },
};

/**
 * Check if GitHub API is configured
 */
export function isGitHubConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN;
}

/**
 * Get GitHub API headers
 */
function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'CareerPrep-SentinelAgent',
  };

  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

/**
 * Fetch trending repositories from GitHub
 */
export async function fetchTrendingRepos(options: {
  language?: string;
  since?: 'daily' | 'weekly' | 'monthly';
  limit?: number;
} = {}): Promise<GitHubRepoTrend[]> {
  const { language, since = 'weekly', limit = 25 } = options;

  // Calculate date range based on 'since'
  const now = new Date();
  const daysBack = since === 'daily' ? 1 : since === 'weekly' ? 7 : 30;
  const sinceDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const dateStr = sinceDate.toISOString().split('T')[0];

  // Build search query
  let query = `created:>${dateStr} stars:>50`;
  if (language) {
    query += ` language:${language}`;
  }

  const url = new URL(`${GITHUB_API}/search/repositories`);
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', limit.toString());

  console.log(`[GitHub] Fetching trending repos: ${query}`);

  const response = await fetch(url.toString(), { headers: getHeaders() });

  if (!response.ok) {
    if (response.status === 403) {
      console.warn('[GitHub] Rate limited, returning empty results');
      return [];
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return data.items.map((repo: any) => ({
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description,
    url: repo.html_url,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    language: repo.language,
    topics: repo.topics || [],
    created_at: repo.created_at,
    updated_at: repo.updated_at,
    stars_today: Math.round(repo.stargazers_count / daysBack), // Approximate daily stars
  }));
}

/**
 * Analyze language trends from trending repos
 */
export function analyzeLanguageTrends(repos: GitHubRepoTrend[]): LanguageTrend[] {
  const languageMap = new Map<string, { repos: GitHubRepoTrend[]; totalStars: number }>();

  for (const repo of repos) {
    if (!repo.language) continue;

    const lang = repo.language.toLowerCase();
    const existing = languageMap.get(lang) || { repos: [], totalStars: 0 };
    existing.repos.push(repo);
    existing.totalStars += repo.stars;
    languageMap.set(lang, existing);
  }

  const trends: LanguageTrend[] = [];

  for (const [language, data] of languageMap) {
    trends.push({
      language,
      repos_count: data.repos.length,
      total_stars: data.totalStars,
      avg_stars: Math.round(data.totalStars / data.repos.length),
      trending_repos: data.repos.slice(0, 5).map(r => r.full_name),
    });
  }

  // Sort by total stars
  return trends.sort((a, b) => b.total_stars - a.total_stars);
}

/**
 * Calculate technology velocity scores
 */
export async function calculateTechVelocity(
  repos: GitHubRepoTrend[],
  languageTrends: LanguageTrend[]
): Promise<TechVelocity[]> {
  const velocities: TechVelocity[] = [];

  // Process languages
  for (const lang of languageTrends.slice(0, 15)) {
    const techInfo = TECH_CATEGORIES[lang.language] || {
      category: 'language' as const,
      related_skills: [],
    };

    // Calculate velocity score (0-100)
    const maxStars = languageTrends[0]?.total_stars || 1;
    const velocityScore = Math.min(100, Math.round((lang.total_stars / maxStars) * 100));

    // Estimate weekly growth based on repo age and stars
    const weeklyGrowth = lang.avg_stars > 500 ? 15 : lang.avg_stars > 200 ? 10 : 5;

    velocities.push({
      name: lang.language,
      category: techInfo.category,
      velocity_score: velocityScore,
      github_stars: lang.total_stars,
      weekly_growth: weeklyGrowth,
      trend: velocityScore > 70 ? 'rising' : velocityScore > 40 ? 'stable' : 'declining',
      related_skills: techInfo.related_skills,
    });
  }

  // Process topics from repos
  const topicCounts = new Map<string, { count: number; stars: number }>();

  for (const repo of repos) {
    for (const topic of repo.topics) {
      const existing = topicCounts.get(topic) || { count: 0, stars: 0 };
      existing.count++;
      existing.stars += repo.stars;
      topicCounts.set(topic, existing);
    }
  }

  // Add top topics as tech velocities
  const sortedTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1].stars - a[1].stars)
    .slice(0, 10);

  for (const [topic, data] of sortedTopics) {
    // Skip if already added as language
    if (velocities.some(v => v.name.toLowerCase() === topic.toLowerCase())) continue;

    const techInfo = TECH_CATEGORIES[topic] || {
      category: 'library' as const,
      related_skills: [],
    };

    const velocityScore = Math.min(100, Math.round((data.stars / 10000) * 100));

    velocities.push({
      name: topic,
      category: techInfo.category,
      velocity_score: velocityScore,
      github_stars: data.stars,
      weekly_growth: data.count > 10 ? 12 : data.count > 5 ? 8 : 4,
      trend: velocityScore > 60 ? 'rising' : 'stable',
      related_skills: techInfo.related_skills,
    });
  }

  return velocities.sort((a, b) => b.velocity_score - a.velocity_score);
}

/**
 * Fetch complete GitHub velocity report
 */
export async function fetchGitHubVelocityReport(): Promise<GitHubVelocityReport> {
  console.log('[GitHub Velocity] Starting velocity analysis...');

  // Fetch trending repos
  const trendingRepos = await fetchTrendingRepos({ since: 'weekly', limit: 100 });
  console.log(`[GitHub Velocity] Fetched ${trendingRepos.length} trending repos`);

  // Analyze language trends
  const languageTrends = analyzeLanguageTrends(trendingRepos);
  console.log(`[GitHub Velocity] Analyzed ${languageTrends.length} language trends`);

  // Calculate tech velocity
  const techVelocity = await calculateTechVelocity(trendingRepos, languageTrends);
  console.log(`[GitHub Velocity] Calculated ${techVelocity.length} tech velocities`);

  return {
    trending_repos: trendingRepos.slice(0, 25),
    language_trends: languageTrends.slice(0, 15),
    tech_velocity: techVelocity,
    scraped_at: new Date(),
  };
}

/**
 * Correlate GitHub trends with job market skills
 */
export function correlateWithJobMarket(
  techVelocity: TechVelocity[],
  jobSkillDemand: Record<string, number> | Array<{ name: string; count: number }>
): Array<{
  skill: string;
  job_demand: number;
  github_velocity: number;
  correlation: 'high' | 'medium' | 'low';
  recommendation: string;
}> {
  const correlations: Array<{
    skill: string;
    job_demand: number;
    github_velocity: number;
    correlation: 'high' | 'medium' | 'low';
    recommendation: string;
  }> = [];

  // Normalize jobSkillDemand to Map
  const jobMap = new Map<string, number>();
  if (Array.isArray(jobSkillDemand)) {
    for (const s of jobSkillDemand) {
      jobMap.set(s.name.toLowerCase(), s.count);
    }
  } else {
    for (const [name, count] of Object.entries(jobSkillDemand)) {
      jobMap.set(name.toLowerCase(), count);
    }
  }

  // Find correlations
  for (const tech of techVelocity) {
    const techName = tech.name.toLowerCase();
    const jobCount = jobMap.get(techName) || 0;

    // Also check related skills
    let totalJobDemand = jobCount;
    for (const related of tech.related_skills) {
      totalJobDemand += jobMap.get(related.toLowerCase()) || 0;
    }

    const normalizedDemand = Math.min(100, totalJobDemand);
    const avgScore = (tech.velocity_score + normalizedDemand) / 2;

    let correlation: 'high' | 'medium' | 'low';
    let recommendation: string;

    if (tech.velocity_score > 60 && totalJobDemand > 50) {
      correlation = 'high';
      recommendation = `${tech.name} is hot in both GitHub and job market - prioritize learning`;
    } else if (tech.velocity_score > 60 && totalJobDemand < 30) {
      correlation = 'medium';
      recommendation = `${tech.name} is trending on GitHub but not yet in job postings - early adopter opportunity`;
    } else if (tech.velocity_score < 40 && totalJobDemand > 50) {
      correlation = 'medium';
      recommendation = `${tech.name} is in demand but GitHub activity is slowing - still valuable but watch trends`;
    } else {
      correlation = 'low';
      recommendation = `${tech.name} has moderate presence - consider based on career goals`;
    }

    correlations.push({
      skill: tech.name,
      job_demand: totalJobDemand,
      github_velocity: tech.velocity_score,
      correlation,
      recommendation,
    });
  }

  return correlations.sort((a, b) => {
    const scoreA = a.job_demand + a.github_velocity;
    const scoreB = b.job_demand + b.github_velocity;
    return scoreB - scoreA;
  });
}
