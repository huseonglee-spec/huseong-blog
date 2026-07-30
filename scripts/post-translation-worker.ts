import { execFile } from "node:child_process";
import { loadEnvFile } from "node:process";
import { promisify } from "node:util";

import { neon } from "@neondatabase/serverless";

import {
  buildPostTranslationPrompt,
  parseGeneratedPostTranslation,
  parsePostTranslationMaxJobs,
  POST_TRANSLATION_MAX_TRANSIENT_ATTEMPTS,
  POST_TRANSLATION_PROMPT_VERSION,
  postTranslationRetryDecision,
  postTranslationSourceHash,
  type GeneratedPostTranslation,
  type PostTranslationFailureCode,
} from "../src/lib/post-translation-generation";
import type { PostTranslationLocale } from "../src/lib/post-translation";
import {
  generateWithHermesOAuth,
  HermesOAuthInvocationError,
} from "../src/lib/server/hermes-oauth";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const sql = neon(databaseUrl);
const execFileAsync = promisify(execFile);
const hermesInvocation = {
  bin: process.env.HUSEONG_BLOG_TRANSLATION_HERMES_BIN ?? "/home/huseong/.local/bin/hermes",
  profile: process.env.HUSEONG_BLOG_TRANSLATION_HERMES_PROFILE ?? "linux-coder",
  model: process.env.HUSEONG_BLOG_TRANSLATION_HERMES_MODEL ?? "gpt-5.6-sol",
  timeoutMs: 240_000,
};
const maxJobs = parsePostTranslationMaxJobs(
  process.env.HUSEONG_BLOG_TRANSLATION_MAX_JOBS,
);

interface ClaimedGenerationRow {
  id: string;
  post_slug: string;
  locale: PostTranslationLocale;
  source_title: string;
  source_body_markdown: string;
  source_hash: string;
  prompt_version: number;
  attempts: number;
}

interface CurrentSourceRow {
  title: string;
  body_markdown: string;
  published: boolean;
}

async function assertCleanCheckout(): Promise<void> {
  if (process.env.HUSEONG_BLOG_TRANSLATION_ALLOW_DIRTY === "1") return;
  const result = await execFileAsync(
    "git",
    ["status", "--porcelain", "--untracked-files=normal"],
    { timeout: 15_000, maxBuffer: 256 * 1024 },
  );
  if (result.stdout.trim()) {
    throw new Error(
      "Translation worker refuses a dirty Git checkout. Commit or stash changes before starting it.",
    );
  }
}

async function supersedeOldPromptVersions(): Promise<number> {
  const rows = await sql`
    UPDATE post_translation_generations
       SET status = 'superseded',
           completed_at = now(),
           last_error = NULL
     WHERE prompt_version <> ${POST_TRANSLATION_PROMPT_VERSION}
       AND status IN ('pending', 'processing', 'ready')
    RETURNING id
  `;
  return rows.length;
}

async function recoverStaleProcessingGenerations(): Promise<{
  recovered: number;
  terminalFailures: number;
}> {
  const rows = await sql`
    UPDATE post_translation_generations
       SET status = CASE WHEN attempts < ${POST_TRANSLATION_MAX_TRANSIENT_ATTEMPTS} THEN 'pending' ELSE 'failed' END,
           available_at = now(),
           completed_at = CASE WHEN attempts < ${POST_TRANSLATION_MAX_TRANSIENT_ATTEMPTS} THEN NULL ELSE now() END,
           last_error = 'worker_interrupted'
     WHERE status = 'processing'
       AND started_at < now() - interval '10 minutes'
    RETURNING status
  `;
  return {
    recovered: rows.length,
    terminalFailures: (rows as { status: string }[])
      .filter((row) => row.status === "failed").length,
  };
}

async function claimGeneration(): Promise<ClaimedGenerationRow | undefined> {
  const rows = await sql`
    WITH candidate AS (
      SELECT id
        FROM post_translation_generations
       WHERE status = 'pending'
         AND available_at <= now()
         AND prompt_version = ${POST_TRANSLATION_PROMPT_VERSION}
       ORDER BY requested_at ASC, id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
    )
    UPDATE post_translation_generations AS generation
       SET status = 'processing',
           attempts = generation.attempts + 1,
           started_at = now(),
           last_error = NULL
      FROM candidate
     WHERE generation.id = candidate.id
    RETURNING generation.id, generation.post_slug, generation.locale,
              generation.source_title, generation.source_body_markdown,
              generation.source_hash, generation.prompt_version,
              generation.attempts
  `;
  return (rows as ClaimedGenerationRow[])[0];
}

