import { db } from '@/drizzle/db';
import { skills } from '@/drizzle/schema';
import { ilike, or } from 'drizzle-orm';

export interface NormalizedSkill {
  original: string;
  matched_skill_id: string | null;
  matched_skill_name: string | null;
  confidence: number;
  should_add_to_catalog: boolean;
}

// Common skill aliases mapping
const SKILL_ALIASES: Record<string, string[]> = {
  'JavaScript': ['JS', 'Javascript', 'javascript', 'ECMAScript'],
  'TypeScript': ['TS', 'Typescript', 'typescript'],
  'Python': ['python', 'Python3', 'python3'],
  'React': ['ReactJS', 'React.js', 'react', 'reactjs'],
  'Node.js': ['NodeJS', 'Node', 'nodejs', 'node.js'],
  'Next.js': ['NextJS', 'Nextjs', 'next.js', 'nextjs'],
  'PostgreSQL': ['Postgres', 'postgres', 'postgresql', 'PSQL'],
  'MongoDB': ['Mongo', 'mongo', 'mongodb'],
  'AWS': ['Amazon Web Services', 'amazon web services'],
  'GCP': ['Google Cloud', 'Google Cloud Platform', 'google cloud'],
  'Docker': ['docker', 'containerization'],
  'Kubernetes': ['K8s', 'k8s', 'kubernetes'],
  'GraphQL': ['graphql', 'Graph QL'],
  'REST API': ['REST', 'RESTful', 'restful', 'rest api'],
  'Git': ['git', 'GitHub', 'GitLab', 'github', 'gitlab'],
  'CI/CD': ['CICD', 'ci/cd', 'Continuous Integration', 'continuous integration'],
  'Machine Learning': ['ML', 'ml', 'machine learning'],
  'Deep Learning': ['DL', 'dl', 'deep learning'],
  'TensorFlow': ['tensorflow', 'Tensorflow'],
  'PyTorch': ['pytorch', 'Pytorch'],
  'SQL': ['sql', 'Structured Query Language'],
  'HTML': ['html', 'HTML5', 'html5'],
  'CSS': ['css', 'CSS3', 'css3'],
  'Tailwind CSS': ['TailwindCSS', 'tailwind', 'Tailwind'],
  'Vue.js': ['Vue', 'vue', 'VueJS', 'vuejs'],
  'Angular': ['angular', 'AngularJS', 'angularjs'],
  'Express.js': ['Express', 'express', 'ExpressJS'],
  'FastAPI': ['fastapi', 'Fast API'],
  'Django': ['django'],
  'Flask': ['flask'],
  'Redis': ['redis'],
  'Elasticsearch': ['elasticsearch', 'elastic search', 'ES'],
  'Kafka': ['kafka', 'Apache Kafka'],
};

// Reverse map for quick lookup
const ALIAS_TO_CANONICAL: Map<string, string> = new Map();
for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
  ALIAS_TO_CANONICAL.set(canonical.toLowerCase(), canonical);
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical);
  }
}

function getCanonicalName(skillName: string): string {
  const canonical = ALIAS_TO_CANONICAL.get(skillName.toLowerCase());
  return canonical || skillName;
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  // Simple Levenshtein-based similarity
  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);

  if (maxLen === 0) return 1.0;

  // Count matching characters
  let matches = 0;
  const minLen = Math.min(len1, len2);
  for (let i = 0; i < minLen; i++) {
    if (s1[i] === s2[i]) matches++;
  }

  return matches / maxLen;
}

