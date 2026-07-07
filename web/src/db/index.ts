import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

// Common supertype of the neon-http, node-postgres, and pglite drizzle clients,
// so services and tests share one signature.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let _db: Db | undefined;

export function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _db = url.includes('neon.tech')
      ? (drizzleNeon(neon(url), { schema }) as unknown as Db)
      : (drizzleNode(new Pool({ connectionString: url }), { schema }) as unknown as Db);
  }
  return _db;
}
