/**
 * Rejection Analyzer
 *
 * AI-powered analysis of rejection feedback to extract:
 * - Skill gaps mentioned
 * - Actionable insights
 * - Sentiment analysis
 * - Recommendations for improvement
 *
 * @see docs/agentic-improvements/09-STRATEGIST_AGENT.md
 */

import OpenAI from 'openai';
import { safeJsonParseOrDefault } from '../../utils/safe-json';

// ============================================================================
// Types
// ============================================================================

/**
 * Identified skill gap from rejection
 */
export interface SkillGap {
  skill: string;
  mentioned_context: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  category: 'technical' | 'soft_skill' | 'experience' | 'cultural_fit';
}

/**
 * Full rejection analysis
 */
export interface RejectionAnalysis {
  rejection_type:
    | 'skill_gap'
    | 'experience_mismatch'
    | 'cultural_fit'
    | 'competition'
    | 'generic'
    | 'unknown';
  identified_gaps: SkillGap[];
  sentiment: 'positive' | 'neutral' | 'negative';
  is_actionable: boolean;
  actionable_items: string[];
  summary: string;
  confidence: number;
  raw_feedback: string;
}

/**
 * Analyzer configuration
 */
export interface RejectionAnalyzerConfig {
  model: string;
  temperature: number;
  max_tokens: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: RejectionAnalyzerConfig = {
  model: 'gpt-4o-mini',
  temperature: 0.3,
  max_tokens: 1000,
};

// ============================================================================
// Rejection Analyzer Class
// ============================================================================

export class RejectionAnalyzer {
  private config: RejectionAnalyzerConfig;
  private openai: OpenAI;

  constructor(config: Partial<RejectionAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.openai = new OpenAI();
  }

