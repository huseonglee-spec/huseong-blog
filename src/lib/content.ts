import { neon } from "@neondatabase/serverless";
import { getSecret } from "astro:env/server";

import { sortPostsNewest, type BlogPost } from "./posts";
import { normalizePostVisibility } from "./visibility";

interface PostRow {
  slug: string;
  title: string;
  subtitle: string | null;
  published_at: string | Date;
  thumbnail: string | null;
  thumbnail_alt: string | null;
  draft: boolean;
  category_path: string;
  visibility: string;
  body_markdown: string;
  updated_at: string | Date;
}

function databaseUrl(): string {
  const value = getSecret("DATABASE_URL");
  if (!value) throw new Error("DATABASE_URL is not configured");
  return value;
}

function mapRow(row: PostRow): BlogPost {
  return {
    id: row.slug,
    data: {
      title: row.title,
      subtitle: row.subtitle ?? undefined,
      publishedAt: new Date(row.published_at),
      thumbnail: row.thumbnail ?? undefined,
      thumbnailAlt: row.thumbnail_alt ?? undefined,
      draft: row.draft,
      category: row.category_path,
      visibility: normalizePostVisibility(row.visibility),
    },
    bodyMarkdown: row.body_markdown,
    updatedAt: new Date(row.updated_at),
  };
}

export async function getPublishedPosts(
  includeRestricted = false,
): Promise<BlogPost[]> {
  const sql = neon(databaseUrl());
  const rows = await sql`
    SELECT slug, title, subtitle, published_at, thumbnail, thumbnail_alt,
           draft, category_path, visibility, body_markdown, updated_at
      FROM posts
     WHERE draft = false
       AND published_at <= now()
       AND (${includeRestricted} OR visibility = 'public')
     ORDER BY published_at DESC, slug ASC
  `;

  return sortPostsNewest((rows as PostRow[]).map(mapRow));
}
