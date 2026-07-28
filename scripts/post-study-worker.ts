import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { promisify } from "node:util";

import { neon } from "@neondatabase/serverless";

import {
  buildPostStudyPrompt,
  parseGeneratedPostStudyItems,
  POST_STUDY_PROMPT_VERSION,
  postStudySourceHash,
  type PostStudyItem,
} from "../src/lib/post-study";
import type { PostTranslationLocale } from "../src/lib/post-translation";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const sql = neon(databaseUrl);
const execFileAsync = promisify(execFile);
const hermesBin = process.env.HUSEONG_BLOG_STUDY_HERMES_BIN ?? "/home/huseong/.local/bin/hermes";
const hermesProfile = process.env.HUSEONG_BLOG_STUDY_HERMES_PROFILE ?? "macmini";
const hermesModel = process.env.HUSEONG_BLOG_STUDY_HERMES_MODEL ?? "gpt-5.6-sol";
const maxJobs = Math.max(1, Math.min(Number(process.env.HUSEONG_BLOG_STUDY_MAX_JOBS ?? "3"), 10));

interface TranslationInventoryRow {
  post_slug: string;
  locale: PostTranslationLocale;
  title: string;
  body_markdown: string;
  latest_source_hash: string | null;
}

interface ClaimedGenerationRow {
  id: string;
  post_slug: string;
  locale: PostTranslationLocale;
  source_hash: string;
  attempts: number;
  title: string;
  body_markdown: string;
}

interface TranslationSourceRow {
  title: string;
  body_markdown: string;
}

interface HermesResult {
  sessionId?: string;
  content: string;
}

async function queueGeneration(
  postSlug: string,
  locale: PostTranslationLocale,
  sourceHash: string,
): Promise<void> {
  const generationId = randomUUID();
  await sql.transaction([
    sql`
      UPDATE post_study_generations
         SET status = 'superseded',
             completed_at = now(),
             last_error = NULL
       WHERE post_slug = ${postSlug}
         AND locale = ${locale}
         AND status IN ('pending', 'processing')
         AND source_hash <> ${sourceHash}
    `,
    sql`
      INSERT INTO post_study_generations (
        id, post_slug, locale, source_hash, prompt_version
      )
      SELECT ${generationId}, post_slug, locale, ${sourceHash}, ${POST_STUDY_PROMPT_VERSION}
        FROM post_translations
       WHERE post_slug = ${postSlug}
         AND locale = ${locale}
      ON CONFLICT DO NOTHING
    `,
  ]);
}

async function recoverStaleProcessingGenerations(): Promise<number> {
  const rows = await sql`
    UPDATE post_study_generations
       SET status = CASE WHEN attempts < 3 THEN 'pending' ELSE 'failed' END,
           available_at = now(),
           completed_at = CASE WHEN attempts < 3 THEN NULL ELSE now() END,
           last_error = 'worker_interrupted'
     WHERE status = 'processing'
       AND started_at < now() - interval '20 minutes'
    RETURNING id
  `;
  return rows.length;
}

async function sweepChangedTranslations(): Promise<number> {
  const rows = await sql`
    SELECT t.post_slug, t.locale, t.title, t.body_markdown,
           latest.source_hash AS latest_source_hash
      FROM post_translations AS t
      LEFT JOIN LATERAL (
        SELECT source_hash
          FROM post_study_generations AS g
         WHERE g.post_slug = t.post_slug
           AND g.locale = t.locale
         ORDER BY g.requested_at DESC, g.id DESC
         LIMIT 1
      ) AS latest ON true
     ORDER BY t.post_slug ASC, t.locale ASC
  `;

  let queued = 0;
  for (const row of rows as TranslationInventoryRow[]) {
    const sourceHash = postStudySourceHash(row.title, row.body_markdown);
    if (row.latest_source_hash === sourceHash) continue;
    await queueGeneration(row.post_slug, row.locale, sourceHash);
    queued += 1;
  }
  return queued;
}

async function claimGeneration(): Promise<ClaimedGenerationRow | undefined> {
  const rows = await sql`
    WITH candidate AS (
      SELECT id
        FROM post_study_generations
       WHERE status = 'pending'
         AND available_at <= now()
       ORDER BY requested_at ASC, id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
    ), claimed AS (
      UPDATE post_study_generations AS g
         SET status = 'processing',
             attempts = g.attempts + 1,
             started_at = now(),
             last_error = NULL
        FROM candidate AS c
       WHERE g.id = c.id
      RETURNING g.id, g.post_slug, g.locale, g.source_hash, g.attempts
    )
    SELECT c.id, c.post_slug, c.locale, c.source_hash, c.attempts,
           t.title, t.body_markdown
      FROM claimed AS c
      JOIN post_translations AS t
        ON t.post_slug = c.post_slug
       AND t.locale = c.locale
  `;
  return (rows as ClaimedGenerationRow[])[0];
}

async function currentTranslation(
  postSlug: string,
  locale: PostTranslationLocale,
): Promise<TranslationSourceRow | undefined> {
  const rows = await sql`
    SELECT title, body_markdown
      FROM post_translations
     WHERE post_slug = ${postSlug}
       AND locale = ${locale}
     LIMIT 1
  `;
  return (rows as TranslationSourceRow[])[0];
}

async function dismissedStudyItems(
  locale: PostTranslationLocale,
): Promise<{ itemKey: string; text: string }[]> {
  const rows = await sql`
    SELECT item_key, text
      FROM post_study_dismissals
     WHERE locale = ${locale}
     ORDER BY dismissed_at ASC, item_key ASC
  `;
  return (rows as { item_key: string; text: string }[]).map((row) => ({
    itemKey: row.item_key,
    text: row.text,
  }));
}

