/**
 * Interviewer Agent Tools
 *
 * Tool definitions and registration for the interviewer agent.
 *
 * @see docs/agentic-improvements/08-PILOT_INTERVIEW_AGENT.md
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { toolRegistry, type ToolDefinition, defineTool } from '../../tools/tool-registry';
import { buildPrompt, INTERVIEWER_PROMPTS } from './interviewer-prompts';

// ============================================================================
// Input/Output Schemas
// ============================================================================

const TranscriptParserInput = z.object({
  transcript: z.string(),
  format: z.enum(['structured', 'turns', 'raw']).optional(),
});

const TranscriptParserOutput = z.object({
  total_turns: z.number(),
  turns: z.union([z.string(), z.array(z.object({
    speaker: z.string(),
    content: z.string(),
    timestamp: z.string().optional(),
  }))]),
  word_count: z.number(),
  speakers: z.array(z.string()),
});

const GPT4AnalyzerInput = z.object({
  prompt: z.string(),
  context: z.string().optional(),
  response_format: z.enum(['json', 'text']).optional(),
  temperature: z.number().optional(),
});

const GPT4AnalyzerOutput = z.object({
  response: z.unknown(),
  tokens_used: z.number(),
});

const SkillExtractorInput = z.object({
  transcript: z.string(),
  interview_type: z.enum(['behavioral', 'technical', 'case', 'mixed']),
});

const SkillExtractorOutput = z.object({
  skills: z.array(z.unknown()),
  technical_skills: z.array(z.unknown()),
  soft_skills: z.array(z.unknown()),
});

const FeedbackGeneratorInput = z.object({
  analysis: z.record(z.string(), z.unknown()),
  interview_type: z.string(),
  user_patterns: z.array(z.unknown()).optional(),
});

const FeedbackGeneratorOutput = z.object({
  overall_score: z.number(),
  strengths: z.array(z.unknown()),
  improvements: z.array(z.unknown()),
  detailed_feedback: z.unknown(),
  action_items: z.array(z.unknown()),
  personalized_tips: z.array(z.string()),
});

const StrengthAnalyzerInput = z.object({
  transcript: z.string(),
  existing_strengths: z.array(z.string()).optional(),
});

const StrengthAnalyzerOutput = z.object({
  strengths: z.array(z.unknown()).optional(),
});

const ImprovementAnalyzerInput = z.object({
  transcript: z.string(),
  strengths: z.array(z.unknown()).optional(),
});

const ImprovementAnalyzerOutput = z.object({
  improvements: z.array(z.unknown()).optional(),
});

const ActionItemGeneratorInput = z.object({
  improvements: z.array(z.unknown()),
  interview_type: z.string(),
});

const ActionItemGeneratorOutput = z.object({
  action_items: z.array(z.unknown()).optional(),
});

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Transcript Parser Tool
 */
const transcriptParserTool: ToolDefinition<
  z.infer<typeof TranscriptParserInput>,
  z.infer<typeof TranscriptParserOutput>
