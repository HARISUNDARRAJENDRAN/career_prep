/**
 * Action Tool Executor
 *
 * Provides a function to execute a single action tool by ID.
 * This enables direct tool invocation from Trigger.dev jobs and API routes
 * without going through the full agent loop.
 */

import { toolRegistry } from '../../tools/tool-registry';
import { registerActionTools, getActionToolIds } from './action-tools';

// Ensure tools are registered
let toolsRegistered = false;
function ensureToolsRegistered(): void {
  if (!toolsRegistered) {
    registerActionTools();
    toolsRegistered = true;
  }
}

/**
 * Execute a single action tool by its ID
 *
 * @param toolId - The ID of the tool to execute (e.g., 'submit_application')
 * @param input - The input parameters for the tool
 * @returns The output from the tool handler
 * @throws Error if tool not found or input validation fails
 */
export async function executeActionTool<T = unknown>(
  toolId: string,
  input: Record<string, unknown>
): Promise<T> {
  ensureToolsRegistered();

  const tool = toolRegistry.get(toolId);

  if (!tool) {
    const availableTools = getActionToolIds();
    throw new Error(
      `Tool "${toolId}" not found. Available tools: ${availableTools.join(', ')}`
    );
  }

  if (!tool.enabled) {
    throw new Error(`Tool "${toolId}" is disabled`);
  }

  // Validate input against schema
  const validatedInput = tool.input_schema.parse(input);

  // Execute the tool handler
  console.log(`[ActionExecutor] Executing tool: ${toolId}`);
  const startTime = Date.now();

  try {
    const result = await tool.handler(validatedInput);
    const duration = Date.now() - startTime;
    console.log(`[ActionExecutor] Tool ${toolId} completed in ${duration}ms`);
    return result as T;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `[ActionExecutor] Tool ${toolId} failed after ${duration}ms:`,
      error
    );
    throw error;
  }
}

/**
 * Execute multiple action tools in sequence
 *
 * @param steps - Array of { toolId, input } objects
 * @returns Array of results from each tool
 */
export async function executeActionToolSequence<T = unknown>(
  steps: Array<{ toolId: string; input: Record<string, unknown> }>
): Promise<T[]> {
  const results: T[] = [];

  for (const step of steps) {
    const result = await executeActionTool<T>(step.toolId, step.input);
    results.push(result);
  }

  return results;
}

/**
 * Check if a tool exists and is enabled
 */
export function isToolAvailable(toolId: string): boolean {
  ensureToolsRegistered();
  const tool = toolRegistry.get(toolId);
  return tool !== undefined && tool.enabled;
}

/**
 * Get tool metadata
 */
export function getToolInfo(toolId: string): {
  name: string;
  description: string;
  category: string;
  tags: string[];
} | null {
  ensureToolsRegistered();
  const tool = toolRegistry.get(toolId);

  if (!tool) return null;

  return {
    name: tool.name,
    description: tool.description,
    category: tool.category,
    tags: tool.tags,
  };
}
