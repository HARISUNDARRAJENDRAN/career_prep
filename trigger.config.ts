import { defineConfig } from '@trigger.dev/sdk';

export default defineConfig({
  project: 'proj_sdiiuothhemlbqaslsiw',
  runtime: 'node',
  logLevel: 'debug', // Enable debug logging
  maxDuration: 300, // 5 minutes max for long-running jobs
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  // Point to the trigger folder - it will discover tasks via index.ts exports
  dirs: ['./src/trigger'],
  // Use the project's tsconfig.json for path alias resolution (@/* -> ./src/*)
  tsconfig: './tsconfig.json',
});
