import type {
  NeonQueryFunction,
  NeonQueryFunctionInTransaction,
} from "@neondatabase/serverless";

import { POST_TRANSLATION_PROMPT_VERSION } from "../post-translation-generation";
import type { PostTranslationLocale } from "../post-translation";

export type PostTranslationDraftQueueStatus =
  | "queued"
  | "pending"
  | "processing"
  | "ready"
  | "published"
  | "missing";

export interface PostTranslationDraftQueueInput {
  generationId: string;
  postSlug: string;
  locale: PostTranslationLocale;
  modelLocale: "en" | "ja" | "zh-Hans";
  sourceTitle: string;
  sourceBodyMarkdown: string;
  sourceHash: string;
}

export interface PostTranslationDraftQueueResult {
  status: PostTranslationDraftQueueStatus;
  generationId?: string;
}

type TransactionSql = NeonQueryFunctionInTransaction<false, false>;

export function postTranslationDraftEnqueueQueries(
  sql: TransactionSql,
  input: PostTranslationDraftQueueInput,
) {
  return [
    sql`
      SELECT slug
        FROM posts
       WHERE slug = ${input.postSlug}
         AND title = ${input.sourceTitle}
         AND body_markdown = ${input.sourceBodyMarkdown}
       FOR UPDATE
    `,
    sql`
      SELECT post_slug
        FROM post_translations
       WHERE post_slug = ${input.postSlug}
         AND locale = ${input.locale}
       LIMIT 1
    `,
    sql`
      UPDATE post_translation_generations
         SET status = 'superseded',
             completed_at = now(),
             last_error = NULL
       WHERE post_slug = ${input.postSlug}
         AND locale = ${input.locale}
         AND status IN ('pending', 'processing', 'ready')
         AND (
           source_hash <> ${input.sourceHash}
           OR source_title <> ${input.sourceTitle}
           OR source_body_markdown <> ${input.sourceBodyMarkdown}
           OR prompt_version <> ${POST_TRANSLATION_PROMPT_VERSION}
         )
         AND EXISTS (
           SELECT 1
             FROM posts
            WHERE slug = ${input.postSlug}
              AND title = ${input.sourceTitle}
              AND body_markdown = ${input.sourceBodyMarkdown}
         )
    `,
    sql`
      INSERT INTO post_translation_generations (
        id, post_slug, locale, model_locale, source_title,
        source_body_markdown, source_hash, prompt_version
      )
      SELECT ${input.generationId}, slug, ${input.locale}, ${input.modelLocale},
             title, body_markdown, ${input.sourceHash},
             ${POST_TRANSLATION_PROMPT_VERSION}
        FROM posts
       WHERE slug = ${input.postSlug}
         AND title = ${input.sourceTitle}
         AND body_markdown = ${input.sourceBodyMarkdown}
         AND NOT EXISTS (
           SELECT 1
             FROM post_translations
            WHERE post_slug = ${input.postSlug}
              AND locale = ${input.locale}
         )
         AND NOT EXISTS (
           SELECT 1
             FROM post_translation_generations AS existing
            WHERE existing.post_slug = ${input.postSlug}
              AND existing.locale = ${input.locale}
              AND existing.source_hash = ${input.sourceHash}
              AND existing.source_title = ${input.sourceTitle}
              AND existing.source_body_markdown = ${input.sourceBodyMarkdown}
              AND existing.prompt_version = ${POST_TRANSLATION_PROMPT_VERSION}
              AND existing.status IN ('pending', 'processing', 'ready')
         )
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
    sql`
      SELECT id, status
        FROM post_translation_generations
       WHERE post_slug = ${input.postSlug}
         AND locale = ${input.locale}
         AND source_hash = ${input.sourceHash}
         AND source_title = ${input.sourceTitle}
         AND source_body_markdown = ${input.sourceBodyMarkdown}
         AND prompt_version = ${POST_TRANSLATION_PROMPT_VERSION}
         AND status IN ('pending', 'processing', 'ready')
       ORDER BY requested_at DESC, id DESC
       LIMIT 1
    `,
  ];
}

export function postTranslationDraftQueueResult(
  results: readonly unknown[],
  offset = 0,
): PostTranslationDraftQueueResult {
  const sourceRows = results[offset] as { slug: string }[];
  const publishedRows = results[offset + 1] as { post_slug: string }[];
  const insertedRows = results[offset + 3] as { id: string }[];
  const existingRows = results[offset + 4] as {
    id: string;
    status: "pending" | "processing" | "ready";
  }[];
  if (!sourceRows[0]?.slug) return { status: "missing" };
  if (publishedRows[0]?.post_slug) return { status: "published" };
  if (insertedRows[0]?.id) {
    return { status: "queued", generationId: insertedRows[0].id };
  }
  const existing = existingRows[0];
  if (existing) return { status: existing.status, generationId: existing.id };
  throw new Error("Unexpected post translation draft queue state");
}

export async function enqueuePostTranslationDraft(
  sql: NeonQueryFunction<false, false>,
  input: PostTranslationDraftQueueInput,
): Promise<PostTranslationDraftQueueResult> {
  const results = await sql.transaction((transaction) =>
    postTranslationDraftEnqueueQueries(transaction, input)
  );
  return postTranslationDraftQueueResult(results);
}
