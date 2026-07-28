import type { PublishablePostTranslation } from "../post-translation";
import { database } from "./db";

interface SlugRow {
  post_slug: string;
}

export async function updatePostTranslation(
  slug: string,
  translation: PublishablePostTranslation,
): Promise<boolean> {
  const sql = database();
  const rows = await sql`
    UPDATE post_translations
       SET title = ${translation.title},
           body_markdown = ${translation.bodyMarkdown},
           updated_at = now()
     WHERE post_slug = ${slug}
       AND locale = ${translation.locale}
    RETURNING post_slug
  `;
  return Boolean((rows as SlugRow[])[0]?.post_slug);
}
