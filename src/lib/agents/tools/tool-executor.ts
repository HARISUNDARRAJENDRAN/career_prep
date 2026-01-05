/**
 * Tool Executor
 *
 * Safe execution wrapper for tools with timeout, retry, and error handling.
 *
 * @see docs/agentic-improvements/07-TOOL_SELECTION.md
 */

import { toolRegistry, type ToolDefinition } from './tool-registry';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for tool execution
 */
export interface ExecutionOptions {
  timeout_ms?: number;
  max_retries?: number;
  retry_delay_ms?: number;
  validate_input?: boolean;
  validate_output?: boolean;
  dry_run?: boolean;
}

/**
 * Result of tool execution
 */
export interface ExecutionResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
  error_code?: string;
  duration_ms: number;
  retries_used: number;
  tool_id: string;
  input_validated: boolean;
  output_validated: boolean;
}

/**
 * Execution log entry
 */
export interface ExecutionLog {
  tool_id: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  duration_ms: number;
  timestamp: Date;
  success: boolean;
}

/**
 * Configuration for the executor
 */
export interface ToolExecutorConfig {
  default_timeout_ms: number;
  default_max_retries: number;
  default_retry_delay_ms: number;
  enable_logging: boolean;
  max_log_entries: number;
}

// ============================================================================
// Tool Executor Class
// ============================================================================

/**
 * ToolExecutor provides safe, logged execution of tools
 */
export class ToolExecutor {
  private config: ToolExecutorConfig;
  private executionLog: ExecutionLog[] = [];

  constructor(config: ToolExecutorConfig) {
    this.config = config;
  }

