import { randomUUID } from "node:crypto";

import {
  POST_TRANSLATION_PROMPT_VERSION,
  postTranslationSourceHash,
  type PostTranslationGenerationStatus,
  type PostTranslationTradeoff,
} from "../post-translation-generation";
import {
  postTranslationModelLocale,
  type PostTranslationLocale,
} from "../post-translation";
import { database } from "./db";
import {
  enqueuePostTranslationDraft,
  type PostTranslationDraftQueueResult,
} from "./post-translation-draft-queue";

interface SourcePostRow {
  title: string;
  body_markdown: string;
}

interface TranslationDraftRow {
  current_source_title: string;
  current_source_body_markdown: string;
  published: boolean;
  generation_id: string | null;
  generation_status: "pending" | "processing" | "ready" | "failed" | "superseded" | null;
  source_hash: string | null;
  generation_source_title: string | null;
  generation_source_body_markdown: string | null;
  prompt_version: number | null;
  attempts: number | null;
  available_at: string | Date | null;
  draft_title: string | null;
  draft_body_markdown: string | null;
  tradeoffs: unknown;
  last_error: string | null;
}

export interface PostTranslationDraftView {
  locale: PostTranslationLocale;
  status: PostTranslationGenerationStatus;
  sourceHash: string;
  promptVersion: number;
  generationId?: string;
  attempts: number;
  retryAt?: string;
  title?: string;
  bodyMarkdown?: string;
  tradeoffs: PostTranslationTradeoff[];
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  model_output_invalid: "번역 결과 형식을 확인하지 못했습니다. 다시 생성해 주세요.",
  model_timeout: "번역 생성 시간이 초과되었습니다. 잠시 뒤 다시 시도합니다.",
  model_unavailable: "OAuth 번역 worker에 일시적으로 연결하지 못했습니다.",
  worker_interrupted: "worker가 중단되어 작업을 다시 대기열에 넣었습니다.",
};

function tradeoffs(value: unknown): PostTranslationTradeoff[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      !("sourcePhrase" in candidate) ||
      !("selectedTranslation" in candidate) ||
      !("reason" in candidate) ||
      typeof candidate.sourcePhrase !== "string" ||
      typeof candidate.selectedTranslation !== "string" ||
      typeof candidate.reason !== "string"
    ) return [];
    return [{
      sourcePhrase: candidate.sourcePhrase,
      selectedTranslation: candidate.selectedTranslation,
      reason: candidate.reason,
    }];
  });
}

export async function getPostTranslationSource(
  slug: string,
): Promise<{ title: string; bodyMarkdown: string } | undefined> {
  const sql = database();
  const rows = await sql`
    SELECT title, body_markdown
      FROM posts
     WHERE slug = ${slug}
     LIMIT 1
  `;
  const source = (rows as SourcePostRow[])[0];
  return source
    ? { title: source.title, bodyMarkdown: source.body_markdown }
    : undefined;
}

export async function requestPostTranslationDraft(
  slug: string,
  locale: PostTranslationLocale,
): Promise<PostTranslationDraftQueueResult> {
  const sql = database();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const source = await getPostTranslationSource(slug);
    if (!source) return { status: "missing" };
    const result = await enqueuePostTranslationDraft(sql, {
      generationId: randomUUID(),
      postSlug: slug,
      locale,
      modelLocale: postTranslationModelLocale(locale),
      sourceTitle: source.title,
      sourceBodyMarkdown: source.bodyMarkdown,
      sourceHash: postTranslationSourceHash(source.title, source.bodyMarkdown),
    });
    if (result.status !== "missing") return result;
  }
  return { status: "missing" };
}

export async function getPostTranslationDraft(
  slug: string,
  locale: PostTranslationLocale,
): Promise<PostTranslationDraftView | undefined> {
  const sql = database();
  const rows = await sql`
    WITH source_post AS (
      SELECT title, body_markdown
        FROM posts
       WHERE slug = ${slug}
       LIMIT 1
    ), published AS (
      SELECT true AS value
        FROM post_translations
       WHERE post_slug = ${slug}
         AND locale = ${locale}
       LIMIT 1
    ), latest AS (
      SELECT id, status, source_title, source_body_markdown, source_hash,
             prompt_version, attempts, available_at, draft_title,
             draft_body_markdown, tradeoffs, last_error
        FROM post_translation_generations
       WHERE post_slug = ${slug}
         AND locale = ${locale}
       ORDER BY requested_at DESC, id DESC
       LIMIT 1
    )
    SELECT source_post.title AS current_source_title,
           source_post.body_markdown AS current_source_body_markdown,
           EXISTS (SELECT 1 FROM published) AS published,
           latest.id AS generation_id,
           latest.status AS generation_status,
           latest.source_hash,
           latest.source_title AS generation_source_title,
           latest.source_body_markdown AS generation_source_body_markdown,
           latest.prompt_version,
           latest.attempts,
           latest.available_at,
           latest.draft_title,
           latest.draft_body_markdown,
           latest.tradeoffs,
           latest.last_error
      FROM source_post
      LEFT JOIN latest ON true
  `;
  const row = (rows as TranslationDraftRow[])[0];
  if (!row) return undefined;
  const sourceHash = postTranslationSourceHash(
    row.current_source_title,
    row.current_source_body_markdown,
  );
  if (row.published) {
    return {
      locale,
      status: "published",
      sourceHash,
      promptVersion: POST_TRANSLATION_PROMPT_VERSION,
      attempts: row.attempts ?? 0,
      tradeoffs: [],
    };
  }
  if (!row.generation_id || !row.generation_status) {
    return {
      locale,
      status: "idle",
      sourceHash,
      promptVersion: POST_TRANSLATION_PROMPT_VERSION,
      attempts: 0,
      tradeoffs: [],
    };
  }
  const sourceMatches = row.source_hash === sourceHash &&
    row.generation_source_title === row.current_source_title &&
    row.generation_source_body_markdown === row.current_source_body_markdown &&
    row.prompt_version === POST_TRANSLATION_PROMPT_VERSION;
  const status: PostTranslationGenerationStatus = sourceMatches
    ? row.generation_status
    : "superseded";
  const ready = status === "ready" && row.draft_title && row.draft_body_markdown;
  return {
    locale,
    status: ready ? "ready" : status === "ready" ? "failed" : status,
    sourceHash,
    promptVersion: POST_TRANSLATION_PROMPT_VERSION,
    generationId: row.generation_id,
    attempts: row.attempts ?? 0,
    ...(row.available_at ? { retryAt: new Date(row.available_at).toISOString() } : {}),
    ...(ready ? { title: row.draft_title!, bodyMarkdown: row.draft_body_markdown! } : {}),
    tradeoffs: ready ? tradeoffs(row.tradeoffs) : [],
    ...(status === "failed" || (status === "ready" && !ready)
      ? { error: ERROR_MESSAGES[row.last_error ?? ""] ?? "번역 초안을 만들지 못했습니다." }
      : {}),
  };
}
