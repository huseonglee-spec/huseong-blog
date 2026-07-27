import type { PublishablePostTranslation } from "../post-translation";
import { database } from "./db";

interface TranslationRow {
  locale: string;
}

export async function publishPostTranslation(
  slug: string,
  translation: PublishablePostTranslation,
): Promise<boolean> {
  const sql = database();
  const rows = await sql`
    INSERT INTO post_translations (
      post_slug, locale, title, body_markdown
    )
    SELECT slug, ${translation.locale}, ${translation.title}, ${translation.bodyMarkdown}
      FROM posts
     WHERE slug = ${slug}
    ON CONFLICT (post_slug, locale) DO UPDATE SET
      title = EXCLUDED.title,
      body_markdown = EXCLUDED.body_markdown,
      updated_at = now()
    RETURNING locale
  `;

  return Boolean((rows as TranslationRow[])[0]?.locale);
}