async function currentSource(job: ClaimedGenerationRow): Promise<CurrentSourceRow | undefined> {
  const rows = await sql`
    SELECT post.title, post.body_markdown,
           EXISTS (
             SELECT 1
               FROM post_translations
              WHERE post_slug = post.slug
                AND locale = ${job.locale}
           ) AS published
      FROM posts AS post
     WHERE post.slug = ${job.post_slug}
     LIMIT 1
  `;
  return (rows as CurrentSourceRow[])[0];
}

async function supersedeGeneration(job: ClaimedGenerationRow): Promise<void> {
  await sql`
    UPDATE post_translation_generations
       SET status = 'superseded',
           completed_at = now(),
           last_error = NULL
     WHERE id = ${job.id}
       AND status = 'processing'
  `;
}

async function completeGeneration(
  job: ClaimedGenerationRow,
  generated: GeneratedPostTranslation,
): Promise<boolean> {
  const payload = JSON.stringify(generated.tradeoffs);
  const rows = await sql`
    WITH current_source AS MATERIALIZED (
      SELECT slug
        FROM posts
       WHERE slug = ${job.post_slug}
         AND title = ${job.source_title}
         AND body_markdown = ${job.source_body_markdown}
       FOR UPDATE
    ), valid_job AS MATERIALIZED (
      SELECT generation.id
        FROM post_translation_generations AS generation
        CROSS JOIN current_source
       WHERE generation.id = ${job.id}
         AND generation.status = 'processing'
         AND generation.locale = ${job.locale}
         AND generation.source_hash = ${job.source_hash}
         AND generation.prompt_version = ${job.prompt_version}
         AND NOT EXISTS (
           SELECT 1
             FROM post_translations
            WHERE post_slug = ${job.post_slug}
              AND locale = ${job.locale}
         )
       FOR UPDATE OF generation
    )
    UPDATE post_translation_generations
       SET status = 'ready',
           draft_title = ${generated.title},
           draft_body_markdown = ${generated.bodyMarkdown},
           tradeoffs = ${payload}::jsonb,
           completed_at = now(),
           last_error = NULL
     WHERE id IN (SELECT id FROM valid_job)
    RETURNING id
  `;
  return Boolean((rows as { id: string }[])[0]?.id);
}

function failureCode(
  error: unknown,
): PostTranslationFailureCode {
  if (error instanceof HermesOAuthInvocationError) return error.reason;
  if (error instanceof SyntaxError || error instanceof TypeError) return "model_output_invalid";
  return "model_unavailable";
}

async function failGeneration(job: ClaimedGenerationRow, error: unknown): Promise<boolean> {
  const code = failureCode(error);
  const { retry, delaySeconds } = postTranslationRetryDecision(code, job.attempts);
  await sql`
    UPDATE post_translation_generations
       SET status = ${retry ? "pending" : "failed"},
           available_at = CASE
             WHEN ${retry} THEN now() + (${delaySeconds} * interval '1 second')
             ELSE available_at
           END,
           completed_at = CASE WHEN ${retry} THEN NULL ELSE now() END,
           last_error = ${code}
     WHERE id = ${job.id}
       AND status = 'processing'
  `;
  return retry;
}

async function processGeneration(
  job: ClaimedGenerationRow,
): Promise<"ready" | "retrying" | "failed" | "superseded"> {
  const source = await currentSource(job);
  if (
    !source ||
    source.published ||
    source.title !== job.source_title ||
    source.body_markdown !== job.source_body_markdown ||
    postTranslationSourceHash(job.source_title, job.source_body_markdown) !== job.source_hash
  ) {
    await supersedeGeneration(job);
    return "superseded";
  }

  try {
    const prompt = buildPostTranslationPrompt({
      locale: job.locale,
      title: job.source_title,
      bodyMarkdown: job.source_body_markdown,
    });
    const raw = await generateWithHermesOAuth(prompt, hermesInvocation);
    const generated = parseGeneratedPostTranslation({
      locale: job.locale,
      title: job.source_title,
      bodyMarkdown: job.source_body_markdown,
      raw,
    });
    const completed = await completeGeneration(job, generated);
    if (!completed) {
      await supersedeGeneration(job);
      return "superseded";
    }
    return "ready";
  } catch (error) {
    const retry = await failGeneration(job, error);
    return retry ? "retrying" : "failed";
  }
}

await assertCleanCheckout();
const supersededOldPrompts = await supersedeOldPromptVersions();
const recovery = await recoverStaleProcessingGenerations();
const counts = {
  supersededOldPrompts,
  recovered: recovery.recovered,
  ready: 0,
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
