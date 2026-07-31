import type {
  NeonQueryFunction,
  NeonQueryFunctionInTransaction,
} from "@neondatabase/serverless";

import { POST_STUDY_PROMPT_VERSION } from "../post-study";
import type { PostTranslationLocale } from "../post-translation";

export type PostStudyQueueStatus = "queued" | "active" | "missing";

export interface PostStudyQueueInput {
  generationId: string;
  postSlug: string;
  locale: PostTranslationLocale;
  title: string;
  bodyMarkdown: string;
  sourceHash: string;
}

type TransactionSql = NeonQueryFunctionInTransaction<false, false>;

export function postStudyEnqueueQueries(
  sql: TransactionSql,
  input: PostStudyQueueInput,
) {
  return [
    sql`
      SELECT post_slug
        FROM post_translations
       WHERE post_slug = ${input.postSlug}
         AND locale = ${input.locale}
         AND title = ${input.title}
         AND body_markdown = ${input.bodyMarkdown}
       FOR UPDATE
    `,
    sql`
      UPDATE post_study_generations
         SET status = 'superseded',
             completed_at = now(),
             last_error = NULL
       WHERE post_slug = ${input.postSlug}
         AND locale = ${input.locale}
         AND status IN ('pending', 'processing')
         AND (
           source_hash <> ${input.sourceHash}
           OR prompt_version <> ${POST_STUDY_PROMPT_VERSION}
         )
         AND EXISTS (
           SELECT 1
             FROM post_translations
            WHERE post_slug = ${input.postSlug}
              AND locale = ${input.locale}
              AND title = ${input.title}
              AND body_markdown = ${input.bodyMarkdown}
         )
    `,
    sql`
      INSERT INTO post_study_generations (
        id, post_slug, locale, source_hash, prompt_version
      )
      SELECT ${input.generationId}, post_slug, locale,
             ${input.sourceHash}, ${POST_STUDY_PROMPT_VERSION}
        FROM post_translations
       WHERE post_slug = ${input.postSlug}
         AND locale = ${input.locale}
         AND title = ${input.title}
         AND body_markdown = ${input.bodyMarkdown}
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
  ];
}

export function postStudyQueueStatus(
  results: readonly unknown[],
  offset = 0,
): PostStudyQueueStatus {
  const sourceRows = results[offset] as { post_slug: string }[];
  const insertedRows = results[offset + 2] as { id: string }[];
  if (!sourceRows[0]?.post_slug) return "missing";
  return insertedRows[0]?.id ? "queued" : "active";
}

export async function enqueuePostStudyGeneration(
  sql: NeonQueryFunction<false, false>,
  input: PostStudyQueueInput,
): Promise<PostStudyQueueStatus> {
  const results = await sql.transaction((transaction) =>
    postStudyEnqueueQueries(transaction, input)
  );
  return postStudyQueueStatus(results);
}
