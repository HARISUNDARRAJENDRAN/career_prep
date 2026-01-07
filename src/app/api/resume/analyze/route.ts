import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { ResumeProfileSchema } from '@/lib/services/career-automation-client';

const openai = new OpenAI();

const AnalyzeRequestSchema = z.object({
  profile: ResumeProfileSchema,
  jobDescription: z.string().min(50, 'Job description must be at least 50 characters'),
});

const AnalysisResultSchema = z.object({
  matchScore: z.number().min(0).max(100),
  keywordMatches: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  suggestions: z.array(
    z.object({
      section: z.enum(['experience', 'projects', 'summary', 'skills']),
      original: z.string(),
      improved: z.string(),
      reason: z.string(),
    })
  ),
  optimizedSummary: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = AnalyzeRequestSchema.parse(body);

    // Extract relevant resume content for analysis
    const resumeContent = buildResumeContent(validated.profile);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an expert resume consultant and ATS optimization specialist. You analyze resumes against job descriptions and provide detailed, actionable recommendations.

Always respond with valid JSON matching this schema:
{
  "matchScore": number (0-100),
  "keywordMatches": string[] (keywords from job description found in resume),
  "missingKeywords": string[] (important keywords from job description missing from resume),
  "suggestions": [
    {
      "section": "experience" | "projects" | "summary" | "skills",
      "original": string (the original text),
      "improved": string (the improved text),
      "reason": string (why this improvement helps)
    }
  ],
  "optimizedSummary": string (optional, only if summary needs improvement)
}`,
        },
        {
          role: 'user',
          content: `Analyze the following resume against the job description and provide detailed recommendations.

## Job Description:
${validated.jobDescription}

## Current Resume:
${resumeContent}

## Your Task:
1. Calculate a match score (0-100) based on keyword alignment, skills match, and experience relevance
2. Identify keywords from the job description that ARE present in the resume
3. Identify important keywords from the job description that are MISSING from the resume
4. Provide specific suggestions to improve bullet points to better match the job requirements
5. If the summary needs improvement, provide an optimized version

For each suggestion:
- Focus on the "experience" and "projects" sections primarily
- Use action verbs and quantifiable metrics where possible
- Align language with the job description's terminology
- Keep suggestions realistic and truthful (don't fabricate experience)

Provide 3-5 high-impact suggestions that would most improve the candidate's match for this role.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    const analysis = AnalysisResultSchema.parse(JSON.parse(content));

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Resume analysis error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to analyze resume' },
      { status: 500 }
    );
  }
}

function buildResumeContent(profile: z.infer<typeof ResumeProfileSchema>): string {
  const sections: string[] = [];

  // Contact
  sections.push(`Name: ${profile.name}`);
  sections.push(`Email: ${profile.email}`);
  if (profile.location) sections.push(`Location: ${profile.location}`);

  // Summary
  if (profile.summary) {
    sections.push(`\n## Professional Summary\n${profile.summary}`);
  }

  // Experience
  if (profile.experience.length > 0) {
    sections.push('\n## Work Experience');
    for (const exp of profile.experience) {
      sections.push(`\n### ${exp.title} at ${exp.company}`);
      sections.push(`${exp.start_date} - ${exp.end_date}`);
      if (exp.location) sections.push(`Location: ${exp.location}`);
      if (exp.bullets.length > 0) {
        sections.push('Key Accomplishments:');
        for (const bullet of exp.bullets) {
          if (bullet.trim()) sections.push(`- ${bullet}`);
        }
      }
    }
  }

  // Education
  if (profile.education.length > 0) {
    sections.push('\n## Education');
    for (const edu of profile.education) {
      sections.push(`\n${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`);
      sections.push(`${edu.institution}, ${edu.graduation_date}`);
      if (edu.gpa) sections.push(`GPA: ${edu.gpa}`);
    }
  }

  // Skills
  if (profile.skills) {
    sections.push('\n## Skills');
    if (profile.skills.technical?.length) {
      sections.push(`Technical: ${profile.skills.technical.join(', ')}`);
    }
    if (profile.skills.soft?.length) {
      sections.push(`Soft Skills: ${profile.skills.soft.join(', ')}`);
    }
    if (profile.skills.languages?.length) {
      sections.push(`Languages: ${profile.skills.languages.join(', ')}`);
    }
  }

  // Projects
  if (profile.projects.length > 0) {
    sections.push('\n## Projects');
    for (const proj of profile.projects) {
      sections.push(`\n### ${proj.name}`);
      if (proj.technologies?.length) {
        sections.push(`Technologies: ${proj.technologies.join(', ')}`);
      }
      if (proj.bullets.length > 0) {
        for (const bullet of proj.bullets) {
          if (bullet.trim()) sections.push(`- ${bullet}`);
        }
      }
    }
  }

  return sections.join('\n');
}
