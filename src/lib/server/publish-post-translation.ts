import type { PublishablePostTranslation } from "../post-translation";
import { database } from "./db";

export type PublishPostTranslationStatus = "created" | "exists" | "missing";

interface TranslationStatusRow {
  status: PublishPostTranslationStatus;
}

export async function publishPostTranslation(
  slug: string,
  translation: PublishablePostTranslation,
): Promise<PublishPostTranslationStatus> {
  const sql = database();
  const rows = await sql`
    WITH source_post AS (
      SELECT slug
        FROM posts
       WHERE slug = ${slug}
    ), inserted_translation AS (
      INSERT INTO post_translations (
        post_slug, locale, title, body_markdown
      )
      SELECT slug, ${translation.locale}, ${translation.title}, ${translation.bodyMarkdown}
        FROM source_post
      ON CONFLICT (post_slug, locale) DO NOTHING
      RETURNING locale
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM inserted_translation) THEN 'created'
      WHEN EXISTS (SELECT 1 FROM source_post) THEN 'exists'
      ELSE 'missing'
    END AS status
  `;

  const status = (rows as TranslationStatusRow[])[0]?.status;
  if (status === "created" || status === "exists" || status === "missing") {
    return status;
  }
  throw new Error("Unexpected post translation publish status");
}