> = {
  id: 'transcript_parser',
  name: 'Transcript Parser',
  description: 'Parse and structure an interview transcript for analysis',
  version: '1.0.0',
  category: 'parsing',
  tags: ['interview', 'transcript', 'parsing'],
  input_schema: TranscriptParserInput,
  output_schema: TranscriptParserOutput,
  handler: async (input) => {
    const lines = input.transcript.split('\n');
    const turns: Array<{ speaker: string; content: string; timestamp?: string }> = [];

    let currentSpeaker = '';
    let currentContent = '';

    for (const line of lines) {
      // Detect speaker changes (common formats: "Speaker:", "[Speaker]", "SPEAKER:")
      const speakerMatch = line.match(/^(?:\[([^\]]+)\]|([A-Z][a-z]+|INTERVIEWER|CANDIDATE):)/);

      if (speakerMatch) {
        // Save previous turn
        if (currentSpeaker && currentContent.trim()) {
          turns.push({
            speaker: currentSpeaker,
            content: currentContent.trim(),
          });
        }
        currentSpeaker = speakerMatch[1] || speakerMatch[2];
        currentContent = line.replace(speakerMatch[0], '').trim();
      } else {
        currentContent += ' ' + line.trim();
      }
    }

    // Save last turn
    if (currentSpeaker && currentContent.trim()) {
      turns.push({
        speaker: currentSpeaker,
        content: currentContent.trim(),
      });
    }

    return {
      total_turns: turns.length,
      turns: input.format === 'raw' ? input.transcript : turns,
      word_count: input.transcript.split(/\s+/).length,
      speakers: [...new Set(turns.map((t) => t.speaker))],
    };
  },
  cost: { latency_ms: 50 },
  requires: [],
  best_for: [
    'Parsing raw interview transcripts',
    'Extracting speaker turns from transcripts',
    'Preparing transcripts for analysis',
  ],
  not_suitable_for: [
    'Analyzing transcript content',
    'Generating feedback',
  ],
  examples: [
    {
      goal: 'Parse an interview transcript into structured turns',
      input: { transcript: 'Interviewer: Hello\nCandidate: Hi there', format: 'structured' },
      output: { total_turns: 2, turns: [], word_count: 4, speakers: ['Interviewer', 'Candidate'] },
    },
  ],
  enabled: true,
};

/**
 * GPT-4 Analyzer Tool
 */
const gpt4AnalyzerTool: ToolDefinition<
  z.infer<typeof GPT4AnalyzerInput>,
  z.infer<typeof GPT4AnalyzerOutput>
> = {
  id: 'gpt4_analyzer',
  name: 'GPT-4 Analyzer',
  description: 'Analyze content using GPT-4 for deep insights',
  version: '1.0.0',
  category: 'analysis',
  tags: ['ai', 'analysis', 'gpt-4', 'interview'],
  input_schema: GPT4AnalyzerInput,
  output_schema: GPT4AnalyzerOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: input.context || INTERVIEWER_PROMPTS.SYSTEM_CONTEXT,
        },
        { role: 'user', content: input.prompt },
      ],
      temperature: input.temperature ?? 0.3,
      response_format:
        input.response_format === 'json' ? { type: 'json_object' } : undefined,
    });

    const content = response.choices[0]?.message?.content || '';

    return {
      response: input.response_format === 'json' ? JSON.parse(content) : content,
      tokens_used: response.usage?.total_tokens || 0,
    };
  },
  cost: { tokens: 2000, latency_ms: 5000 },
  requires: ['OPENAI_API_KEY'],
  best_for: [
    'Deep analysis of interview content',
    'Generating insights from transcripts',
    'Complex reasoning tasks',
  ],
  not_suitable_for: [
    'Simple text parsing',
    'Tasks that don\'t need AI',
  ],
  examples: [
    {
      goal: 'Analyze interview response quality',
      input: { prompt: 'Analyze this response...', response_format: 'json' },
      output: { response: {}, tokens_used: 500 },
    },
  ],
  enabled: true,
};

/**
 * Skill Extractor Tool
 */
const skillExtractorTool: ToolDefinition<
  z.infer<typeof SkillExtractorInput>,
  z.infer<typeof SkillExtractorOutput>
