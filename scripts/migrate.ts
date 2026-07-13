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
  CREATE INDEX IF NOT EXISTS posts_public_feed_idx
      ON posts (published_at DESC, slug)
   WHERE draft = false
`;

console.log("Database schema is ready.");
