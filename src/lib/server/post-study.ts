import { randomUUID } from "node:crypto";

import {
  postStudySourceHash,
  type PostStudyGenerationStatus,
  type PostStudyItem,
  type PostStudyPanelView,
} from "../post-study";
import type { PostTranslationLocale } from "../post-translation";
import { database } from "./db";
import {
  enqueuePostStudyGeneration,
  type PostStudyQueueStatus,
} from "./post-study-queue";

export type RequestPostStudyGenerationStatus = PostStudyQueueStatus;

interface TranslationSourceRow {
  title: string;
  body_markdown: string;
}

export async function getPostStudySource(
  slug: string,
  locale: PostTranslationLocale,
): Promise<{ title: string; bodyMarkdown: string } | undefined> {
  const sql = database();
  const rows = await sql`
    SELECT title, body_markdown
      FROM post_translations
     WHERE post_slug = ${slug}
       AND locale = ${locale}
     LIMIT 1
  `;
  const source = (rows as TranslationSourceRow[])[0];
  return source
    ? { title: source.title, bodyMarkdown: source.body_markdown }
    : undefined;
}

interface StudyPanelRow {
  latest_status: "pending" | "processing" | "completed" | "failed" | "superseded" | null;
  latest_source_hash: string | null;
  has_completed: boolean;
  item_key: string;
  kind: "word" | "expression";
  text: string;
  canonical_text: string;
  reading: string | null;
  meaning_ko: string;
  note_ko: string;
  context_text: string;
}

export async function requestPostStudyGeneration(
  slug: string,
  locale: PostTranslationLocale,
): Promise<RequestPostStudyGenerationStatus> {
  const sql = database();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const source = await getPostStudySource(slug, locale);
    if (!source) return "missing";
    const status = await enqueuePostStudyGeneration(sql, {
      generationId: randomUUID(),
      postSlug: slug,
      locale,
      title: source.title,
      bodyMarkdown: source.bodyMarkdown,
      sourceHash: postStudySourceHash(source.title, source.bodyMarkdown),
    });
    if (status !== "missing") return status;
  }
  return "missing";
}

function viewStatus(status: StudyPanelRow["latest_status"]): PostStudyGenerationStatus {
  if (status === "completed") return "ready";
  if (status === "failed") return "failed";
  if (status === "pending" || status === "processing") return status;
  return "idle";
}

export async function getPostStudyPanel(
  slug: string,
  locale: PostTranslationLocale,
  sourceHash: string,
): Promise<PostStudyPanelView> {
  const sql = database();
  const rows = await sql`
    WITH latest AS (
      SELECT status, source_hash
        FROM post_study_generations
       WHERE post_slug = ${slug}
         AND locale = ${locale}
       ORDER BY requested_at DESC, id DESC
       LIMIT 1
    ), latest_completed AS (
      SELECT id
        FROM post_study_generations
       WHERE post_slug = ${slug}
         AND locale = ${locale}
         AND source_hash = ${sourceHash}
         AND status = 'completed'
       ORDER BY completed_at DESC NULLS LAST, requested_at DESC, id DESC
       LIMIT 1
    )
    SELECT latest.status AS latest_status,
           latest.source_hash AS latest_source_hash,
           EXISTS (
             SELECT 1
               FROM post_study_generations AS existing
              WHERE existing.post_slug = ${slug}
                AND existing.locale = ${locale}
                AND existing.status = 'completed'
           ) AS has_completed,
           i.item_key, i.kind, i.text, i.canonical_text, i.reading, i.meaning_ko,
           i.note_ko, i.context_text
      FROM (SELECT 1) AS anchor
      LEFT JOIN latest ON true
      LEFT JOIN latest_completed AS completed ON true
      LEFT JOIN post_study_items AS i
        ON i.generation_id = completed.id
       AND NOT EXISTS (
         SELECT 1
           FROM post_study_dismissals AS d
          WHERE d.locale = ${locale}
            AND d.item_key = i.item_key
       )
     ORDER BY i.sort_order ASC NULLS LAST, i.item_key ASC NULLS LAST
  `;
  const panelRows = rows as StudyPanelRow[];
  const latest = panelRows[0];
  const status = latest?.latest_source_hash === sourceHash
    ? viewStatus(latest.latest_status)
    : "idle";
  const items: PostStudyItem[] = panelRows
    .filter((row) => Boolean(row.item_key))
    .map((row) => ({
    itemKey: row.item_key,
    kind: row.kind,
    text: row.text,
    canonicalText: row.canonical_text,
    ...(row.reading ? { reading: row.reading } : {}),
    meaningKo: row.meaning_ko,
    noteKo: row.note_ko,
    context: row.context_text,
  }));
  return {
    locale,
    sourceHash,
    status,
    items,
    isRefreshing: Boolean(latest?.has_completed) && (status === "pending" || status === "processing"),
  };
}

export async function dismissPostStudyItem(
  slug: string,
  locale: PostTranslationLocale,
  itemKey: string,
): Promise<boolean> {
  const sql = database();
  const rows = await sql`
    INSERT INTO post_study_dismissals (locale, item_key, text)
    SELECT g.locale, i.item_key, i.text
      FROM post_study_items AS i
      JOIN post_study_generations AS g ON g.id = i.generation_id
     WHERE g.post_slug = ${slug}
       AND g.locale = ${locale}
       AND i.item_key = ${itemKey}
     ORDER BY g.requested_at DESC, g.id DESC
     LIMIT 1
    ON CONFLICT (locale, item_key) DO NOTHING
    RETURNING item_key
  `;
  if ((rows as { item_key: string }[])[0]?.item_key) return true;

  const existing = await sql`
    SELECT item_key
      FROM post_study_dismissals
     WHERE locale = ${locale}
       AND item_key = ${itemKey}
     LIMIT 1
  `;
  return Boolean((existing as { item_key: string }[])[0]?.item_key);
}
