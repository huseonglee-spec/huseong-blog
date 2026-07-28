import { randomUUID } from "node:crypto";

import { postStudySourceHash } from "../post-study";
import type { PublishablePostTranslation } from "../post-translation";
import { database } from "./db";
import {
  postStudyEnqueueQueries,
  postStudyQueueStatus,
} from "./post-study-queue";

interface SlugRow {
  post_slug: string;
}

export async function updatePostTranslation(
  slug: string,
  translation: PublishablePostTranslation,
): Promise<boolean> {
  const sql = database();
  const sourceHash = postStudySourceHash(translation.title, translation.bodyMarkdown);
  const results = await sql.transaction((transaction) => [
    transaction`
      UPDATE post_translations
         SET title = ${translation.title},
             body_markdown = ${translation.bodyMarkdown},
             updated_at = now()
       WHERE post_slug = ${slug}
         AND locale = ${translation.locale}
      RETURNING post_slug
    `,
    ...postStudyEnqueueQueries(transaction, {
      generationId: randomUUID(),
      postSlug: slug,
      locale: translation.locale,
      title: translation.title,
      bodyMarkdown: translation.bodyMarkdown,
      sourceHash,
    }),
  ]);
  const updated = Boolean((results[0] as SlugRow[])[0]?.post_slug);
  if (updated && postStudyQueueStatus(results, 1) === "missing") {
    throw new Error("updated_translation_generation_missing");
  }
  return updated;
}
