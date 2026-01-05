/**
 * Confidence Scorer
 *
 * Evaluates the quality of agent outputs to determine if they meet
 * success criteria or need iteration.
 *
 * @see docs/agentic-improvements/06-ITERATIVE_LOOPS.md
 */

import OpenAI from 'openai';
import { z } from 'zod';
import type { Goal, SubGoal } from './goal-decomposer';

// ============================================================================
// Types
// ============================================================================

/**
 * Criteria for evaluating output quality
 */
export interface EvaluationCriteria {
  criterion: string;
  weight: number; // 0-1, weights should sum to 1
  rubric?: {
    excellent: string; // 0.9-1.0
    good: string; // 0.7-0.89
    acceptable: string; // 0.5-0.69
    poor: string; // 0.0-0.49
  };
}

/**
 * Result of a single criterion evaluation
 */
export interface CriterionScore {
  criterion: string;
  score: number; // 0-1
  reasoning: string;
  suggestions?: string[];
}

/**
 * Complete confidence assessment
 */
export interface ConfidenceAssessment {
  overall_score: number; // 0-1 weighted average
  criterion_scores: CriterionScore[];
  meets_threshold: boolean;
  reasoning: string;
  suggestions_for_improvement: string[];
  iteration_needed: boolean;
  confidence_delta?: number; // Change from previous assessment
}

/**
 * Configuration for the scorer
 */
export interface ConfidenceScorerConfig {
  model: 'gpt-4o-mini' | 'gpt-4o';
  default_threshold: number;
  strict_mode: boolean; // Require all criteria to pass, not just overall
}

/**
 * Context for scoring
 */
export interface ScoringContext {
  goal: Goal | SubGoal;
  output: unknown;
  previous_attempts?: Array<{
    output: unknown;
    score: number;
  }>;
  execution_metadata?: {
    duration_ms: number;
    tools_used: string[];
    errors_encountered: string[];
  };
}

// ============================================================================
// Zod Schemas
// ============================================================================

const CriterionScoreSchema = z.object({
  criterion: z.string(),
  score: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestions: z.array(z.string()).nullish(), // Allow null from GPT responses
});

const AssessmentResponseSchema = z.object({
  criterion_scores: z.array(CriterionScoreSchema),
  overall_reasoning: z.string(),
  suggestions_for_improvement: z.array(z.string()),
});

// ============================================================================
// Confidence Scorer Class
// ============================================================================

/**
 * ConfidenceScorer evaluates agent output quality
 */
export class ConfidenceScorer {
  private openai: OpenAI;
  private config: ConfidenceScorerConfig;

  constructor(config: ConfidenceScorerConfig) {
    this.config = config;
    this.openai = new OpenAI();
  }

  /**
   * Score an output against a goal's success criteria
   */
  async score(context: ScoringContext): Promise<ConfidenceAssessment> {
    const { goal, output, previous_attempts } = context;

    // Convert success criteria to evaluation criteria with weights
    const criteria = this.buildCriteria(goal.success_criteria);

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(goal, output, criteria);

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2, // Low temperature for consistent evaluation
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    const parsed = AssessmentResponseSchema.parse(JSON.parse(content));

    // Transform null suggestions to undefined for type compatibility
    const criterionScores: CriterionScore[] = parsed.criterion_scores.map((c) => ({
      criterion: c.criterion,
      score: c.score,
      reasoning: c.reasoning,
      suggestions: c.suggestions ?? undefined,
    }));

    // Calculate weighted overall score
    const overallScore = this.calculateOverallScore(
      criterionScores,
      criteria
    );

    // Determine if threshold is met
    const meetsThreshold = this.config.strict_mode
      ? criterionScores.every((c) => c.score >= this.config.default_threshold)
      : overallScore >= this.config.default_threshold;

    // Calculate confidence delta if previous attempts exist
    let confidenceDelta: number | undefined;
    if (previous_attempts?.length) {
      const lastScore = previous_attempts[previous_attempts.length - 1].score;
      confidenceDelta = overallScore - lastScore;
    }

    return {
      overall_score: overallScore,
      criterion_scores: criterionScores,
      meets_threshold: meetsThreshold,
      reasoning: parsed.overall_reasoning,
      suggestions_for_improvement: parsed.suggestions_for_improvement,
      iteration_needed: !meetsThreshold,
      confidence_delta: confidenceDelta,
    };
  }