  /**
   * Execute a tool with safety features
   */
  async execute<T = unknown>(
    tool_id: string,
    input: Record<string, unknown>,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult<T>> {
    const startTime = Date.now();
    let retriesUsed = 0;

    const timeout = options.timeout_ms ?? this.config.default_timeout_ms;
    const maxRetries = options.max_retries ?? this.config.default_max_retries;
    const retryDelay = options.retry_delay_ms ?? this.config.default_retry_delay_ms;

    // Get tool from registry
    const tool = toolRegistry.get(tool_id);
    if (!tool) {
      return this.createErrorResult(
        tool_id,
        startTime,
        retriesUsed,
        `Tool ${tool_id} not found in registry`,
        'TOOL_NOT_FOUND'
      );
    }

    if (!tool.enabled) {
      return this.createErrorResult(
        tool_id,
        startTime,
        retriesUsed,
        `Tool ${tool_id} is disabled`,
        'TOOL_DISABLED'
      );
    }

    // Validate input
    let inputValidated = false;
    if (options.validate_input !== false && tool.input_schema) {
      const validation = this.validateInput(tool, input);
      if (!validation.valid) {
        return this.createErrorResult(
          tool_id,
          startTime,
          retriesUsed,
          `Input validation failed: ${validation.errors.join(', ')}`,
          'INPUT_VALIDATION_FAILED'
        );
      }
      inputValidated = true;
    }

    // Dry run - just validate, don't execute
    if (options.dry_run) {
      return {
        success: true,
        duration_ms: Date.now() - startTime,
        retries_used: 0,
        tool_id,
        input_validated: inputValidated,
        output_validated: false,
      };
    }

    // Execute with retries
    let lastError: Error | null = null;

    while (retriesUsed <= maxRetries) {
      try {
        const output = await this.executeWithTimeout<T>(
          tool,
          input,
          timeout
        );

        // Validate output if requested
        let outputValidated = false;
        if (options.validate_output) {
          // Basic output validation - check it's not undefined
          outputValidated = output !== undefined;
        }

        const result: ExecutionResult<T> = {
          success: true,
          output,
          duration_ms: Date.now() - startTime,
          retries_used: retriesUsed,
          tool_id,
          input_validated: inputValidated,
          output_validated: outputValidated,
        };

        this.log(tool_id, input, output, null, result.duration_ms, true);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!this.isRetryable(lastError)) {
          break;
        }

        retriesUsed++;

        if (retriesUsed <= maxRetries) {
          await this.delay(retryDelay * retriesUsed); // Exponential backoff
        }
      }
    }

    const errorResult = this.createErrorResult<T>(
      tool_id,
      startTime,
      retriesUsed,
      lastError?.message || 'Unknown error',
      'EXECUTION_FAILED'
    );

    this.log(tool_id, input, undefined, lastError?.message || null, errorResult.duration_ms, false);
    return errorResult;
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeParallel<T = unknown>(
    executions: Array<{
      tool_id: string;
      input: Record<string, unknown>;
      options?: ExecutionOptions;
    }>
  ): Promise<ExecutionResult<T>[]> {
    return Promise.all(
      executions.map(({ tool_id, input, options }) =>
        this.execute<T>(tool_id, input, options)
      )
    );
  }

  /**
   * Execute tools in sequence, passing output to next
   */
  async executeChain<T = unknown>(
    chain: Array<{
      tool_id: string;
      input_mapper?: (prevOutput: unknown) => Record<string, unknown>;
      options?: ExecutionOptions;
    }>,
    initial_input: Record<string, unknown>
  ): Promise<{
    success: boolean;
    final_output?: T;
    results: ExecutionResult[];
    failed_at?: number;
  }> {
    const results: ExecutionResult[] = [];
    let currentInput = initial_input;

    for (let i = 0; i < chain.length; i++) {
      const { tool_id, input_mapper, options } = chain[i];

      const input = input_mapper ? input_mapper(currentInput) : currentInput;
      const result = await this.execute(tool_id, input, options);

      results.push(result);

      if (!result.success) {
        return {
          success: false,
          results,
          failed_at: i,
        };
      }

      currentInput = result.output as Record<string, unknown>;
    }

    return {
      success: true,
      final_output: currentInput as T,
      results,
    };
  }

  /**
   * Get execution logs
   */
  getLogs(options?: {
    tool_id?: string;
    since?: Date;
    limit?: number;
  }): ExecutionLog[] {
    let logs = [...this.executionLog];

    if (options?.tool_id) {
      logs = logs.filter((l) => l.tool_id === options.tool_id);
    }

    if (options?.since) {
      logs = logs.filter((l) => l.timestamp >= options.since!);
    }

    if (options?.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  /**
   * Get execution statistics
   */
  getStats(tool_id?: string): {
    total_executions: number;
    success_count: number;
    failure_count: number;
    success_rate: number;
    avg_duration_ms: number;
    total_duration_ms: number;
  } {
    const logs = tool_id
      ? this.executionLog.filter((l) => l.tool_id === tool_id)
      : this.executionLog;

    const total = logs.length;
    const successes = logs.filter((l) => l.success).length;
    const totalDuration = logs.reduce((sum, l) => sum + l.duration_ms, 0);

    return {
      total_executions: total,
      success_count: successes,
      failure_count: total - successes,
      success_rate: total > 0 ? successes / total : 0,
      avg_duration_ms: total > 0 ? totalDuration / total : 0,
      total_duration_ms: totalDuration,
    };
  }

  /**
   * Clear execution logs
   */
  clearLogs(): void {
    this.executionLog = [];
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async executeWithTimeout<T>(
    tool: ToolDefinition,
    input: Record<string, unknown>,
    timeout_ms: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Execution timeout after ${timeout_ms}ms`));
      }, timeout_ms);

      toolRegistry
        .execute(tool.id, input)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result as T);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private validateInput(
    tool: ToolDefinition,
    input: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Use Zod schema for validation
    if (tool.input_schema) {
      const result = tool.input_schema.safeParse(input);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push(`${issue.path.join('.')}: ${issue.message}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private isRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Non-retryable errors
    const nonRetryable = [
      'validation',
      'not found',
      'disabled',
      'permission',
      'unauthorized',
    ];

    return !nonRetryable.some((term) => message.includes(term));
  }

  private createErrorResult<T>(
    tool_id: string,
    startTime: number,
    retriesUsed: number,
    error: string,
    error_code: string
  ): ExecutionResult<T> {
    return {
      success: false,
      error,
      error_code,
      duration_ms: Date.now() - startTime,
      retries_used: retriesUsed,
      tool_id,
      input_validated: false,
      output_validated: false,
    };
  }

  private log(
    tool_id: string,
    input: Record<string, unknown>,
    output: unknown,
    error: string | null,
    duration_ms: number,
    success: boolean
  ): void {
    if (!this.config.enable_logging) {
      return;
    }

    this.executionLog.push({
      tool_id,
      input,
      output,
      error: error || undefined,
      duration_ms,
      timestamp: new Date(),
      success,
    });

    // Trim log if too long
    if (this.executionLog.length > this.config.max_log_entries) {
      this.executionLog = this.executionLog.slice(-this.config.max_log_entries);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a tool executor with default settings
 */
export function createToolExecutor(
  options: Partial<ToolExecutorConfig> = {}
): ToolExecutor {
  return new ToolExecutor({
    default_timeout_ms: 30000, // 30 seconds
    default_max_retries: 2,
    default_retry_delay_ms: 1000,
    enable_logging: true,
    max_log_entries: 1000,
    ...options,
  });
}
