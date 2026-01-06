/**
 * Strategist Agent Prompts
 *
 * AI prompts for strategic analysis, pattern detection, and recommendations.
 *
 * @see docs/agentic-improvements/09-STRATEGIST_AGENT.md
 */

// ============================================================================
// Main Prompts Object
// ============================================================================

export const STRATEGIST_PROMPTS = {
  /**
   * System context for the strategist agent
   */
  SYSTEM_CONTEXT: `You are a strategic career advisor analyzing a user's career progress.
Your role is to identify patterns, detect issues early, and recommend interventions.

You have access to data from multiple sources:
- Interview performance and feedback
- Job applications and rejections
- Learning progress on roadmap modules
- Skill verification history
- Market trends and job matches

Your analysis should be:
- Data-driven: Base conclusions on actual metrics
- Actionable: Provide specific recommendations
- Balanced: Acknowledge progress while addressing gaps
- Prioritized: Focus on high-impact improvements first`,

  /**
   * Prompt for analyzing rejection patterns
   */
  REJECTION_ANALYSIS: `Analyze the following rejection data to identify patterns and recommend improvements.

Rejections Data:
{REJECTIONS_DATA}

Previous Analysis (if any):
{PREVIOUS_ANALYSIS}

Provide your analysis as a JSON object:
{
  "patterns_identified": [
    {
      "pattern_type": "skill_gap" | "experience_mismatch" | "targeting_issue" | "resume_issue",
      "description": "Clear description of the pattern",
      "evidence": ["List of specific evidence points"],
      "severity": "critical" | "high" | "medium" | "low",
      "frequency": number
    }
  ],
  "root_causes": [
    {
      "cause": "The underlying cause",
      "contributing_factors": ["factors"],
      "affected_areas": ["areas of career search affected"]
    }
  ],
  "recommendations": [
    {
      "action": "Specific action to take",
      "priority": "immediate" | "short_term" | "long_term",
      "expected_impact": "Description of expected improvement",
      "effort": "low" | "medium" | "high"
    }
  ],
  "summary": "Executive summary of the analysis"
}`,

  /**
   * Prompt for detecting cross-domain patterns
   */
  PATTERN_DETECTION: `Analyze the following career data to detect patterns that require intervention.

Interview Data:
{INTERVIEW_DATA}

Application Data:
{APPLICATION_DATA}

Progress Data:
{PROGRESS_DATA}

Market Context:
{MARKET_CONTEXT}

Look for:
1. Skill gaps appearing across multiple data sources
2. Declining trends in performance metrics
3. Misalignment between skills and target roles
4. Velocity changes (sudden drops in activity)
5. Success patterns to reinforce

Return your analysis as JSON:
{
  "detected_patterns": [
    {
      "type": "skill_gap" | "trend" | "misalignment" | "velocity" | "success",
      "severity": "critical" | "high" | "medium" | "low",
      "description": "What was detected",
      "evidence_sources": ["interview", "applications", "progress", "market"],
      "confidence": 0.0-1.0
    }
  ],
  "correlations": [
    {
      "observation": "How different data sources relate",
      "implication": "What this means for the user"
    }
  ],
  "priority_actions": [
    "Ordered list of recommended actions"
  ]
}`,

  /**
   * Prompt for generating strategic recommendations
   */
  RECOMMENDATIONS: `Based on the following analysis, generate strategic recommendations for the user.

Patterns Detected:
{PATTERNS}

Velocity Report:
{VELOCITY}

User Context:
{USER_CONTEXT}

Generate recommendations that are:
1. Specific and actionable
2. Prioritized by impact
3. Achievable within reasonable timeframes
4. Aligned with user's goals

Return as JSON:
{
  "recommendations": [
    {
      "title": "Short title",
      "description": "Detailed description",
      "category": "skill_development" | "interview_prep" | "application_strategy" | "networking" | "mindset",
      "priority": 1-5,
      "expected_outcome": "What success looks like",
      "timeline": "Suggested timeline",
      "resources": ["Optional helpful resources"]
    }
  ],
  "quick_wins": [
    "List of easy, high-impact actions to take immediately"
  ],
  "focus_areas": [
    {
      "area": "Main focus area",
      "reason": "Why this matters now",
      "time_allocation": "Suggested time investment"
    }
  ],
  "encouragement": "Personalized message acknowledging progress and motivating improvement"
}`,

  /**
   * Prompt for intervention decisions
   */
  INTERVENTION_DECISION: `Based on the detected patterns, decide what interventions to trigger.

Detected Patterns:
{PATTERNS}

Available Interventions:
- REPATH_ROADMAP: Request the Architect to adjust learning path
- NOTIFY_USER: Send notification/alert to user
- ADJUST_STRATEGY: Modify application strategy (targeting, volume)
- REQUEST_PRACTICE: Suggest additional interview practice
- CELEBRATE: Send celebration for achievements
- NO_ACTION: No intervention needed

For each pattern, decide:
{
  "interventions": [
    {
      "pattern_id": "ID of the pattern",
      "action": "One of the available interventions",
      "reason": "Why this intervention",
      "urgency": "immediate" | "soon" | "when_convenient",
      "payload": {
        "Additional data for the intervention"
      }
    }
  ],
  "deferred_actions": [
    {
      "action": "Action to take later",
      "trigger_condition": "When to take it",
      "reason": "Why defer"
    }
  ]
}`,

  /**
   * Prompt for synthesizing insights
   */
  SYNTHESIS: `Synthesize all the following data into a comprehensive strategic insight report.

Patterns:
{PATTERNS}

Rejection Analysis:
{REJECTION_ANALYSIS}

Velocity Report:
{VELOCITY_REPORT}

Milestones:
{MILESTONES}

Create a synthesized report:
{
  "overall_health": "excellent" | "good" | "needs_attention" | "concerning",
  "health_score": 0-100,
  "key_insights": [
    {
      "insight": "Key observation",
      "importance": "high" | "medium" | "low",
      "action_required": true | false
    }
  ],
  "strengths": [
    "Areas where user is performing well"
  ],
  "improvement_areas": [
    {
      "area": "Area needing improvement",
      "current_state": "Where they are now",
      "target_state": "Where they should be",
      "gap_severity": "critical" | "high" | "medium" | "low"
    }
  ],
  "30_day_forecast": {
    "optimistic": "Best case scenario with action",
    "baseline": "Expected outcome without changes",
    "risks": ["Potential risks to watch"]
  },
  "executive_summary": "2-3 sentence summary of the user's career search status"
}`,
};

