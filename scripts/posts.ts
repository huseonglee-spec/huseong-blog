import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";

import { neon } from "@neondatabase/serverless";

import { parsePostFile } from "../src/lib/post-file";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
const sql = neon(databaseUrl);

const [command, argument, confirmation] = process.argv.slice(2);

if (command === "list") {
  const rows = await sql`
    SELECT slug, title, published_at, draft, updated_at
      FROM posts
     ORDER BY published_at DESC, slug ASC
  `;
  console.table(rows);
} else if (command === "get") {
  if (!argument) throw new Error("Usage: pnpm post get <slug>");
  const rows = await sql`
    SELECT slug, title, subtitle, published_at, thumbnail, thumbnail_alt,
           draft, body_markdown, created_at, updated_at
      FROM posts
     WHERE slug = ${argument}
  `;
  if (rows.length === 0) throw new Error(`Post not found: ${argument}`);
  console.log(JSON.stringify(rows[0], null, 2));
} else if (command === "upsert") {
  if (!argument) throw new Error("Usage: pnpm post upsert <markdown-file>");
  const source = await readFile(argument, "utf8");
  const post = parsePostFile(source, argument);
  const rows = await sql`
    INSERT INTO posts (
      slug, title, subtitle, published_at, thumbnail, thumbnail_alt,
      draft, body_markdown
    ) VALUES (
      ${post.slug}, ${post.title}, ${post.subtitle}, ${post.publishedAt.toISOString()},
      ${post.thumbnail}, ${post.thumbnailAlt}, ${post.draft}, ${post.bodyMarkdown}
    )
    ON CONFLICT (slug) DO UPDATE SET
      title = EXCLUDED.title,
      subtitle = EXCLUDED.subtitle,
      published_at = EXCLUDED.published_at,
      thumbnail = EXCLUDED.thumbnail,
      thumbnail_alt = EXCLUDED.thumbnail_alt,
      draft = EXCLUDED.draft,
      body_markdown = EXCLUDED.body_markdown,
      updated_at = now()
    RETURNING slug, title, published_at, draft, updated_at
  `;
  console.log(JSON.stringify(rows[0], null, 2));
} else if (command === "delete") {
  if (!argument || confirmation !== "--yes") {
    throw new Error("Usage: pnpm post delete <slug> --yes");
  }
  const rows = await sql`DELETE FROM posts WHERE slug = ${argument} RETURNING slug`;
  if (rows.length === 0) throw new Error(`Post not found: ${argument}`);
  console.log(`Deleted ${argument}`);
} else {
  console.log(`Usage:
  pnpm post list
  pnpm post get <slug>
  pnpm post upsert <markdown-file>
  pnpm post delete <slug> --yes`);
  process.exitCode = command ? 1 : 0;
}