  /**
   * Quick check if an output likely meets a threshold
   * (Faster than full scoring, useful for early termination)
   */
  async quickCheck(
    output: unknown,
    criteria: string[],
    threshold: number = this.config.default_threshold
  ): Promise<{ passes: boolean; estimated_score: number }> {
    const prompt = `Quickly assess if this output meets the criteria (threshold: ${threshold}):

Criteria:
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Output:
${typeof output === 'string' ? output : JSON.stringify(output, null, 2)}

Respond with JSON: { "passes": boolean, "estimated_score": number 0-1 }`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini', // Always use mini for quick checks
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 100,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { passes: false, estimated_score: 0 };
    }

    const result = JSON.parse(content);
    return {
      passes: Boolean(result.passes),
      estimated_score: Number(result.estimated_score) || 0,
    };
  }

  /**
   * Compare multiple outputs to select the best one
   */
  async compare(
    outputs: unknown[],
    goal: Goal | SubGoal
  ): Promise<{
    best_index: number;
    scores: number[];
    reasoning: string;
  }> {
    if (outputs.length === 0) {
      throw new Error('No outputs to compare');
    }

    if (outputs.length === 1) {
      const assessment = await this.score({ goal, output: outputs[0] });
      return {
        best_index: 0,
        scores: [assessment.overall_score],
        reasoning: 'Only one output provided',
      };
    }

    const prompt = `Compare these outputs for achieving the goal and select the best one:

Goal: ${goal.description}

Success Criteria:
${goal.success_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Outputs:
${outputs.map((o, i) => `
--- Output ${i + 1} ---
${typeof o === 'string' ? o : JSON.stringify(o, null, 2)}
`).join('\n')}

Compare each output against the criteria and select the best one.

Respond with JSON:
{
  "best_index": number (0-indexed),
  "scores": [score_for_each_output],
  "reasoning": "explanation of why best was chosen"
}`;

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    const result = JSON.parse(content);
    return {
      best_index: result.best_index,
      scores: result.scores,
      reasoning: result.reasoning,
    };
  }

  /**
   * Track improvement across iterations
   */
  trackProgress(
    assessments: ConfidenceAssessment[]
  ): {
    trend: 'improving' | 'degrading' | 'stable' | 'fluctuating';
    improvement_rate: number;
    predicted_iterations_to_threshold: number | null;
    recommendation: string;
  } {
    if (assessments.length < 2) {
      return {
        trend: 'stable',
        improvement_rate: 0,
        predicted_iterations_to_threshold: null,
        recommendation: 'Not enough data to track progress',
      };
    }

    const scores = assessments.map((a) => a.overall_score);
    const deltas: number[] = [];

    for (let i = 1; i < scores.length; i++) {
      deltas.push(scores[i] - scores[i - 1]);
    }

    const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const allPositive = deltas.every((d) => d > 0);
    const allNegative = deltas.every((d) => d < 0);

    let trend: 'improving' | 'degrading' | 'stable' | 'fluctuating';
    if (Math.abs(avgDelta) < 0.02) {
      trend = 'stable';
    } else if (allPositive || avgDelta > 0.05) {
      trend = 'improving';
    } else if (allNegative || avgDelta < -0.05) {
      trend = 'degrading';
    } else {
      trend = 'fluctuating';
    }

    // Predict iterations to threshold
    const lastScore = scores[scores.length - 1];
    const threshold = this.config.default_threshold;
    let predicted: number | null = null;

    if (trend === 'improving' && avgDelta > 0 && lastScore < threshold) {
      predicted = Math.ceil((threshold - lastScore) / avgDelta);
    }

    // Generate recommendation
    let recommendation: string;
    switch (trend) {
      case 'improving':
        recommendation =
          predicted !== null
            ? `Continue iterating. Estimated ${predicted} more iterations to reach threshold.`
            : 'Continue iterating. Progress is being made.';
        break;
      case 'degrading':
        recommendation =
          'Consider adapting the plan. Output quality is decreasing.';
        break;
      case 'stable':
        recommendation =
          lastScore >= threshold
            ? 'Threshold reached. Proceed to next goal.'
            : 'Try a different approach. Current strategy has plateaued.';
        break;
      case 'fluctuating':
        recommendation =
          'Results are inconsistent. Consider simplifying the approach.';
        break;
    }

    return {
      trend,
      improvement_rate: avgDelta,
      predicted_iterations_to_threshold: predicted,
      recommendation,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private buildCriteria(successCriteria: string[]): EvaluationCriteria[] {
    const weight = 1 / successCriteria.length;

    return successCriteria.map((criterion) => ({
      criterion,
      weight,
      rubric: {
        excellent: `Fully meets or exceeds: "${criterion}"`,
        good: `Mostly meets: "${criterion}" with minor gaps`,
        acceptable: `Partially meets: "${criterion}" but has notable gaps`,
        poor: `Does not meet: "${criterion}"`,
      },
    }));
  }

  private buildSystemPrompt(): string {
    return `You are an expert evaluator for autonomous agent outputs. Your task is to objectively assess output quality against specific criteria.

Scoring Guidelines:
- 0.9-1.0 (Excellent): Fully meets or exceeds the criterion
- 0.7-0.89 (Good): Mostly meets with minor gaps
- 0.5-0.69 (Acceptable): Partially meets with notable gaps
- 0.0-0.49 (Poor): Does not adequately meet the criterion

Be objective and constructive. Provide actionable suggestions for improvement.

Always respond in valid JSON format.`;
  }

  private buildUserPrompt(
    goal: Goal | SubGoal,
    output: unknown,
    criteria: EvaluationCriteria[]
  ): string {
    const outputStr =
      typeof output === 'string' ? output : JSON.stringify(output, null, 2);

    return `Evaluate this output against the goal criteria:

Goal: ${goal.description}

Output to Evaluate:
${outputStr.slice(0, 4000)}${outputStr.length > 4000 ? '...[truncated]' : ''}

Evaluation Criteria:
${criteria.map((c, i) => `
${i + 1}. ${c.criterion} (weight: ${(c.weight * 100).toFixed(0)}%)
   ${c.rubric ? `Rubric: Excellent = ${c.rubric.excellent}` : ''}
`).join('\n')}

For each criterion, provide:
1. A score (0-1)
2. Reasoning for the score
3. Specific suggestions for improvement

Respond with JSON:
{
  "criterion_scores": [
    {
      "criterion": "the criterion text",
      "score": 0.X,
      "reasoning": "why this score",
      "suggestions": ["suggestion 1", "suggestion 2"]
    }
  ],
  "overall_reasoning": "overall assessment",
  "suggestions_for_improvement": ["top priority improvements"]
}`;
  }

  private calculateOverallScore(
    scores: CriterionScore[],
    criteria: EvaluationCriteria[]
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const score of scores) {
      const criterion = criteria.find((c) => c.criterion === score.criterion);
      const weight = criterion?.weight || 1 / scores.length;
      weightedSum += score.score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a confidence scorer with default settings
 */
export function createConfidenceScorer(
  options: Partial<ConfidenceScorerConfig> = {}
): ConfidenceScorer {
  return new ConfidenceScorer({
    model: 'gpt-4o-mini',
    default_threshold: 0.85,
    strict_mode: false,
    ...options,
  });
}