// ============================================================================
// Prompt Builder Functions
// ============================================================================

/**
 * Build rejection analysis prompt with data
 */
export function buildRejectionAnalysisPrompt(
  rejectionsData: unknown,
  previousAnalysis?: unknown
): string {
  return STRATEGIST_PROMPTS.REJECTION_ANALYSIS.replace(
    '{REJECTIONS_DATA}',
    JSON.stringify(rejectionsData, null, 2)
  ).replace(
    '{PREVIOUS_ANALYSIS}',
    previousAnalysis ? JSON.stringify(previousAnalysis, null, 2) : 'None'
  );
}

/**
 * Build pattern detection prompt with data
 */
export function buildPatternDetectionPrompt(data: {
  interviews: unknown;
  applications: unknown;
  progress: unknown;
  market: unknown;
}): string {
  return STRATEGIST_PROMPTS.PATTERN_DETECTION.replace(
    '{INTERVIEW_DATA}',
    JSON.stringify(data.interviews, null, 2)
  )
    .replace('{APPLICATION_DATA}', JSON.stringify(data.applications, null, 2))
    .replace('{PROGRESS_DATA}', JSON.stringify(data.progress, null, 2))
    .replace('{MARKET_CONTEXT}', JSON.stringify(data.market, null, 2));
}

/**
 * Build recommendation prompt with data
 */
export function buildRecommendationPrompt(data: {
  patterns: unknown;
  velocity: unknown;
  userContext: unknown;
}): string {
  return STRATEGIST_PROMPTS.RECOMMENDATIONS.replace(
    '{PATTERNS}',
    JSON.stringify(data.patterns, null, 2)
  )
    .replace('{VELOCITY}', JSON.stringify(data.velocity, null, 2))
    .replace('{USER_CONTEXT}', JSON.stringify(data.userContext, null, 2));
}

/**
 * Build intervention decision prompt with data
 */
export function buildInterventionPrompt(patterns: unknown): string {
  return STRATEGIST_PROMPTS.INTERVENTION_DECISION.replace(
    '{PATTERNS}',
    JSON.stringify(patterns, null, 2)
  );
}

/**
 * Build synthesis prompt with all data
 */
export function buildSynthesisPrompt(data: {
  patterns: unknown;
  rejectionAnalysis: unknown;
  velocityReport: unknown;
  milestones: unknown;
}): string {
  return STRATEGIST_PROMPTS.SYNTHESIS.replace(
    '{PATTERNS}',
    JSON.stringify(data.patterns, null, 2)
  )
    .replace(
      '{REJECTION_ANALYSIS}',
      JSON.stringify(data.rejectionAnalysis, null, 2)
    )
    .replace('{VELOCITY_REPORT}', JSON.stringify(data.velocityReport, null, 2))
    .replace('{MILESTONES}', JSON.stringify(data.milestones, null, 2));
}
