import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    RESUME_PARSER_URL: z.string().url().optional(),
    ARCJET_KEY: z.string().min(1).optional(),

    // Trigger.dev Configuration (Phase 3.5: Message Bus)
    // Optional during development - events will be persisted but not dispatched
    TRIGGER_SECRET_KEY: z.string().min(1).optional(),
    TRIGGER_API_URL: z.string().url().optional(),

    // Hume AI Configuration (Phase 5: Interviewer Agent)
    // Required for voice interviews with EVI
    HUME_API_KEY: z.string().min(1).optional(),
    HUME_SECRET_KEY: z.string().min(1).optional(),
  },
  experimental__runtimeEnv: process.env,
});
