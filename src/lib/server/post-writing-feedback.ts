import { randomUUID } from "node:crypto";

import {
  POST_WRITING_FEEDBACK_PROMPT_VERSION,
  postWritingFeedbackView,
  postWritingFeedbackSourceHash,
  type PostWritingFeedbackGenerationRow,
  type PostWritingFeedbackItemRow,
  type PostWritingFeedbackSource,
  type PostWritingFeedbackView,
} from "../post-writing-feedback";
import { database } from "./db";
import {
  enqueuePostWritingFeedback,
  type PostWritingFeedbackQueueResult,
} from "./post-writing-feedback-queue";

export async function requestPostWritingFeedback(
  slug: string,
  source: PostWritingFeedbackSource,
  forceRegenerate = false,
): Promise<PostWritingFeedbackQueueResult> {
  return enqueuePostWritingFeedback(database(), {
    generationId: randomUUID(),
    postSlug: slug,
    locale: source.locale,
    sourceTitle: source.title,
    sourceBodyMarkdown: source.bodyMarkdown,
    sourceHash: postWritingFeedbackSourceHash(source.title, source.bodyMarkdown),
    forceRegenerate,
  });
}

export async function getPostWritingFeedback(
  slug: string,
  generationId: string,
): Promise<PostWritingFeedbackView | undefined> {
  const sql = database();
  const generationRows = await sql`
    SELECT id, locale, status, source_hash, prompt_version,
           attempts, available_at, last_error
      FROM post_writing_feedback_generations
     WHERE id = ${generationId}
       AND post_slug = ${slug}
     LIMIT 1
  `;
  const generation = (generationRows as PostWritingFeedbackGenerationRow[])[0];
  if (!generation) return undefined;
  if (generation.prompt_version !== POST_WRITING_FEEDBACK_PROMPT_VERSION) {
    return postWritingFeedbackView({
      generation: { ...generation, status: "superseded" },
      items: [],
    });
  }
  const itemRows = await sql`
    SELECT item_key, feedback, reason
      FROM post_writing_feedback_items
     WHERE generation_id = ${generation.id}
       AND dismissed_at IS NULL
     ORDER BY sort_order ASC, item_key ASC
  `;
  return postWritingFeedbackView({
    generation,
    items: itemRows as PostWritingFeedbackItemRow[],
  });
}

export async function dismissPostWritingFeedbackItem(
  slug: string,
  generationId: string,
  itemKey: string,
): Promise<boolean> {
  const sql = database();
  const rows = await sql`
    UPDATE post_writing_feedback_items AS item
       SET dismissed_at = COALESCE(item.dismissed_at, now())
      FROM post_writing_feedback_generations AS generation
     WHERE item.generation_id = generation.id
       AND generation.id = ${generationId}
       AND generation.post_slug = ${slug}
       AND item.item_key = ${itemKey}
    RETURNING item.item_key
  `;
  return Boolean((rows as { item_key: string }[])[0]?.item_key);
}