function parseHermesOutput(stdout: string): HermesResult {
  const lines = stdout.trim().split(/\r?\n/u);
  const sessionLine = lines.find((line) => line.startsWith("session_id:"));
  const content = lines.filter((line) => !line.startsWith("session_id:")).join("\n").trim();
  if (!content) throw new TypeError("hermes_empty_output");
  return {
    ...(sessionLine ? { sessionId: sessionLine.slice("session_id:".length).trim() } : {}),
    content,
  };
}

async function deleteHermesSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  try {
    await execFileAsync(hermesBin, ["--profile", hermesProfile, "sessions", "delete", sessionId], {
      timeout: 30_000,
      maxBuffer: 256 * 1024,
    });
  } catch {
    // Source-tagged worker sessions stay hidden from the normal chat list if cleanup fails.
  }
}

async function generateWithHermes(prompt: string): Promise<string> {
  const args = [
    "--profile",
    hermesProfile,
    "chat",
    "-Q",
    "-t",
    "safe",
    "--source",
    "tool",
    "--max-turns",
    "2",
    "-m",
    hermesModel,
    "-q",
    prompt,
  ];
  const result = await execFileAsync(hermesBin, args, {
    timeout: 240_000,
    maxBuffer: 4 * 1024 * 1024,
    env: process.env,
  });
  const parsed = parseHermesOutput(result.stdout);
  await deleteHermesSession(parsed.sessionId);
  return parsed.content;
}

async function completeGeneration(
  generationId: string,
  items: readonly PostStudyItem[],
): Promise<void> {
  const queries = [
    sql`DELETE FROM post_study_items WHERE generation_id = ${generationId}`,
    ...items.map((item, index) => sql`
      INSERT INTO post_study_items (
        generation_id, item_key, sort_order, kind, text, reading,
        meaning_ko, note_ko, context_text
      ) VALUES (
        ${generationId}, ${item.itemKey}, ${index}, ${item.kind}, ${item.text},
        ${item.reading ?? null}, ${item.meaningKo}, ${item.noteKo}, ${item.context}
      )
    `),
    sql`
      UPDATE post_study_generations
         SET status = 'completed',
             completed_at = now(),
             last_error = NULL
       WHERE id = ${generationId}
         AND status = 'processing'
    `,
  ];
  await sql.transaction(queries);
}

async function supersedeGeneration(job: ClaimedGenerationRow): Promise<void> {
  const source = await currentTranslation(job.post_slug, job.locale);
  await sql`
    UPDATE post_study_generations
       SET status = 'superseded',
           completed_at = now(),
           last_error = NULL
     WHERE id = ${job.id}
  `;
  if (source) {
    await queueGeneration(
      job.post_slug,
      job.locale,
      postStudySourceHash(source.title, source.body_markdown),
    );
  }
}

function failureCode(error: unknown): string {
  if (error instanceof SyntaxError || error instanceof TypeError) return "model_output_invalid";
  if (typeof error === "object" && error !== null && "killed" in error) return "model_timeout";
  return "model_unavailable";
}

async function failGeneration(job: ClaimedGenerationRow, error: unknown): Promise<void> {
  const retry = job.attempts < 3;
  await sql`
    UPDATE post_study_generations
       SET status = ${retry ? "pending" : "failed"},
           available_at = CASE
             WHEN ${retry} THEN now() + (${Math.max(30, job.attempts * 30)} * interval '1 second')
             ELSE available_at
           END,
           completed_at = CASE WHEN ${retry} THEN NULL ELSE now() END,
           last_error = ${failureCode(error)}
     WHERE id = ${job.id}
  `;
}

async function processGeneration(job: ClaimedGenerationRow): Promise<"completed" | "failed" | "superseded"> {
  const initialHash = postStudySourceHash(job.title, job.body_markdown);
  if (initialHash !== job.source_hash) {
    await supersedeGeneration(job);
    return "superseded";
  }

  try {
    const dismissed = await dismissedStudyItems(job.locale);
    const prompt = buildPostStudyPrompt({
      locale: job.locale,
      title: job.title,
      bodyMarkdown: job.body_markdown,
      dismissedTexts: dismissed.map((item) => item.text),
    });
    const raw = await generateWithHermes(prompt);
    const generated = parseGeneratedPostStudyItems({
      locale: job.locale,
      bodyMarkdown: job.body_markdown,
      raw,
    });
    const dismissedKeys = new Set(dismissed.map((item) => item.itemKey));
    const items = generated.filter((item) => !dismissedKeys.has(item.itemKey));

    const latest = await currentTranslation(job.post_slug, job.locale);
    if (
      !latest ||
      postStudySourceHash(latest.title, latest.body_markdown) !== job.source_hash
    ) {
      await supersedeGeneration(job);
      return "superseded";
    }

    await completeGeneration(job.id, items);
    return "completed";
  } catch (error) {
    await failGeneration(job, error);
    return "failed";
  }
}

const recovered = await recoverStaleProcessingGenerations();
const queued = await sweepChangedTranslations();
const counts = { recovered, queued, completed: 0, failed: 0, superseded: 0 };
for (let index = 0; index < maxJobs; index += 1) {
  const job = await claimGeneration();
  if (!job) break;
  const result = await processGeneration(job);
  counts[result] += 1;
}
console.log(JSON.stringify(counts));
