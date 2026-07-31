import type { PublishablePostTranslation } from "../post-translation";
import { database } from "./db";

export type PublishPostTranslationStatus = "created" | "exists" | "missing" | "stale";

export interface PostTranslationDraftPublication {
  generationId: string;
  sourceHash: string;
  promptVersion: number;
}

interface TranslationStatusRow {
  status: PublishPostTranslationStatus;
}

export async function publishPostTranslation(
  slug: string,
  translation: PublishablePostTranslation,
  draft?: PostTranslationDraftPublication,
): Promise<PublishPostTranslationStatus> {
  const sql = database();
  const rows = await sql`
    WITH source_post AS (
      SELECT slug, title, body_markdown
        FROM posts
       WHERE slug = ${slug}
       FOR UPDATE
    ), existing_translation AS (
      SELECT post_slug
        FROM post_translations
       WHERE post_slug = ${slug}
         AND locale = ${translation.locale}
    ), valid_draft AS (
      SELECT generation.id
        FROM post_translation_generations AS generation
        JOIN source_post AS source
          ON source.slug = generation.post_slug
         AND source.title = generation.source_title
         AND source.body_markdown = generation.source_body_markdown
       WHERE generation.id = ${draft?.generationId ?? null}
         AND generation.locale = ${translation.locale}
         AND generation.source_hash = ${draft?.sourceHash ?? null}
         AND generation.prompt_version = ${draft?.promptVersion ?? null}
         AND generation.status = 'ready'
    ), publication_guard AS (
      SELECT ${draft === undefined} OR EXISTS (SELECT 1 FROM valid_draft) AS allowed
    ), inserted_translation AS (
      INSERT INTO post_translations (
        post_slug, locale, title, body_markdown
      )
      SELECT slug, ${translation.locale}, ${translation.title}, ${translation.bodyMarkdown}
        FROM source_post
       CROSS JOIN publication_guard
       WHERE publication_guard.allowed
      ON CONFLICT (post_slug, locale) DO NOTHING
      RETURNING locale
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM inserted_translation) THEN 'created'
      WHEN NOT EXISTS (SELECT 1 FROM source_post) THEN 'missing'
      WHEN EXISTS (SELECT 1 FROM existing_translation) THEN 'exists'
      ELSE 'stale'
    END AS status
  `;

  const status = (rows as TranslationStatusRow[])[0]?.status;
  if (status === "created" || status === "exists" || status === "missing" || status === "stale") {
    return status;
  }
  throw new Error("Unexpected post translation publish status");
}
