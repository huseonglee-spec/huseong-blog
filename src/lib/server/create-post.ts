import type { WritablePost } from "../post-file";
import { database } from "./db";

interface SlugRow {
  slug: string;
}

export async function createPublishedPost(
  post: WritablePost,
  submissionId: string,
): Promise<string | null> {
  const sql = database();
  const inserted = await sql`
    INSERT INTO posts (
      slug, title, subtitle, published_at, thumbnail, thumbnail_alt,
      draft, category_path, body_markdown, submission_id
    ) VALUES (
      ${post.slug}, ${post.title}, ${post.subtitle}, ${post.publishedAt.toISOString()},
      ${post.thumbnail}, ${post.thumbnailAlt}, false,
      ${post.category ?? "미분류"}, ${post.bodyMarkdown},
      ${submissionId}
    )
    ON CONFLICT DO NOTHING
    RETURNING slug
  `;
  const insertedSlug = (inserted as SlugRow[])[0]?.slug;
  if (insertedSlug) return insertedSlug;

  const existing = await sql`
    SELECT slug
      FROM posts
     WHERE submission_id = ${submissionId}
  `;
  return (existing as SlugRow[])[0]?.slug ?? null;
}
