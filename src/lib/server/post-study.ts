import { randomUUID } from "node:crypto";

import {
  POST_STUDY_PROMPT_VERSION,
  postStudySourceHash,
  type PostStudyGenerationStatus,
  type PostStudyItem,
  type PostStudyPanelView,
} from "../post-study";
import type { PostTranslationLocale } from "../post-translation";
import { database } from "./db";

export type RequestPostStudyGenerationStatus = "queued" | "active" | "missing";

interface TranslationSourceRow {
  title: string;
  body_markdown: string;
}

interface GenerationStatusRow {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "superseded";
}

interface StudyItemRow {
  item_key: string;
  kind: "word" | "expression";
  text: string;
  reading: string | null;
  meaning_ko: string;
  note_ko: string;
  context_text: string;
}

export async function requestPostStudyGeneration(
  slug: string,
  locale: PostTranslationLocale,
  requestedSourceHash?: string,
): Promise<RequestPostStudyGenerationStatus> {
  const sql = database();
  let sourceHash = requestedSourceHash;
  if (!sourceHash) {
    const sourceRows = await sql`
      SELECT title, body_markdown
        FROM post_translations
       WHERE post_slug = ${slug}
         AND locale = ${locale}
       LIMIT 1
    `;
    const source = (sourceRows as TranslationSourceRow[])[0];
    if (!source) return "missing";
    sourceHash = postStudySourceHash(source.title, source.body_markdown);
  }

  const generationId = randomUUID();
  const inserted = await sql`
    INSERT INTO post_study_generations (
      id, post_slug, locale, source_hash, prompt_version
    )
    SELECT ${generationId}, post_slug, locale, ${sourceHash}, ${POST_STUDY_PROMPT_VERSION}
      FROM post_translations
     WHERE post_slug = ${slug}
       AND locale = ${locale}
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  if ((inserted as { id: string }[])[0]?.id) return "queued";
  const exists = await sql`
    SELECT post_slug
      FROM post_translations
     WHERE post_slug = ${slug}
       AND locale = ${locale}
     LIMIT 1
  `;
  return (exists as { post_slug: string }[])[0]?.post_slug ? "active" : "missing";
}

function viewStatus(row: GenerationStatusRow | undefined): PostStudyGenerationStatus {
  if (!row) return "idle";
  if (row.status === "completed") return "ready";
  if (row.status === "failed") return "failed";
  if (row.status === "pending" || row.status === "processing") return row.status;
  return "idle";
}

export async function getPostStudyPanel(
  slug: string,
  locale: PostTranslationLocale,
): Promise<PostStudyPanelView> {
  const sql = database();
  const [latestRows, itemRows] = await Promise.all([
    sql`
      SELECT id, status
        FROM post_study_generations
       WHERE post_slug = ${slug}
         AND locale = ${locale}
       ORDER BY requested_at DESC, id DESC
       LIMIT 1
    `,
    sql`
      WITH latest_completed AS (
        SELECT id
          FROM post_study_generations
         WHERE post_slug = ${slug}
           AND locale = ${locale}
           AND status = 'completed'
         ORDER BY completed_at DESC NULLS LAST, requested_at DESC, id DESC
         LIMIT 1
      )
      SELECT i.item_key, i.kind, i.text, i.reading, i.meaning_ko,
             i.note_ko, i.context_text
        FROM post_study_items AS i
        JOIN latest_completed AS g ON g.id = i.generation_id
       WHERE NOT EXISTS (
         SELECT 1
           FROM post_study_dismissals AS d
          WHERE d.locale = ${locale}
            AND d.item_key = i.item_key
       )
       ORDER BY i.sort_order ASC, i.item_key ASC
    `,
  ]);
  const latest = (latestRows as GenerationStatusRow[])[0];
  const items: PostStudyItem[] = (itemRows as StudyItemRow[]).map((row) => ({
    itemKey: row.item_key,
    kind: row.kind,
    text: row.text,
    ...(row.reading ? { reading: row.reading } : {}),
    meaningKo: row.meaning_ko,
    noteKo: row.note_ko,
    context: row.context_text,
  }));
  const status = viewStatus(latest);
  return {
    locale,
    status,
    items,
    isRefreshing: items.length > 0 && (status === "pending" || status === "processing"),
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
