/**
 * Tools Module - Barrel Export
 *
 * Exports all tool-related components for autonomous agents.
 *
 * @see docs/agentic-improvements/07-TOOL_SELECTION.md
 */

// Tool Registry
export {
  ToolRegistry,
  toolRegistry,
  defineTool,
  registerTool,
  type ToolCategory,
  type ToolDefinition,
  type ToolCost,
  type ToolRateLimit,
  type ToolExample,
  type ToolHandler,
  type ToolSearchResult,
  type ToolExecutionResult,
} from './tool-registry';

// Tool Selector
export {
  ToolSelector,
  createToolSelector,
  type ToolSelectionContext,
  type ToolSelectionResult,
  type SelectedTool,
  type ToolSelectorConfig,
} from './tool-selector';

// Tool Executor
export {
  ToolExecutor,
  createToolExecutor,
  type ExecutionOptions,
  type ExecutionResult,
  type ExecutionLog,
  type ToolExecutorConfig,
} from './tool-executor';
