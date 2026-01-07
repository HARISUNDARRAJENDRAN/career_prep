import { defineConfig } from '@trigger.dev/sdk';
import { syncEnvVars } from '@trigger.dev/build/extensions/core';

/**
 * Trigger.dev Configuration
 *
 * Production-ready configuration for the Career Prep multi-agent system.
 *
 * Key features:
 * - Environment-specific settings (dev/staging/prod)
 * - Automatic environment variable syncing
 * - Optimized retry policies
 */

export default defineConfig({
  // Project reference from Trigger.dev dashboard
  project: 'proj_sdiiuothhemlbqaslsiw',

  // Runtime configuration
  runtime: 'node',

  // Task directories
  dirs: ['./src/trigger'],

  // TypeScript config for path alias resolution (@/* -> ./src/*)
  tsconfig: './tsconfig.json',

  // Logging level - debug in dev, info in production
  logLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',

  // Default maximum duration for tasks (5 minutes)
  maxDuration: 300,

  // Default retry configuration
  retries: {
    // Enable retries in development for testing
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      factor: 2,
      randomize: true,
    },
  },

  // Build configuration
  build: {
    // Auto-detect external packages (native modules, etc.)
    autoDetectExternal: true,

    // Keep function names for better stack traces
    keepNames: true,

    // Extensions for production deployment
    extensions: [
      // Sync environment variables from the project
      syncEnvVars(async (ctx) => {
        // Environment-specific secrets
        const envVars: Array<{ name: string; value: string }> = [];

        // Core secrets (always needed)
        const requiredVars = [
          'DATABASE_URL',
          'OPENAI_API_KEY',
          'CLERK_SECRET_KEY',
          'ENCRYPTION_KEY',
        ];

        // Optional integrations
        const optionalVars = [
          'JOOBLE_API_KEY',
          'ADZUNA_APP_ID',
          'ADZUNA_APP_KEY',
          'PYTHON_SERVICE_URL',
          'HUME_API_KEY',
          'ARCJET_KEY',
        ];

        // Add required vars (warn if missing in production)
        for (const name of requiredVars) {
          const value = process.env[name];
          if (value) {
            envVars.push({ name, value });
          } else if (ctx.environment === 'PRODUCTION') {
            console.warn(`[Trigger.dev] Missing required env var: ${name}`);
          }
        }

        // Add optional vars if present
        for (const name of optionalVars) {
          const value = process.env[name];
          if (value) {
            envVars.push({ name, value });
          }
        }

        // Environment indicator
        envVars.push({
          name: 'TRIGGER_ENV',
          value: ctx.environment,
        });

        return envVars;
      }),
    ],
  },
});
