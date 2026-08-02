import { execFile } from "node:child_process";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { neon } from "@neondatabase/serverless";

import {
  buildPostWritingFeedbackPrompt,
  parseGeneratedPostWritingFeedback,
  parsePostWritingFeedbackMaxJobs,
  POST_WRITING_FEEDBACK_MAX_TRANSIENT_ATTEMPTS,
  POST_WRITING_FEEDBACK_PROMPT_VERSION,
  postWritingFeedbackItemKey,
  postWritingFeedbackRetryDecision,
  postWritingFeedbackSourceHash,
  type GeneratedPostWritingFeedback,
  type PostWritingFeedbackFailureCode,
  type PostWritingFeedbackLocale,
} from "../src/lib/post-writing-feedback";
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
const configuredProvider = process.env.HUSEONG_BLOG_FEEDBACK_HERMES_PROVIDER ?? "openai-codex";
if (configuredProvider !== "openai-codex") {
  throw new Error("Writing feedback worker requires the openai-codex OAuth provider");
}
const hermesInvocation = {
  bridgePythonBin: process.env.HUSEONG_BLOG_FEEDBACK_HERMES_PYTHON ??
    "/home/huseong/.hermes/hermes-agent/venv/bin/python3",
  bridgeScriptPath: process.env.HUSEONG_BLOG_FEEDBACK_HERMES_BRIDGE ??
    fileURLToPath(new URL("./hermes-oauth-stdin-bridge.py", import.meta.url)),
  hermesBin: process.env.HUSEONG_BLOG_FEEDBACK_HERMES_BIN ?? "/home/huseong/.local/bin/hermes",
  profile: process.env.HUSEONG_BLOG_FEEDBACK_HERMES_PROFILE ?? "linux-coder",
  provider: "openai-codex" as const,
  model: process.env.HUSEONG_BLOG_FEEDBACK_HERMES_MODEL ?? "gpt-5.6-sol",
  timeoutMs: 240_000,
};
const maxJobs = parsePostWritingFeedbackMaxJobs(
  process.env.HUSEONG_BLOG_FEEDBACK_MAX_JOBS,
);

interface ClaimedGenerationRow {
  id: string;
  post_slug: string;
  locale: PostWritingFeedbackLocale;
  source_title: string;
  source_body_markdown: string;
  source_hash: string;
  prompt_version: number;
  attempts: number;
}

async function assertCleanCheckout(): Promise<void> {
  if (process.env.HUSEONG_BLOG_FEEDBACK_ALLOW_DIRTY === "1") return;
  const result = await execFileAsync(
    "git",
    ["status", "--porcelain", "--untracked-files=normal"],
    { timeout: 15_000, maxBuffer: 256 * 1024 },
  );
  if (result.stdout.trim()) {
    throw new Error(
      "Writing feedback worker refuses a dirty Git checkout. Deploy an exact clean revision first.",
    );
  }
}

async function supersedeOldPromptVersions(): Promise<number> {
  const rows = await sql`
    UPDATE post_writing_feedback_generations
       SET status = 'superseded',
           completed_at = now(),
           last_error = NULL
     WHERE prompt_version <> ${POST_WRITING_FEEDBACK_PROMPT_VERSION}
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
    UPDATE post_writing_feedback_generations
       SET status = CASE
             WHEN attempts < ${POST_WRITING_FEEDBACK_MAX_TRANSIENT_ATTEMPTS} THEN 'pending'
             ELSE 'failed'
           END,
           available_at = now(),
           completed_at = CASE
             WHEN attempts < ${POST_WRITING_FEEDBACK_MAX_TRANSIENT_ATTEMPTS} THEN NULL
             ELSE now()
           END,
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
        FROM post_writing_feedback_generations
       WHERE status = 'pending'
         AND available_at <= now()
         AND prompt_version = ${POST_WRITING_FEEDBACK_PROMPT_VERSION}
       ORDER BY requested_at ASC, id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
    )
    UPDATE post_writing_feedback_generations AS generation
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

async function supersedeGeneration(job: ClaimedGenerationRow): Promise<void> {
  await sql`
    UPDATE post_writing_feedback_generations
       SET status = 'superseded',
           completed_at = now(),
           last_error = NULL
     WHERE id = ${job.id}
       AND status = 'processing'
       AND attempts = ${job.attempts}
  `;
}

async function completeGeneration(
  job: ClaimedGenerationRow,
  generated: GeneratedPostWritingFeedback,
): Promise<boolean> {
  const payload = JSON.stringify(generated.items.map((item, sortOrder) => ({
    itemKey: postWritingFeedbackItemKey(item.feedback, item.reason),
    sortOrder,
    feedback: item.feedback,
    reason: item.reason,
  })));
  const rows = await sql`
    WITH valid_job AS MATERIALIZED (
      SELECT id
        FROM post_writing_feedback_generations
       WHERE id = ${job.id}
         AND status = 'processing'
         AND attempts = ${job.attempts}
         AND source_hash = ${job.source_hash}
         AND prompt_version = ${job.prompt_version}
       FOR UPDATE
    ), input_items AS (
      SELECT *
        FROM jsonb_to_recordset(${payload}::jsonb) AS item(
          "itemKey" text,
          "sortOrder" integer,
          feedback text,
          reason text
        )
    ), inserted AS (
      INSERT INTO post_writing_feedback_items (
        generation_id, item_key, sort_order, feedback, reason
      )
      SELECT ${job.id}, item."itemKey", item."sortOrder", item.feedback, item.reason
        FROM input_items AS item
        CROSS JOIN valid_job
      ON CONFLICT (generation_id, item_key) DO UPDATE SET
        sort_order = EXCLUDED.sort_order,
        feedback = EXCLUDED.feedback,
        reason = EXCLUDED.reason
      RETURNING item_key
    ), completed AS (
      UPDATE post_writing_feedback_generations
         SET status = 'ready',
             completed_at = now(),
             last_error = NULL
       WHERE id IN (SELECT id FROM valid_job)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM completed) AS completed
  `;
  return Boolean((rows as { completed: boolean }[])[0]?.completed);
}

function failureCode(error: unknown): PostWritingFeedbackFailureCode {
  if (error instanceof HermesOAuthInvocationError) return error.reason;
  if (error instanceof SyntaxError || error instanceof TypeError) return "model_output_invalid";
  return "model_unavailable";
}

async function failGeneration(
  job: ClaimedGenerationRow,
  error: unknown,
): Promise<boolean | undefined> {
  const code = failureCode(error);
  const { retry, delaySeconds } = postWritingFeedbackRetryDecision(code, job.attempts);
  const rows = await sql`
    UPDATE post_writing_feedback_generations
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
): Promise<"ready" | "retrying" | "failed" | "superseded"> {
  if (
    postWritingFeedbackSourceHash(job.source_title, job.source_body_markdown) !== job.source_hash ||
    job.prompt_version !== POST_WRITING_FEEDBACK_PROMPT_VERSION
  ) {
    await supersedeGeneration(job);
    return "superseded";
  }

  try {
    const prompt = buildPostWritingFeedbackPrompt({
      locale: job.locale,
      title: job.source_title,
      bodyMarkdown: job.source_body_markdown,
    });
    const raw = await generateWithHermesOAuth(prompt, hermesInvocation);
    const generated = parseGeneratedPostWritingFeedback({
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
    if (retry === undefined) return "superseded";
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
