import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
await sql`
  CREATE TABLE IF NOT EXISTS pastes (
    id text PRIMARY KEY,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    max_views integer,
    views integer NOT NULL DEFAULT 0
  )
`;
console.log('schema ready');
