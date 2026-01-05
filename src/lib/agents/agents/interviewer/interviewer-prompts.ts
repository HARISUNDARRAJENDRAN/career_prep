/**
 * Interviewer Agent Prompts
 *
 * System prompts and templates for the autonomous interviewer agent.
 *
 * @see docs/agentic-improvements/08-PILOT_INTERVIEW_AGENT.md
 */

export const INTERVIEWER_PROMPTS = {
  /**
   * System context for all interviewer agent operations
   */
  SYSTEM_CONTEXT: `You are an expert interview coach with 20+ years of experience helping candidates 
succeed in technical, behavioral, and case interviews. You provide actionable, specific feedback 
that helps candidates improve measurably. You balance encouragement with constructive criticism.

Your analysis should be:
- Specific: Reference actual quotes and moments from the interview
- Actionable: Every piece of feedback should have a clear next step
- Balanced: Acknowledge strengths while identifying areas for growth
- Personalized: Tailor advice to the candidate's level and goals`,

  /**
   * Transcript analysis prompt
   */
  TRANSCRIPT_ANALYSIS: `Analyze the following interview transcript for a {INTERVIEW_TYPE} interview.

Transcript:
{TRANSCRIPT}

Provide a comprehensive analysis including:
1. Overall impression and key themes
2. Communication effectiveness (clarity, conciseness, structure)
3. Content quality (depth, relevance, examples)
4. Response patterns (strengths and areas needing work)
5. Notable quotes (both strong and weak responses)

Format as JSON with these sections.`,

  /**
   * Strength identification prompt
   */
  STRENGTH_ANALYSIS: `Based on this interview transcript, identify the candidate's key strengths.

Transcript:
{TRANSCRIPT}

For each strength:
1. Name the category (communication, technical, leadership, etc.)
2. Provide specific evidence from the transcript
3. Explain why this is effective
4. Suggest how to leverage this strength further

Identify at least 3 distinct strengths with concrete examples.`,

  /**
   * Improvement areas prompt
   */
  IMPROVEMENT_ANALYSIS: `Based on this interview transcript, identify areas where the candidate can improve.

Transcript:
{TRANSCRIPT}

Previous strengths identified:
{STRENGTHS}

For each improvement area:
1. Name the category
2. Provide specific evidence from the transcript
3. Explain the impact of this weakness
4. Provide a concrete, actionable suggestion
5. Assign priority (high/medium/low)

Be constructive and specific. Focus on fixable behaviors.`,

  /**
   * Deep dive into strengths (for iteration)
   */
  STRENGTH_DEEP_DIVE: `The initial analysis didn't identify enough specific strengths. 
Look deeper into the transcript to find additional strengths.

Transcript:
{TRANSCRIPT}

Already identified strengths:
{EXISTING_STRENGTHS}

Look for:
- Subtle communication skills (active listening, clarifying questions)
- Problem-solving approach (structured thinking, hypothesis formation)
- Soft skills (enthusiasm, adaptability, self-awareness)
- Industry knowledge or technical depth shown in answers

Identify at least 2 additional strengths not yet mentioned.`,

  /**
   * Action items generation prompt
   */
  ACTION_ITEMS: `Based on the interview analysis, generate specific action items for improvement.

Interview type: {INTERVIEW_TYPE}
Identified improvements:
{IMPROVEMENTS}

For each action item:
1. Write a clear, specific task
2. Set a reasonable timeline (e.g., "Before next interview", "This week")
3. Suggest 1-2 resources if applicable
4. Connect it to the specific improvement area

Action items should be:
- Achievable in the timeframe
- Measurable (how will they know they've done it?)
- Relevant to the improvement areas identified`,

  /**
   * Personalized tips prompt
   */
  PERSONALIZED_TIPS: `Generate personalized tips for this candidate based on their interview.

Interview type: {INTERVIEW_TYPE}
Role applied for: {JOB_ROLE}
Analysis summary:
{ANALYSIS_SUMMARY}

Past patterns from this user (if available):
{USER_PATTERNS}

Generate 3-5 tips that are:
- Specific to this candidate (not generic interview advice)
- Actionable before their next interview
- Based on patterns observed in their responses`,

  /**
   * Synthesis prompt - combines all analyses into final output
   */
  SYNTHESIS: `Synthesize the following interview analysis results into a comprehensive feedback report.

Interview Type: {INTERVIEW_TYPE}
Analysis Results from various steps:
{STEP_RESULTS}

Patterns learned from past analyses:
{PAST_PATTERNS}

Create a complete analysis with:
1. overall_score (0-100)
2. strengths (array of {category, description, evidence})
3. improvements (array of {category, description, suggestion, priority})
4. detailed_feedback (communication, technical, problem_solving, cultural_fit - each with score and notes)
5. action_items (array of {item, timeline, resources?})
6. personalized_tips (array of strings)

Ensure the feedback is:
- Balanced (strengths and areas to improve)
- Specific (with examples from transcript)
- Actionable (clear next steps)
- Encouraging but honest

Return as valid JSON matching the AnalysisOutput schema.`,

  /**
   * Skill extraction prompt
   */
  SKILL_EXTRACTION: `Extract skills demonstrated in this interview transcript.

Transcript:
{TRANSCRIPT}

Interview type: {INTERVIEW_TYPE}

For each skill mentioned or demonstrated:
1. Skill name (normalized, e.g., "JavaScript" not "JS")
2. Level demonstrated (beginner/intermediate/advanced/expert)
3. Evidence from transcript
4. Confidence in assessment (0-1)

Focus on:
- Technical skills explicitly mentioned
- Soft skills demonstrated through behavior
- Domain knowledge shown
- Tools or frameworks referenced`,

  /**
   * Comparison with past performance
   */
  PROGRESS_COMPARISON: `Compare this interview performance with past interviews.

Current interview summary:
{CURRENT_SUMMARY}

Past interview summaries:
{PAST_SUMMARIES}

Analyze:
1. Areas of improvement since last interview
2. Persistent challenges that remain
3. New strengths emerging
4. Overall trajectory (improving/stable/declining)

This helps personalize feedback by acknowledging progress.`,
} as const;

/**
 * Get a prompt with placeholders replaced
 */
export function buildPrompt(
  template: keyof typeof INTERVIEWER_PROMPTS,
  replacements: Record<string, string>
): string {
  let prompt: string = INTERVIEWER_PROMPTS[template];

  for (const [key, value] of Object.entries(replacements)) {
    const placeholder = `{${key}}`;
    prompt = prompt.replace(new RegExp(placeholder, 'g'), value);
  }

  return prompt;
}