function inferCategory(skillName: string): string {
  const categories: Record<string, string[]> = {
    'Programming Language': ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin'],
    'Frontend': ['React', 'Vue.js', 'Angular', 'HTML', 'CSS', 'Tailwind CSS', 'Next.js', 'Svelte', 'jQuery'],
    'Backend': ['Node.js', 'Express.js', 'FastAPI', 'Django', 'Flask', 'Spring', 'NestJS', 'Ruby on Rails'],
    'Database': ['PostgreSQL', 'MongoDB', 'Redis', 'MySQL', 'Elasticsearch', 'SQL', 'SQLite', 'Oracle', 'Cassandra'],
    'Cloud & DevOps': ['AWS', 'GCP', 'Docker', 'Kubernetes', 'CI/CD', 'Terraform', 'Azure', 'Jenkins', 'Ansible'],
    'AI/ML': ['Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'NLP', 'Computer Vision', 'Data Science'],
    'Tools': ['Git', 'REST API', 'GraphQL', 'Kafka', 'RabbitMQ', 'gRPC', 'WebSocket'],
  };

  for (const [category, skillsList] of Object.entries(categories)) {
    if (skillsList.some(s => s.toLowerCase() === skillName.toLowerCase())) {
      return category;
    }
  }

  return 'Other';
}

/**
 * Ensure the skills catalog is seeded with common skills.
 * Called automatically during normalization if catalog is empty.
 */
export async function ensureSkillsCatalogSeeded(): Promise<void> {
  const existingSkills = await db.select().from(skills);
  if (existingSkills.length > 0) return;

  console.log('Seeding skills catalog with common skills...');

  const skillsToSeed = Object.keys(SKILL_ALIASES).map(name => ({
    name,
    category: inferCategory(name),
    description: `${name} skill`,
  }));

  for (const skill of skillsToSeed) {
    await db.insert(skills).values(skill).onConflictDoNothing();
  }

  console.log(`Seeded ${skillsToSeed.length} skills into catalog`);
}

/**
 * Add a new skill to the master catalog.
 * Returns the created skill's ID.
 */
export async function addSkillToCatalog(skillName: string): Promise<string> {
  const canonicalName = getCanonicalName(skillName);
  const category = inferCategory(canonicalName);

  const [newSkill] = await db
    .insert(skills)
    .values({
      name: canonicalName,
      category,
      description: `${canonicalName} skill`,
    })
    .onConflictDoNothing()
    .returning();

  if (newSkill) {
    return newSkill.id;
  }

  // Skill already exists, fetch it
  const existing = await db.query.skills.findFirst({
    where: (s, { eq }) => eq(s.name, canonicalName),
  });

  return existing?.id || '';
}

export async function normalizeSkills(rawSkills: string[]): Promise<NormalizedSkill[]> {
  // Ensure catalog is seeded before normalizing
  await ensureSkillsCatalogSeeded();

  const results: NormalizedSkill[] = [];

  // Fetch all skills from the master catalog
  const masterSkills = await db.select().from(skills);
  const skillMap = new Map(masterSkills.map(s => [s.name.toLowerCase(), s]));

  for (const rawSkill of rawSkills) {
    const trimmed = rawSkill.trim();
    if (!trimmed) continue;

    // First, try to find canonical name via aliases
    const canonicalName = getCanonicalName(trimmed);

    // Check if canonical name exists in master catalog
    const exactMatch = skillMap.get(canonicalName.toLowerCase());

    if (exactMatch) {
      results.push({
        original: trimmed,
        matched_skill_id: exactMatch.id,
        matched_skill_name: exactMatch.name,
        confidence: 1.0,
        should_add_to_catalog: false,
      });
      continue;
    }

    // Try fuzzy matching against master catalog
    let bestMatch: { skill: typeof masterSkills[0]; similarity: number } | null = null;

    for (const masterSkill of masterSkills) {
      const similarity = calculateSimilarity(canonicalName, masterSkill.name);
      if (similarity > 0.8 && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { skill: masterSkill, similarity };
      }
    }

    if (bestMatch) {
      results.push({
        original: trimmed,
        matched_skill_id: bestMatch.skill.id,
        matched_skill_name: bestMatch.skill.name,
        confidence: bestMatch.similarity,
        should_add_to_catalog: false,
      });
    } else {
      // No match found - flag for potential catalog addition
      results.push({
        original: trimmed,
        matched_skill_id: null,
        matched_skill_name: null,
        confidence: 0,
        should_add_to_catalog: true,
      });
    }
  }

  return results;
}
