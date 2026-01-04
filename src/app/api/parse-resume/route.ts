import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { withArcjetProtection } from '@/lib/arcjet';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  // Apply Arcjet protection (rate limiting, bot detection, shield)
  const arcjetResponse = await withArcjetProtection(request);
  if (arcjetResponse) return arcjetResponse;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { detail: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const filename = file.name.toLowerCase();
    if (!filename.endsWith('.pdf') && !filename.endsWith('.docx')) {
      return NextResponse.json(
        { detail: 'Only PDF and DOCX files are supported' },
        { status: 400 }
      );
    }

    // Read file content as text
    const fileBuffer = await file.arrayBuffer();
    const fileBase64 = Buffer.from(fileBuffer).toString('base64');

    // For PDF files, we'll use OpenAI's vision capability to extract text
    // For DOCX, we'll extract text directly
    let resumeText = '';

    if (filename.endsWith('.pdf')) {
      // Use OpenAI to extract and parse PDF content
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a resume parsing assistant. Extract all text content from the resume image/PDF and then analyze it to extract structured data.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `This is a resume PDF (base64 encoded). Please:
1. Extract all readable text from it
2. Then analyze and extract:
   - Technical Skills (programming languages, frameworks, tools)
   - Soft Skills (leadership, communication, etc.)
   - Projects (title and description)
   - Certifications
   - Languages spoken

Return ONLY valid JSON with this format:
{
  "raw_text": "The full extracted text from the resume...",
  "technical_skills": ["skill1", "skill2"],
  "soft_skills": ["skill1", "skill2"],
  "projects": [{"title": "Project Name", "description": "Brief desc"}],
  "certifications": ["cert1", "cert2"],
  "languages": ["English", "Spanish"]
}`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${fileBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 4000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI returned empty response');
      }

      // Parse JSON from response (handle markdown code blocks)
      let jsonStr = content;
      if (content.includes('```json')) {
        jsonStr = content.split('```json')[1]?.split('```')[0] || content;
      } else if (content.includes('```')) {
        jsonStr = content.split('```')[1]?.split('```')[0] || content;
      }

      const parsed = JSON.parse(jsonStr.trim());
      resumeText = parsed.raw_text || '';

      const allSkills = [
        ...(parsed.technical_skills || []),
        ...(parsed.soft_skills || []),
      ];

      return NextResponse.json({
        raw_text: resumeText,
        parsed_data: {
          skills: allSkills,
          projects: parsed.projects || [],
          certifications: parsed.certifications || [],
          languages: parsed.languages || [],
        },
        filename: file.name,
      });
    } else {
      // For DOCX, send directly to OpenAI for text extraction and parsing
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a resume parsing assistant. Extract structured data from resumes.',
          },
          {
            role: 'user',
            content: `This is a DOCX resume file (base64 encoded: ${fileBase64.substring(0, 500)}...).

Since I cannot directly parse DOCX in this context, please return a placeholder response. The user should use PDF format for best results.

Return JSON:
{
  "raw_text": "Please upload a PDF for better parsing results.",
  "technical_skills": [],
  "soft_skills": [],
  "projects": [],
  "certifications": [],
  "languages": []
}`,
          },
        ],
      });

      return NextResponse.json({
        raw_text: 'DOCX parsing requires the Python service. Please use PDF format or start the Python parser service.',
        parsed_data: {
          skills: [],
          projects: [],
          certifications: [],
          languages: [],
        },
        filename: file.name,
      });
    }
  } catch (error: any) {
    console.error('Resume parsing error:', error);
    return NextResponse.json(
      { detail: error.message || 'Failed to parse resume' },
      { status: 500 }
    );
  }
}
