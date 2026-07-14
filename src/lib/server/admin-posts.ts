import type { WritablePost } from "../post-file";
import { database } from "./db";

export interface AdminPost extends WritablePost {
  revision: number;
  updatedAt: Date;
}

interface AdminPostRow {
  slug: string;
  title: string;
  subtitle: string | null;
  published_at: string | Date;
  thumbnail: string | null;
  thumbnail_alt: string | null;
  draft: boolean;
  body_markdown: string;
  revision: number;
  updated_at: string | Date;
}

function mapPost(row: AdminPostRow): AdminPost {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    publishedAt: new Date(row.published_at),
    thumbnail: row.thumbnail,
    thumbnailAlt: row.thumbnail_alt,
    draft: row.draft,
    bodyMarkdown: row.body_markdown,
    revision: row.revision,
    updatedAt: new Date(row.updated_at),
  };
}

export async function getAdminPosts(): Promise<AdminPost[]> {
  const sql = database();
  const rows = await sql`
    SELECT slug, title, subtitle, published_at, thumbnail,
           thumbnail_alt, draft, body_markdown, revision, updated_at
      FROM posts
     ORDER BY updated_at DESC, slug ASC
  `;
  return (rows as AdminPostRow[]).map(mapPost);
}

export async function getAdminPost(slug: string): Promise<AdminPost | null> {
  const sql = database();
  const rows = await sql`
    SELECT slug, title, subtitle, published_at, thumbnail,
           thumbnail_alt, draft, body_markdown, revision, updated_at
      FROM posts
     WHERE slug = ${slug}
  `;
  const row = (rows as AdminPostRow[])[0];
  return row ? mapPost(row) : null;
}

export async function createAdminPost(post: WritablePost): Promise<"created" | "duplicate"> {
  const sql = database();
  const rows = await sql`
    INSERT INTO posts (
      slug, title, subtitle, published_at, thumbnail, thumbnail_alt,
      draft, body_markdown
    ) VALUES (
      ${post.slug}, ${post.title}, ${post.subtitle}, ${post.publishedAt.toISOString()},
      ${post.thumbnail}, ${post.thumbnailAlt}, ${post.draft}, ${post.bodyMarkdown}
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING slug
  `;
  return (rows as Record<string, unknown>[]).length === 1 ? "created" : "duplicate";
}

export async function updateAdminPost(
  slug: string,
  expectedRevision: number,
  post: WritablePost,
): Promise<"updated" | "missing" | "conflict"> {
  const sql = database();
  const rows = await sql`
    UPDATE posts
       SET title = ${post.title},
           subtitle = ${post.subtitle},
           published_at = ${post.publishedAt.toISOString()},
           thumbnail = ${post.thumbnail},
           thumbnail_alt = ${post.thumbnailAlt},
           draft = ${post.draft},
           body_markdown = ${post.bodyMarkdown},
           revision = revision + 1,
           updated_at = now()
     WHERE slug = ${slug}
       AND revision = ${expectedRevision}
    RETURNING slug
  `;
  if ((rows as Record<string, unknown>[]).length === 1) return "updated";

  const existing = await sql`SELECT 1 FROM posts WHERE slug = ${slug}`;
  return (existing as Record<string, unknown>[]).length === 0 ? "missing" : "conflict";
}
