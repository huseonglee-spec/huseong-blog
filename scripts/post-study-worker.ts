import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { neon } from "@neondatabase/serverless";

import {
  buildPostStudyPrompt,
  normalizePostStudyItemKey,
  parsePostStudyMaxJobs,
  parseGeneratedPostStudyItems,
  POST_STUDY_PROMPT_VERSION,
  postStudySourceHash,
  type PostStudyItem,
} from "../src/lib/post-study";
import type { PostTranslationLocale } from "../src/lib/post-translation";
import {
  generateWithHermesOAuth,
  HermesOAuthInvocationError,
} from "../src/lib/server/hermes-oauth";
import { enqueuePostStudyGeneration } from "../src/lib/server/post-study-queue";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const sql = neon(databaseUrl);
const execFileAsync = promisify(execFile);
const configuredHermesProvider = process.env.HUSEONG_BLOG_STUDY_HERMES_PROVIDER ?? "openai-codex";
if (configuredHermesProvider !== "openai-codex") {
  throw new Error("Study generation requires the openai-codex OAuth provider");
}
const hermesInvocation = {
  bridgePythonBin: process.env.HUSEONG_BLOG_STUDY_HERMES_PYTHON ??
    "/home/huseong/.hermes/hermes-agent/venv/bin/python3",
  bridgeScriptPath: process.env.HUSEONG_BLOG_STUDY_HERMES_BRIDGE ??
    fileURLToPath(new URL("./hermes-oauth-stdin-bridge.py", import.meta.url)),
  hermesBin: process.env.HUSEONG_BLOG_STUDY_HERMES_BIN ?? "/home/huseong/.local/bin/hermes",
  profile: process.env.HUSEONG_BLOG_STUDY_HERMES_PROFILE ?? "linux-coder",
  provider: configuredHermesProvider,
  model: process.env.HUSEONG_BLOG_STUDY_HERMES_MODEL ?? "gpt-5.6-sol",
  timeoutMs: 240_000,
} as const;
const maxJobs = parsePostStudyMaxJobs(process.env.HUSEONG_BLOG_STUDY_MAX_JOBS);
const MAX_TRANSIENT_ATTEMPTS = 6;
const MAX_INVALID_OUTPUT_ATTEMPTS = 3;

async function assertCleanCheckout(): Promise<void> {
  if (process.env.HUSEONG_BLOG_STUDY_ALLOW_DIRTY === "1") return;
  const result = await execFileAsync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    timeout: 15_000,
    maxBuffer: 256 * 1024,
  });
  if (result.stdout.trim()) {
    throw new Error("Study worker refuses a dirty Git checkout. Commit or stash changes before starting it.");
  }
}

interface TranslationInventoryRow {
  post_slug: string;
  locale: PostTranslationLocale;
  title: string;
  body_markdown: string;
  latest_source_hash: string | null;
  latest_prompt_version: number | null;
}

interface ClaimedGenerationRow {
  id: string;
  post_slug: string;
  locale: PostTranslationLocale;
  source_hash: string;
  prompt_version: number;
  attempts: number;
  title: string;
  body_markdown: string;
}

interface TranslationSourceRow {
  title: string;
  body_markdown: string;
}

async function queueGeneration(
  postSlug: string,
  locale: PostTranslationLocale,
  title: string,
  bodyMarkdown: string,
  sourceHash: string,
): Promise<"queued" | "active" | "missing"> {
  return enqueuePostStudyGeneration(sql, {
    generationId: randomUUID(),
    postSlug,
    locale,
    title,
    bodyMarkdown,
    sourceHash,
  });
}

async function recoverStaleProcessingGenerations(): Promise<{
  recovered: number;
  terminalFailures: number;
}> {
  const rows = await sql`
    UPDATE post_study_generations
       SET status = CASE WHEN attempts < ${MAX_TRANSIENT_ATTEMPTS} THEN 'pending' ELSE 'failed' END,
           available_at = now(),
           completed_at = CASE WHEN attempts < ${MAX_TRANSIENT_ATTEMPTS} THEN NULL ELSE now() END,
           last_error = 'worker_interrupted'
     WHERE status = 'processing'
       AND started_at < now() - interval '20 minutes'
    RETURNING status
  `;
  return {
    recovered: rows.length,
    terminalFailures: (rows as { status: string }[])
      .filter((row) => row.status === "failed").length,
  };
}

