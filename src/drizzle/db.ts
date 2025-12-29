import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { serverEnv } from '@/data/env/server';

const pool = new Pool({
  connectionString: serverEnv.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;

