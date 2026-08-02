import type {
  NeonQueryFunction,
  NeonQueryFunctionInTransaction,
} from "@neondatabase/serverless";

import {
  POST_WRITING_FEEDBACK_PROMPT_VERSION,
  type PostWritingFeedbackLocale,
} from "../post-writing-feedback";

export type PostWritingFeedbackQueueStatus =
  | "queued"
  | "pending"
  | "processing"
  | "ready"
  | "missing";

export interface PostWritingFeedbackQueueInput {
  generationId: string;
  postSlug: string;
  locale: PostWritingFeedbackLocale;
  sourceTitle: string;
  sourceBodyMarkdown: string;
  sourceHash: string;
  forceRegenerate?: boolean;
}

export interface PostWritingFeedbackQueueResult {
  status: PostWritingFeedbackQueueStatus;
  generationId?: string;
}

type TransactionSql = NeonQueryFunctionInTransaction<false, false>;

export function postWritingFeedbackEnqueueQueries(
  sql: TransactionSql,
  input: PostWritingFeedbackQueueInput,
) {
  return [
    sql`
      SELECT slug
        FROM posts
       WHERE slug = ${input.postSlug}
       FOR UPDATE
    `,
    sql`
      UPDATE post_writing_feedback_generations
         SET status = 'superseded',
             completed_at = now(),
             last_error = NULL
       WHERE post_slug = ${input.postSlug}
         AND locale = ${input.locale}
         AND status IN ('pending', 'processing', 'ready')
         AND (${input.forceRegenerate ?? false} OR (
           source_hash <> ${input.sourceHash}
           OR source_title <> ${input.sourceTitle}
           OR source_body_markdown <> ${input.sourceBodyMarkdown}
           OR prompt_version <> ${POST_WRITING_FEEDBACK_PROMPT_VERSION}
         ))
         AND EXISTS (
           SELECT 1 FROM posts WHERE slug = ${input.postSlug}
         )
    `,
    sql`
      INSERT INTO post_writing_feedback_generations (
        id, post_slug, locale, source_title,
        source_body_markdown, source_hash, prompt_version
      )
      SELECT ${input.generationId}, slug, ${input.locale},
             ${input.sourceTitle}, ${input.sourceBodyMarkdown},
             ${input.sourceHash}, ${POST_WRITING_FEEDBACK_PROMPT_VERSION}
        FROM posts
       WHERE slug = ${input.postSlug}
         AND NOT EXISTS (
           SELECT 1
             FROM post_writing_feedback_generations AS existing
            WHERE existing.post_slug = ${input.postSlug}
              AND existing.locale = ${input.locale}
              AND existing.source_hash = ${input.sourceHash}
              AND existing.source_title = ${input.sourceTitle}
              AND existing.source_body_markdown = ${input.sourceBodyMarkdown}
              AND existing.prompt_version = ${POST_WRITING_FEEDBACK_PROMPT_VERSION}
              AND existing.status IN ('pending', 'processing', 'ready')
         )
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
    sql`
      SELECT id, status
        FROM post_writing_feedback_generations
       WHERE post_slug = ${input.postSlug}
         AND locale = ${input.locale}
         AND source_hash = ${input.sourceHash}
         AND source_title = ${input.sourceTitle}
         AND source_body_markdown = ${input.sourceBodyMarkdown}
         AND prompt_version = ${POST_WRITING_FEEDBACK_PROMPT_VERSION}
         AND status IN ('pending', 'processing', 'ready')
       ORDER BY requested_at DESC, id DESC
       LIMIT 1
    `,
  ];
}

export function postWritingFeedbackQueueResult(
  results: readonly unknown[],
  offset = 0,
): PostWritingFeedbackQueueResult {
  const postRows = results[offset] as { slug: string }[];
  const insertedRows = results[offset + 2] as { id: string }[];
  const existingRows = results[offset + 3] as {
    id: string;
    status: "pending" | "processing" | "ready";
  }[];
  if (!postRows[0]?.slug) return { status: "missing" };
  if (insertedRows[0]?.id) {
    return { status: "queued", generationId: insertedRows[0].id };
  }
  const existing = existingRows[0];
  if (existing) return { status: existing.status, generationId: existing.id };
  throw new Error("Unexpected writing feedback queue state");
}

export async function enqueuePostWritingFeedback(
  sql: NeonQueryFunction<false, false>,
  input: PostWritingFeedbackQueueInput,
): Promise<PostWritingFeedbackQueueResult> {
  const results = await sql.transaction((transaction) =>
    postWritingFeedbackEnqueueQueries(transaction, input)
  );
  return postWritingFeedbackQueueResult(results);
}