async function sweepChangedTranslations(): Promise<number> {
  const rows = await sql`
    SELECT t.post_slug, t.locale, t.title, t.body_markdown,
           latest.source_hash AS latest_source_hash,
           latest.prompt_version AS latest_prompt_version
      FROM post_translations AS t
      LEFT JOIN LATERAL (
        SELECT source_hash, prompt_version
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
    if ((row.latest_prompt_version ?? 0) > POST_STUDY_PROMPT_VERSION) continue;
    if (
      row.latest_source_hash === sourceHash &&
      row.latest_prompt_version === POST_STUDY_PROMPT_VERSION
    ) continue;
    const status = await queueGeneration(
      row.post_slug,
      row.locale,
      row.title,
      row.body_markdown,
      sourceHash,
    );
    if (status === "queued") queued += 1;
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
         AND prompt_version = ${POST_STUDY_PROMPT_VERSION}
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
      RETURNING g.id, g.post_slug, g.locale, g.source_hash,
                g.prompt_version, g.attempts
    )
    SELECT c.id, c.post_slug, c.locale, c.source_hash,
           c.prompt_version, c.attempts,
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

async function completeGeneration(
  job: ClaimedGenerationRow,
  items: readonly PostStudyItem[],
): Promise<boolean> {
  const payload = JSON.stringify(items.map((item, sortOrder) => ({
    itemKey: item.itemKey,
    sortOrder,
    kind: item.kind,
    text: item.text,
    canonicalText: item.canonicalText,
    reading: item.reading ?? null,
    meaningKo: item.meaningKo,
    noteKo: item.noteKo,
    context: item.context,
  })));
  const rows = await sql`
    WITH current_source AS MATERIALIZED (
      SELECT post_slug
        FROM post_translations
       WHERE post_slug = ${job.post_slug}
         AND locale = ${job.locale}
         AND title = ${job.title}
         AND body_markdown = ${job.body_markdown}
       FOR UPDATE
    ), valid_job AS MATERIALIZED (
      SELECT g.id
        FROM post_study_generations AS g
        CROSS JOIN current_source
       WHERE g.id = ${job.id}
         AND g.status = 'processing'
         AND g.attempts = ${job.attempts}
         AND g.source_hash = ${job.source_hash}
         AND g.prompt_version = ${job.prompt_version}
       FOR UPDATE OF g
    ), input_items AS (
      SELECT *
        FROM jsonb_to_recordset(${payload}::jsonb) AS item(
          "itemKey" text,
          "sortOrder" integer,
          kind text,
          text text,
          "canonicalText" text,
          reading text,
          "meaningKo" text,
          "noteKo" text,
          context text
        )
    ), inserted AS (
      INSERT INTO post_study_items (
        generation_id, item_key, sort_order, kind, text, canonical_text,
        reading, meaning_ko, note_ko, context_text
      )
      SELECT ${job.id}, item."itemKey", item."sortOrder", item.kind,
             item.text, item."canonicalText", item.reading,
             item."meaningKo", item."noteKo", item.context
        FROM input_items AS item
        CROSS JOIN current_source
        CROSS JOIN valid_job
      ON CONFLICT (generation_id, item_key) DO UPDATE SET
        sort_order = EXCLUDED.sort_order,
        kind = EXCLUDED.kind,
        text = EXCLUDED.text,
        canonical_text = EXCLUDED.canonical_text,
        reading = EXCLUDED.reading,
        meaning_ko = EXCLUDED.meaning_ko,
        note_ko = EXCLUDED.note_ko,
        context_text = EXCLUDED.context_text
      RETURNING item_key
    ), completed AS (
      UPDATE post_study_generations
         SET status = 'completed',
             completed_at = now(),
             last_error = NULL
       WHERE id IN (SELECT id FROM valid_job)
         AND EXISTS (SELECT 1 FROM current_source)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM current_source) AS source_matches,
           EXISTS (SELECT 1 FROM completed) AS completed
  `;
  return Boolean((rows as { completed: boolean }[])[0]?.completed);
}

async function supersedeGeneration(job: ClaimedGenerationRow): Promise<boolean> {
  const rows = await sql`
    UPDATE post_study_generations
       SET status = 'superseded',
           completed_at = now(),
           last_error = NULL
     WHERE id = ${job.id}
       AND status = 'processing'
       AND attempts = ${job.attempts}
    RETURNING id
  `;
  const row = (rows as { id: string }[])[0];
  if (!row) return false;
  const source = await currentTranslation(job.post_slug, job.locale);
  if (source) {
    await queueGeneration(
      job.post_slug,
      job.locale,
      source.title,
      source.body_markdown,
      postStudySourceHash(source.title, source.body_markdown),
    );
  }
  return true;
}

function failureCode(error: unknown): "model_output_invalid" | "model_timeout" | "model_unavailable" {
  if (error instanceof HermesOAuthInvocationError) return error.reason;
  if (error instanceof SyntaxError || error instanceof TypeError) return "model_output_invalid";
  return "model_unavailable";
}

async function failGeneration(
  job: ClaimedGenerationRow,
  error: unknown,
): Promise<boolean | undefined> {
  const code = failureCode(error);
  const maxAttempts = code === "model_output_invalid"
    ? MAX_INVALID_OUTPUT_ATTEMPTS
    : MAX_TRANSIENT_ATTEMPTS;
  const retry = job.attempts < maxAttempts;
  const transientDelays = [60, 300, 900, 3_600, 21_600];
  const invalidDelays = [60, 300];
  const delays = code === "model_output_invalid" ? invalidDelays : transientDelays;
  const delaySeconds = delays[Math.min(job.attempts - 1, delays.length - 1)] ?? 300;
  const rows = await sql`
    UPDATE post_study_generations
       SET status = ${retry ? "pending" : "failed"},
           available_at = CASE
             WHEN ${retry} THEN now() + (${delaySeconds} * interval '1 second')
             ELSE available_at
           END,
           completed_at = CASE WHEN ${retry} THEN NULL ELSE now() END,
           last_error = ${code}
     WHERE id = ${job.id}
       AND status = 'processing'
       AND attempts = ${job.attempts}
    RETURNING status
  `;
  const row = (rows as { status: string }[])[0];
  if (!row) return undefined;
  return retry;
}

async function processGeneration(
  job: ClaimedGenerationRow,
): Promise<"completed" | "retrying" | "failed" | "superseded"> {
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
    const raw = await generateWithHermesOAuth(prompt, hermesInvocation);
    const generated = parseGeneratedPostStudyItems({
      locale: job.locale,
      bodyMarkdown: job.body_markdown,
      raw,
    });
    const dismissedKeys = new Set(dismissed.map((item) => item.itemKey));
    const items = generated.filter((item) =>
      !dismissedKeys.has(item.itemKey) &&
      !dismissedKeys.has(normalizePostStudyItemKey(job.locale, item.text))
    );

    const completed = await completeGeneration(job, items);
    if (!completed) {
      await supersedeGeneration(job);
      return "superseded";
    }
    return "completed";
  } catch (error) {
    const retry = await failGeneration(job, error);
    if (retry === undefined) return "superseded";
    return retry ? "retrying" : "failed";
  }
}

await assertCleanCheckout();
const recovery = await recoverStaleProcessingGenerations();
const queued = await sweepChangedTranslations();
const counts = {
  recovered: recovery.recovered,
  queued,
  completed: 0,
  retrying: 0,
  failed: recovery.terminalFailures,
  superseded: 0,
};
for (let index = 0; index < maxJobs; index += 1) {
  const job = await claimGeneration();
  if (!job) break;
  const result = await processGeneration(job);
  counts[result] += 1;
}
console.log(JSON.stringify(counts));
if (counts.failed > 0) process.exitCode = 1;
