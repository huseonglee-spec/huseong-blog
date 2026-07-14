import { loadEnvFile } from "node:process";

import { neon } from "@neondatabase/serverless";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const sql = neon(databaseUrl);

await sql`
  CREATE TABLE IF NOT EXISTS posts (
    slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    subtitle text,
    body_markdown text NOT NULL CHECK (length(btrim(body_markdown)) > 0),
    published_at timestamptz NOT NULL DEFAULT now(),
    thumbnail text,
    thumbnail_alt text,
    draft boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

await sql`
  ALTER TABLE posts
    DROP COLUMN IF EXISTS revision
`;

await sql`
  CREATE INDEX IF NOT EXISTS posts_public_feed_idx
      ON posts (published_at DESC, slug)
   WHERE draft = false
`;

await sql`
  CREATE TABLE IF NOT EXISTS admin_credentials (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
    password_hash text NOT NULL,
    credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash text PRIMARY KEY CHECK (length(token_hash) = 43),
    credential_version integer NOT NULL CHECK (credential_version > 0),
    csrf_token text NOT NULL CHECK (length(csrf_token) = 43),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CHECK (expires_at > created_at)
  )
`;

await sql`
  CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx
      ON admin_sessions (expires_at)
`;

await sql`
  CREATE TABLE IF NOT EXISTS admin_login_limits (
    bucket text PRIMARY KEY,
    window_started_at timestamptz NOT NULL,
    attempt_count integer NOT NULL CHECK (attempt_count > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

console.log("Database schema is ready.");