  /**
   * Analyze rejection feedback text
   */
  async analyze(rejectionText: string): Promise<RejectionAnalysis> {
    if (!rejectionText || rejectionText.trim().length < 10) {
      return this.createGenericAnalysis(rejectionText);
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        temperature: this.config.temperature,
        max_tokens: this.config.max_tokens,
        messages: [
          {
            role: 'system',
            content: REJECTION_ANALYSIS_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: `Analyze this rejection feedback:\n\n${rejectionText}`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.createGenericAnalysis(rejectionText);
      }

      const parsed = safeJsonParseOrDefault<Partial<RejectionAnalysis>>(content, {});

      return {
        rejection_type: parsed.rejection_type || 'unknown',
        identified_gaps: this.validateGaps(parsed.identified_gaps),
        sentiment: parsed.sentiment || 'neutral',
        is_actionable:
          parsed.is_actionable ?? (parsed.identified_gaps?.length ?? 0) > 0,
        actionable_items: parsed.actionable_items || [],
        summary:
          parsed.summary || 'Unable to extract specific feedback from rejection',
        confidence: parsed.confidence ?? 0.5,
        raw_feedback: rejectionText,
      };
    } catch (error) {
      console.error('[RejectionAnalyzer] Error analyzing rejection:', error);
      return this.createGenericAnalysis(rejectionText);
    }
  }

  /**
   * Batch analyze multiple rejections
   */
  async analyzeBatch(
    rejections: Array<{ id: string; text: string }>
  ): Promise<Array<{ id: string; analysis: RejectionAnalysis }>> {
    const results: Array<{ id: string; analysis: RejectionAnalysis }> = [];

    // Process in parallel with concurrency limit
    const batchSize = 3;
    for (let i = 0; i < rejections.length; i += batchSize) {
      const batch = rejections.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (rejection) => ({
          id: rejection.id,
          analysis: await this.analyze(rejection.text),
        }))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Aggregate insights from multiple rejection analyses
   */
  aggregateInsights(analyses: RejectionAnalysis[]): {
    top_skill_gaps: Array<{ skill: string; count: number; importance: string }>;
    common_themes: string[];
    overall_actionable_rate: number;
    recommendations: string[];
  } {
    const skillCounts = new Map<
      string,
      { count: number; importances: string[] }
    >();

    for (const analysis of analyses) {
      for (const gap of analysis.identified_gaps) {
        const existing = skillCounts.get(gap.skill) || {
          count: 0,
          importances: [],
        };
        existing.count++;
        existing.importances.push(gap.importance);
        skillCounts.set(gap.skill, existing);
      }
    }

    // Sort by count descending
    const topGaps = Array.from(skillCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([skill, data]) => ({
        skill,
        count: data.count,
        importance: this.getAverageImportance(data.importances),
      }));

    // Calculate actionable rate
    const actionableCount = analyses.filter((a) => a.is_actionable).length;
    const actionableRate =
      analyses.length > 0 ? (actionableCount / analyses.length) * 100 : 0;

    // Collect unique actionable items
    const allActionableItems = analyses.flatMap((a) => a.actionable_items);
    const uniqueRecommendations = [...new Set(allActionableItems)].slice(0, 10);

    // Identify common themes
    const themes: string[] = [];
    const typeCounts = new Map<string, number>();
    for (const analysis of analyses) {
      const current = typeCounts.get(analysis.rejection_type) || 0;
      typeCounts.set(analysis.rejection_type, current + 1);
    }

    for (const [type, count] of typeCounts.entries()) {
      if (count >= 2) {
        themes.push(`${type} (${count} occurrences)`);
      }
    }

    return {
      top_skill_gaps: topGaps,
      common_themes: themes,
      overall_actionable_rate: actionableRate,
      recommendations: uniqueRecommendations,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private createGenericAnalysis(rawFeedback: string): RejectionAnalysis {
    return {
      rejection_type: 'generic',
      identified_gaps: [],
      sentiment: 'neutral',
      is_actionable: false,
      actionable_items: [],
      summary:
        'Generic rejection without specific feedback. Consider requesting detailed feedback from the recruiter.',
      confidence: 0.2,
      raw_feedback: rawFeedback,
    };
  }

  private validateGaps(gaps: unknown): SkillGap[] {
    if (!Array.isArray(gaps)) return [];

    return gaps
      .filter(
        (gap): gap is Record<string, unknown> =>
          typeof gap === 'object' && gap !== null
      )
      .map((gap) => ({
        skill: String(gap.skill || 'unknown'),
        mentioned_context: String(gap.mentioned_context || ''),
        importance: this.validateImportance(gap.importance),
        category: this.validateCategory(gap.category),
      }))
      .filter((gap) => gap.skill !== 'unknown');
  }

  private validateImportance(
    value: unknown
  ): 'critical' | 'high' | 'medium' | 'low' {
    const valid = ['critical', 'high', 'medium', 'low'];
    return valid.includes(String(value))
      ? (String(value) as 'critical' | 'high' | 'medium' | 'low')
      : 'medium';
  }

  private validateCategory(
    value: unknown
  ): 'technical' | 'soft_skill' | 'experience' | 'cultural_fit' {
    const valid = ['technical', 'soft_skill', 'experience', 'cultural_fit'];
    return valid.includes(String(value))
      ? (String(value) as 'technical' | 'soft_skill' | 'experience' | 'cultural_fit')
      : 'technical';
  }

  private getAverageImportance(importances: string[]): string {
    const weights: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    const totalWeight = importances.reduce(
      (sum, imp) => sum + (weights[imp] || 2),
      0
    );
    const avgWeight = totalWeight / importances.length;

    if (avgWeight >= 3.5) return 'critical';
    if (avgWeight >= 2.5) return 'high';
    if (avgWeight >= 1.5) return 'medium';
    return 'low';
  }
}

// ============================================================================
// System Prompt
// ============================================================================

const REJECTION_ANALYSIS_SYSTEM_PROMPT = `You are an expert career coach analyzing job application rejection feedback.

Your task is to extract actionable insights from rejection messages to help candidates improve.

Analyze the rejection feedback and return a JSON object with this structure:
{
  "rejection_type": "skill_gap" | "experience_mismatch" | "cultural_fit" | "competition" | "generic" | "unknown",
  "identified_gaps": [
    {
      "skill": "specific skill name",
      "mentioned_context": "the context in which it was mentioned",
      "importance": "critical" | "high" | "medium" | "low",
      "category": "technical" | "soft_skill" | "experience" | "cultural_fit"
    }
  ],
  "sentiment": "positive" | "neutral" | "negative",
  "is_actionable": true/false,
  "actionable_items": ["specific action the candidate can take"],
  "summary": "brief summary of the rejection reason and key takeaways",
  "confidence": 0.0-1.0 (how confident you are in this analysis)
}

Guidelines:
1. Extract SPECIFIC skills mentioned, not vague categories
2. "system design" is a skill, "needs improvement" is not
3. Consider implicit skill gaps (e.g., "looking for senior engineers" → experience gap)
4. Be conservative with confidence - if feedback is vague, mark it as generic
5. Actionable items should be specific (e.g., "Practice system design interviews" not "improve skills")
6. Look for patterns in wording that indicate the real reason for rejection

Examples of skill extraction:
- "stronger background in distributed systems" → skill: "distributed_systems", importance: "high"
- "more senior candidates" → skill: "experience_level", category: "experience"
- "better culture fit" → category: "cultural_fit"`;

// ============================================================================
// Factory Function
// ============================================================================

export function createRejectionAnalyzer(
  config?: Partial<RejectionAnalyzerConfig>
): RejectionAnalyzer {
  return new RejectionAnalyzer(config);
}
