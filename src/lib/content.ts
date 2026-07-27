import { neon } from "@neondatabase/serverless";
import { getSecret } from "astro:env/server";

import type { PostTranslationLocale } from "./post-translation";
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

interface PostTranslationLocaleRow {
  post_slug: string;
  locale: PostTranslationLocale;
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

export async function getPublishedPostTranslation(
  slug: string,
  locale: PostTranslationLocale,
  includeRestricted = false,
): Promise<BlogPost | null> {
  const sql = neon(databaseUrl());
  const rows = await sql`
    SELECT p.slug, t.title, NULL::text AS subtitle, p.published_at,
           p.thumbnail, p.thumbnail_alt, p.draft, p.category_path,
           p.visibility, t.body_markdown,
           GREATEST(p.updated_at, t.updated_at) AS updated_at
      FROM posts AS p
      JOIN post_translations AS t ON t.post_slug = p.slug
     WHERE p.slug = ${slug}
       AND t.locale = ${locale}
       AND p.draft = false
       AND p.published_at <= now()
       AND (${includeRestricted} OR p.visibility = 'public')
     LIMIT 1
  `;

  const row = (rows as PostRow[])[0];
  return row ? mapRow(row) : null;
}

export async function getPublishedPostTranslationLocales(
  includeRestricted = false,
): Promise<Record<string, PostTranslationLocale[]>> {
  const sql = neon(databaseUrl());
  const rows = await sql`
    SELECT p.slug AS post_slug, t.locale
      FROM posts AS p
      JOIN post_translations AS t ON t.post_slug = p.slug
     WHERE p.draft = false
       AND p.published_at <= now()
       AND (${includeRestricted} OR p.visibility = 'public')
     ORDER BY p.published_at DESC, p.slug ASC, t.locale ASC
  `;

  const localesByPost: Record<string, PostTranslationLocale[]> = {};
  for (const row of rows as PostTranslationLocaleRow[]) {
    (localesByPost[row.post_slug] ??= []).push(row.locale);
  }
  return localesByPost;
}
