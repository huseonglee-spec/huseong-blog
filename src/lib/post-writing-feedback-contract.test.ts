import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../scripts/migrate.ts", import.meta.url);
const routeUrl = new URL("../pages/api/posts/[slug]/writing-feedback.ts", import.meta.url);
const workerUrl = new URL("../../scripts/post-writing-feedback-worker.ts", import.meta.url);
const serviceUrl = new URL("../../ops/systemd/huseong-blog-feedback-worker.service", import.meta.url);
const timerUrl = new URL("../../ops/systemd/huseong-blog-feedback-worker.timer", import.meta.url);
const packageUrl = new URL("../../package.json", import.meta.url);
const queueUrl = new URL("./server/post-writing-feedback-queue.ts", import.meta.url);

describe("글쓰기 피드백 운영 계약", () => {
  it("생성 snapshot과 피드백 항목을 공개 글과 분리된 additive schema로 저장한다", async () => {
    const source = await readFile(migrationUrl, "utf8");

    expect(source).toContain("CREATE TABLE IF NOT EXISTS post_writing_feedback_generations");
    expect(source).toContain("source_body_markdown text NOT NULL");
    expect(source).toContain("status IN ('pending', 'processing', 'ready', 'failed', 'superseded')");
    expect(source).toContain("post_writing_feedback_generations_active_unique");
    expect(source).toContain("WHERE status IN ('pending', 'processing', 'ready')");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS post_writing_feedback_items");
    expect(source).toContain("feedback text NOT NULL");
    expect(source).toContain("reason text NOT NULL");
    expect(source).toContain("dismissed_at timestamptz");
    expect(source).not.toContain("DROP TABLE post_writing_feedback");
  });

  it("관리자·동일 출처·CSRF·bounded body 경계 안에서만 요청·조회·숨김을 제공한다", async () => {
    const [source, queue] = await Promise.all([
      readFile(routeUrl, "utf8"),
      readFile(queueUrl, "utf8"),
    ]);

    expect(source).toContain("if (!session)");
    expect(source).toContain("sameOriginRequest");
    expect(source).toContain("validCsrfToken");
    expect(source).toContain("readBoundedFormData");
    expect(source).toContain("parsePostWritingFeedbackSource");
    expect(source).toContain("requestPostWritingFeedback");
    expect(source).toContain("getPostWritingFeedback");
    expect(source).toContain("dismissPostWritingFeedbackItem");
    expect(source).toContain("export const GET");
    expect(source).toContain("export const POST");
    expect(source).toContain("export const PATCH");
    expect(source).toContain('"Cache-Control": "no-store"');
    expect(source).toContain('form.get("force") === "true"');
    expect(queue).toContain("forceRegenerate");
    expect(queue).toContain("${input.forceRegenerate ?? false}");
  });

  it("clean checkout의 OAuth 전용 worker가 큐를 claim하고 결과를 atomic 저장한다", async () => {
    const [worker, service, timer, packageSource] = await Promise.all([
      readFile(workerUrl, "utf8"),
      readFile(serviceUrl, "utf8"),
      readFile(timerUrl, "utf8"),
      readFile(packageUrl, "utf8"),
    ]);

    expect(packageSource).toContain('"feedback:worker": "tsx scripts/post-writing-feedback-worker.ts"');
    expect(worker).toContain("assertCleanCheckout");
    expect(worker).toContain("FOR UPDATE SKIP LOCKED");
    expect(worker).toContain("generateWithHermesOAuth");
    expect(worker).toContain("buildPostWritingFeedbackPrompt");
    expect(worker).toContain("parseGeneratedPostWritingFeedback");
    expect(worker).toContain("postWritingFeedbackItemKey");
    expect(worker).toContain("INSERT INTO post_writing_feedback_items");
    expect(worker).toContain("status = 'ready'");
    expect(worker.match(/attempts = \$\{job\.attempts\}/gu)).toHaveLength(3);
    expect(worker).toContain("RETURNING status");
    expect(worker).toContain("if (!row) return undefined");
    expect(service).toContain("HUSEONG_BLOG_FEEDBACK_HERMES_PROVIDER=openai-codex");
    expect(service).toContain("pnpm.cjs feedback:worker");
    expect(service).toContain("TimeoutStartSec=15min");
    expect(service).toContain("WorkingDirectory=/home/huseong/Workspace/huseong-blog");
    expect(service).toContain("ReadWritePaths=/home/huseong/.hermes/profiles/linux-coder");
    expect(timer).toContain("OnUnitInactiveSec=10s");
  });
});
