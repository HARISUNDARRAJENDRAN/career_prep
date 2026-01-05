/**
 * Safe JSON Parsing Utilities
 *
 * Provides safe JSON parsing with error handling for AI responses.
 */

/**
 * Safely parse JSON with detailed error messages
 */
export function safeJsonParse<T = unknown>(
  content: string,
  context?: string
): T {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    const preview = content.slice(0, 300);
    const errorMessage = error instanceof Error ? error.message : 'Unknown parse error';
    throw new Error(
      `Failed to parse JSON${context ? ` (${context})` : ''}: ${errorMessage}\nContent preview: ${preview}...`
    );
  }
}

/**
 * Safely parse JSON with a fallback value instead of throwing
 */
export function safeJsonParseOrDefault<T>(
  content: string,
  defaultValue: T,
  logError = true
): T {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    if (logError) {
      console.error('[SafeJSON] Parse failed, using default:', error);
    }
    return defaultValue;
  }
}

/**
 * Extract JSON from a string that might contain markdown code blocks
 */
export function extractJsonFromResponse(content: string): string {
  // Remove markdown code blocks if present
  const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }

  // Try to find JSON object or array
  const jsonMatch = content.match(/[\[{][\s\S]*[\]}]/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return content.trim();
}

/**
 * Parse AI response that might be wrapped in markdown
 */
export function parseAiJsonResponse<T = unknown>(
  content: string,
  context?: string
): T {
  const extracted = extractJsonFromResponse(content);
  return safeJsonParse<T>(extracted, context);
}
