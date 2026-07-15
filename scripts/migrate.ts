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
    category_path text NOT NULL DEFAULT '미분류',
    submission_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

await sql`
  ALTER TABLE posts
    DROP COLUMN IF EXISTS revision,
    ADD COLUMN IF NOT EXISTS submission_id uuid,
    ADD COLUMN IF NOT EXISTS category_path text NOT NULL DEFAULT '미분류'
`;

await sql`
  ALTER TABLE posts
    DROP CONSTRAINT IF EXISTS posts_category_path_valid,
    ADD CONSTRAINT posts_category_path_valid CHECK (
      length(btrim(category_path)) BETWEEN 1 AND 200
      AND category_path = btrim(category_path)
      AND category_path !~ '(^/|/$|//)'
      AND category_path !~ '[[:cntrl:]]'
      AND category_path !~ '(^|/)[^/]{41,}(/|$)'
      AND array_length(string_to_array(category_path, '/'), 1) <= 5
    )
`;

await sql`
  CREATE INDEX IF NOT EXISTS posts_category_path_idx
      ON posts (category_path, published_at DESC)
   WHERE draft = false
`;

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS posts_submission_id_unique
      ON posts (submission_id)
   WHERE submission_id IS NOT NULL
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