> = {
  id: 'skill_extractor',
  name: 'Skill Extractor',
  description: 'Extract skills demonstrated in interview responses',
  version: '1.0.0',
  category: 'analysis',
  tags: ['skills', 'interview', 'extraction'],
  input_schema: SkillExtractorInput,
  output_schema: SkillExtractorOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    const prompt = buildPrompt('SKILL_EXTRACTION', {
      TRANSCRIPT: input.transcript.slice(0, 8000),
      INTERVIEW_TYPE: input.interview_type,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: INTERVIEWER_PROMPTS.SYSTEM_CONTEXT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return {
      skills: parsed.skills || [],
      technical_skills: (parsed.skills || []).filter(
        (s: { type?: string }) => s.type === 'technical'
      ),
      soft_skills: (parsed.skills || []).filter(
        (s: { type?: string }) => s.type === 'soft'
      ),
    };
  },
  cost: { tokens: 1000, latency_ms: 3000 },
  requires: ['OPENAI_API_KEY'],
  best_for: [
    'Extracting technical skills from interviews',
    'Identifying soft skills demonstrated',
    'Building skill profiles',
  ],
  not_suitable_for: [
    'Non-interview content',
    'Tasks without skill context',
  ],
  examples: [
    {
      goal: 'Extract skills from a technical interview',
      input: { transcript: '...', interview_type: 'technical' },
      output: { skills: [], technical_skills: [], soft_skills: [] },
    },
  ],
  enabled: true,
};

/**
 * Feedback Generator Tool
 */
const feedbackGeneratorTool: ToolDefinition<
  z.infer<typeof FeedbackGeneratorInput>,
  z.infer<typeof FeedbackGeneratorOutput>
> = {
  id: 'feedback_generator',
  name: 'Feedback Generator',
  description: 'Generate structured interview feedback',
  version: '1.0.0',
  category: 'generation',
  tags: ['feedback', 'interview', 'generation'],
  input_schema: FeedbackGeneratorInput,
  output_schema: FeedbackGeneratorOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    const prompt = buildPrompt('SYNTHESIS', {
      INTERVIEW_TYPE: input.interview_type,
      STEP_RESULTS: JSON.stringify(input.analysis, null, 2),
      PAST_PATTERNS: JSON.stringify(input.user_patterns || [], null, 2),
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: INTERVIEWER_PROMPTS.SYSTEM_CONTEXT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    
    return {
      overall_score: parsed.overall_score || 0,
      strengths: parsed.strengths || [],
      improvements: parsed.improvements || [],
      detailed_feedback: parsed.detailed_feedback || {},
      action_items: parsed.action_items || [],
      personalized_tips: parsed.personalized_tips || [],
    };
  },
  cost: { tokens: 3000, latency_ms: 8000 },
  requires: ['OPENAI_API_KEY'],
  best_for: [
    'Generating comprehensive feedback',
    'Creating personalized recommendations',
    'Synthesizing analysis results',
  ],
  not_suitable_for: [
    'Raw data extraction',
    'Simple parsing tasks',
  ],
  examples: [
    {
      goal: 'Generate feedback from analysis results',
      input: { analysis: {}, interview_type: 'behavioral' },
      output: { overall_score: 75, strengths: [], improvements: [], detailed_feedback: {}, action_items: [], personalized_tips: [] },
    },
  ],
  enabled: true,
};

/**
 * Strength Analyzer Tool
 */
const strengthAnalyzerTool: ToolDefinition<
  z.infer<typeof StrengthAnalyzerInput>,
  z.infer<typeof StrengthAnalyzerOutput>
> = {
  id: 'strength_analyzer',
  name: 'Strength Analyzer',
  description: 'Identify candidate strengths from interview',
  version: '1.0.0',
  category: 'analysis',
  tags: ['strengths', 'interview', 'analysis'],
  input_schema: StrengthAnalyzerInput,
  output_schema: StrengthAnalyzerOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    const prompt = input.existing_strengths?.length
      ? buildPrompt('STRENGTH_DEEP_DIVE', {
          TRANSCRIPT: input.transcript.slice(0, 8000),
          EXISTING_STRENGTHS: JSON.stringify(input.existing_strengths),
        })
      : buildPrompt('STRENGTH_ANALYSIS', {
          TRANSCRIPT: input.transcript.slice(0, 8000),
        });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: INTERVIEWER_PROMPTS.SYSTEM_CONTEXT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(content);
  },
  cost: { tokens: 1500, latency_ms: 4000 },
  requires: ['OPENAI_API_KEY'],
  best_for: [
    'Identifying candidate strengths',
    'Building on existing strength analysis',
    'Finding positive patterns',
  ],
  not_suitable_for: [
    'Identifying weaknesses',
    'General content analysis',
  ],
  examples: [
    {
      goal: 'Identify strengths from transcript',
      input: { transcript: '...' },
      output: { strengths: [] },
    },
  ],
  enabled: true,
};

/**
 * Improvement Analyzer Tool
 */
const improvementAnalyzerTool: ToolDefinition<
  z.infer<typeof ImprovementAnalyzerInput>,
  z.infer<typeof ImprovementAnalyzerOutput>
> = {
  id: 'improvement_analyzer',
  name: 'Improvement Analyzer',
  description: 'Identify areas for improvement from interview',
  version: '1.0.0',
  category: 'analysis',
  tags: ['improvements', 'interview', 'analysis'],
  input_schema: ImprovementAnalyzerInput,
  output_schema: ImprovementAnalyzerOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    const prompt = buildPrompt('IMPROVEMENT_ANALYSIS', {
      TRANSCRIPT: input.transcript.slice(0, 8000),
      STRENGTHS: JSON.stringify(input.strengths || []),
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: INTERVIEWER_PROMPTS.SYSTEM_CONTEXT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(content);
  },
  cost: { tokens: 1500, latency_ms: 4000 },
  requires: ['OPENAI_API_KEY'],
  best_for: [
    'Finding areas for improvement',
    'Constructive feedback generation',
    'Gap analysis',
  ],
  not_suitable_for: [
    'Identifying strengths only',
    'Positive-only feedback',
  ],
  examples: [
    {
      goal: 'Identify improvement areas from transcript',
      input: { transcript: '...' },
      output: { improvements: [] },
    },
  ],
  enabled: true,
};

/**
 * Action Item Generator Tool
 */
const actionItemGeneratorTool: ToolDefinition<
  z.infer<typeof ActionItemGeneratorInput>,
  z.infer<typeof ActionItemGeneratorOutput>
> = {
  id: 'action_item_generator',
  name: 'Action Item Generator',
  description: 'Generate actionable next steps from analysis',
  version: '1.0.0',
  category: 'generation',
  tags: ['action-items', 'interview', 'generation'],
  input_schema: ActionItemGeneratorInput,
  output_schema: ActionItemGeneratorOutput,
  handler: async (input) => {
    const openai = new OpenAI();

    const prompt = buildPrompt('ACTION_ITEMS', {
      IMPROVEMENTS: JSON.stringify(input.improvements),
      INTERVIEW_TYPE: input.interview_type,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: INTERVIEWER_PROMPTS.SYSTEM_CONTEXT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(content);
  },
  cost: { tokens: 800, latency_ms: 2500 },
  requires: ['OPENAI_API_KEY'],
  best_for: [
    'Creating actionable next steps',
    'Converting improvements to tasks',
    'Building practice plans',
  ],
  not_suitable_for: [
    'Analysis tasks',
    'Transcript parsing',
  ],
  examples: [
    {
      goal: 'Generate action items from improvements',
      input: { improvements: [], interview_type: 'behavioral' },
      output: { action_items: [] },
    },
  ],
  enabled: true,
};

// ============================================================================
// Registration
// ============================================================================

/**
 * Register all interviewer tools with the global registry
 */
export function registerInterviewerTools(): void {
  toolRegistry.register(transcriptParserTool);
  toolRegistry.register(gpt4AnalyzerTool);
  toolRegistry.register(skillExtractorTool);
  toolRegistry.register(feedbackGeneratorTool);
  toolRegistry.register(strengthAnalyzerTool);
  toolRegistry.register(improvementAnalyzerTool);
  toolRegistry.register(actionItemGeneratorTool);

  console.log('[InterviewerTools] Registered 7 interviewer tools');
}

/**
 * Get all interviewer tool IDs
 */
export function getInterviewerToolIds(): string[] {
  return [
    'transcript_parser',
    'gpt4_analyzer',
    'skill_extractor',
    'feedback_generator',
    'strength_analyzer',
    'improvement_analyzer',
    'action_item_generator',
  ];
}

/**
 * Export individual tools for direct use
 */
export {
  transcriptParserTool,
  gpt4AnalyzerTool,
  skillExtractorTool,
  feedbackGeneratorTool,
  strengthAnalyzerTool,
  improvementAnalyzerTool,
  actionItemGeneratorTool,
};
