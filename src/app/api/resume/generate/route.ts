import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCareerAutomationClient, ResumeProfileSchema } from '@/lib/services/career-automation-client';
import { z } from 'zod';

const GenerateRequestSchema = z.object({
  profile: ResumeProfileSchema,
  template: z.string().default('modern'),
  job_title: z.string().optional(),
  job_description: z.string().optional(),
  job_company: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = GenerateRequestSchema.parse(body);

    const client = getCareerAutomationClient();

    // Check if service is available
    const isAvailable = await client.isAvailable();
    if (!isAvailable) {
      return NextResponse.json(
        {
          error: 'Resume generation service is not available. Please try again later.',
        },
        { status: 503 }
      );
    }

    const result = await client.generateResume({
      profile: validated.profile,
      template: validated.template,
      job_title: validated.job_title,
      job_description: validated.job_description,
      job_company: validated.job_company,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.message || 'Failed to generate resume' },
        { status: 500 }
      );
    }

    // Return the PDF URL
    const pdfUrl = result.file_id
      ? client.getResumePdfUrl(result.file_id)
      : null;

    return NextResponse.json({
      success: true,
      pdf_url: pdfUrl,
      file_id: result.file_id,
      template_used: result.template_used,
      message: result.message,
    });
  } catch (error) {
    console.error('Resume generation error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate resume' },
      { status: 500 }
    );
  }
}
