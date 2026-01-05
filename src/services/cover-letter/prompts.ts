/**
 * AI Prompt Templates for Cover Letter Generation
 */

export const COVER_LETTER_SYSTEM_PROMPT = `You are an expert career coach and professional writer who creates highly personalized, compelling cover letters.

Your cover letters are:
- Concise (250-400 words)
- Tailored to the specific company and role
- Authentic and not overly formal
- Focused on value the candidate brings
- Free of generic phrases like "I am writing to apply for..."

Writing style guidelines:
1. Open with a strong hook about why this specific company/role
2. Lead with achievements, not responsibilities
3. Use specific metrics and outcomes where possible
4. Connect past experience directly to job requirements
5. Address any skill gaps proactively with a growth mindset
6. End with a clear, confident call-to-action
7. Sound professional but personable - not robotic

Never use these phrases:
- "I am writing to express my interest in..."
- "I believe I would be a great fit..."
- "Dear Hiring Manager" (use the company name instead)
- "Thank you for considering my application"

Output must be valid JSON with the exact structure specified.`;

export const COVER_LETTER_USER_PROMPT = `Generate a personalized cover letter for this job application.

## JOB DETAILS
Company: {{company}}
Role: {{title}}
Location: {{location}}
Remote: {{remoteType}}

Job Description:
{{description}}

Key Requirements:
{{requirements}}

## CANDIDATE PROFILE
Matching Skills: {{matchingSkills}}
Skills to Develop: {{missingSkills}}
Match Score: {{matchScore}}%

## RELEVANT EXPERIENCE (from resume)
{{resumeContext}}

## INSTRUCTIONS
Write a cover letter that:
1. Opens with genuine interest in {{company}} specifically
2. Highlights 2-3 achievements that match the requirements
3. Addresses {{#if missingSkills}}skill gaps ({{missingSkills}}) with a learning mindset{{else}}how your full skill set transfers{{/if}}
4. Shows knowledge of what {{company}} does
5. Ends with enthusiasm for discussing the opportunity

Respond with this exact JSON structure:
{
  "coverLetter": "The full cover letter text (250-400 words)",
  "keyPoints": ["3 main selling points used in the letter"],
  "customizations": {
    "companyName": "{{company}}",
    "roleTitle": "{{title}}",
    "highlightedExperiences": ["Specific experiences/achievements mentioned"]
  }
}`;

/**
 * Build the prompt with actual values
 */
export function buildCoverLetterPrompt(params: {
  company: string;
  title: string;
  location: string | null;
  remoteType: string | null;
  description: string;
  requirements: string[];
  matchingSkills: string[];
  missingSkills: string[];
  matchScore: number;
  resumeContext: string;
}): string {
  let prompt = COVER_LETTER_USER_PROMPT;

  // Replace all template variables
  prompt = prompt.replace(/\{\{company\}\}/g, params.company);
  prompt = prompt.replace(/\{\{title\}\}/g, params.title);
  prompt = prompt.replace(/\{\{location\}\}/g, params.location || 'Not specified');
  prompt = prompt.replace(/\{\{remoteType\}\}/g, params.remoteType || 'Not specified');
  prompt = prompt.replace(/\{\{description\}\}/g, params.description || 'No description provided');
  prompt = prompt.replace(/\{\{requirements\}\}/g, params.requirements.length > 0 ? params.requirements.map(r => `- ${r}`).join('\n') : 'Not specified');
  prompt = prompt.replace(/\{\{matchingSkills\}\}/g, params.matchingSkills.join(', ') || 'None specified');
  prompt = prompt.replace(/\{\{missingSkills\}\}/g, params.missingSkills.join(', ') || 'None');
  prompt = prompt.replace(/\{\{matchScore\}\}/g, String(params.matchScore));
  prompt = prompt.replace(/\{\{resumeContext\}\}/g, params.resumeContext || 'No additional context available');

  // Handle conditional for missing skills
  if (params.missingSkills.length > 0) {
    prompt = prompt.replace(
      /\{\{#if missingSkills\}\}(.*?)\{\{else\}\}(.*?)\{\{\/if\}\}/g,
      '$1'
    );
  } else {
    prompt = prompt.replace(
      /\{\{#if missingSkills\}\}(.*?)\{\{else\}\}(.*?)\{\{\/if\}\}/g,
      '$2'
    );
  }

  return prompt;
}
