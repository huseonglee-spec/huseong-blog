import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../scripts/migrate.ts", import.meta.url);
const workerUrl = new URL("../../scripts/post-translation-worker.ts", import.meta.url);
const draftRouteUrl = new URL("../pages/api/posts/[slug]/translation-draft.ts", import.meta.url);
const publishRouteUrl = new URL("../pages/api/posts/[slug]/translations.ts", import.meta.url);
const publisherUrl = new URL("../lib/server/publish-post-translation.ts", import.meta.url);
const queueUrl = new URL("../lib/server/post-translation-draft-queue.ts", import.meta.url);
const helperUrl = new URL("../lib/server/hermes-oauth.ts", import.meta.url);
const authUrl = new URL("../lib/server/auth-core.ts", import.meta.url);
const contentUrl = new URL("../lib/content.ts", import.meta.url);
const sitemapUrl = new URL("../pages/sitemap.xml.ts", import.meta.url);
const serviceUrl = new URL("../../ops/systemd/huseong-blog-translation-worker.service", import.meta.url);

async function sources(...urls: URL[]): Promise<string[]> {
  return Promise.all(urls.map((url) => readFile(url, "utf8")));
}

describe("번역 초안 end-to-end 계약", () => {
  it("draft와 notes를 공개 post_translations 밖의 additive lifecycle에 저장한다", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS post_translation_generations");
    expect(migration).toContain("REFERENCES posts(slug) ON DELETE CASCADE");
    expect(migration).toContain("locale IN ('en', 'ja', 'zh-CN')");
    expect(migration).toContain("model_locale IN ('en', 'ja', 'zh-Hans')");
    expect(migration).toContain("source_title text NOT NULL");
    expect(migration).toContain("source_body_markdown text NOT NULL");
    expect(migration).toContain("source_hash text NOT NULL");
    expect(migration).toContain("prompt_version integer NOT NULL");
    expect(migration).toContain("status IN ('pending', 'processing', 'ready', 'failed', 'superseded')");
    expect(migration).toContain("tradeoffs jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(migration).toContain("WHERE status IN ('pending', 'processing', 'ready')");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS post_translation_generations_current_unique");
  });

  it("generation GET/POST는 admin·same-origin·CSRF·bounded body·no-store를 모두 요구한다", async () => {
    const [route, auth] = await sources(draftRouteUrl, authUrl);

    expect(route).toContain("if (!session)");
    expect(route).toContain("sameOriginRequest");
    expect(route).toContain("isAllowedOrigin");
    expect(route).toContain('headers.get("x-csrf-token")');
    expect(route).toContain("validCsrfToken");
    expect(route).toContain("readBoundedFormData(context.request, 16_384)");
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).toContain("export const GET");
    expect(route).toContain("export const POST");
    expect(auth).toContain("\\/translation-draft");
  });

  it("queue는 원문 row lock과 partial unique index로 동시 요청을 한 generation에 수렴시킨다", async () => {
    const source = await readFile(queueUrl, "utf8");

    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("sql.transaction");
    expect(source).toContain("postTranslationDraftEnqueueQueries");
    expect(source).toContain("status IN ('pending', 'processing', 'ready')");
    expect(source).toContain("ON CONFLICT DO NOTHING");
    expect(source).toContain("source_hash <> ${input.sourceHash}");
    expect(source).toContain("prompt_version <> ${POST_TRANSLATION_PROMPT_VERSION}");
    expect(source).toContain('return { status: "published" }');
  });

  it("생성 초안 발행은 generation/source/prompt를 transaction 안에서 검증하고 notes를 발행하지 않는다", async () => {
    const [route, publisher] = await sources(publishRouteUrl, publisherUrl);

    expect(route).toContain("parseDraftPublication");
    expect(route).toContain("draftGenerationId");
    expect(route).toContain("draftSourceHash");
    expect(route).toContain("draftPromptVersion");
    expect(route).toContain('status === "stale"');
    expect(route).toContain("다시 생성");
    expect(publisher).toContain("FOR UPDATE");
    expect(publisher).toContain("generation.source_hash = ${draft?.sourceHash ?? null}");
    expect(publisher).toContain("generation.prompt_version = ${draft?.promptVersion ?? null}");
    expect(publisher).toContain("source.title = generation.source_title");
    expect(publisher).toContain("source.body_markdown = generation.source_body_markdown");
    expect(publisher).toContain("generation.status = 'ready'");
    expect(publisher).toContain("ON CONFLICT (post_slug, locale) DO NOTHING");
    expect(publisher).not.toContain("tradeoffs");
    expect(publisher).not.toContain("DO UPDATE");
  });

  it("Linux worker는 API key가 아닌 linux-coder OAuth model로 claim·retry·timeout·cleanup한다", async () => {
    const [worker, helper, service] = await sources(workerUrl, helperUrl, serviceUrl);

    expect(worker).toContain('"gpt-5.6-sol"');
    expect(worker).toContain('"linux-coder"');
    expect(worker).toContain("recoverStaleProcessingGenerations");
    expect(worker).toContain("FOR UPDATE SKIP LOCKED");
    expect(worker).toContain("interval '10 minutes'");
    expect(worker).toContain("POST_TRANSLATION_MAX_TRANSIENT_ATTEMPTS");
    expect(worker).toContain("postTranslationRetryDecision");
    expect(helper).toContain("model_timeout");
    expect(worker).toContain("completeGeneration");
    expect(worker).toContain("supersedeGeneration");
    expect(helper).toContain('key.toUpperCase() !== "OPENAI_API_KEY"');
    expect(helper).toContain('"--ignore-rules"');
    expect(helper).toContain('"--pass-session-id"');
    expect(helper).toContain("finally");
    expect(helper).toContain("deleteHermesSession");
    expect(service).toContain("Environment=HOME=/home/huseong");
    expect(service).toContain("HUSEONG_BLOG_TRANSLATION_HERMES_PROFILE=linux-coder");
    expect(service).toContain("HUSEONG_BLOG_TRANSLATION_HERMES_MODEL=gpt-5.6-sol");
  });

  it("draft와 tradeoffs는 공개 content·sitemap query에 직렬화하지 않는다", async () => {
    const [content, sitemap] = await sources(contentUrl, sitemapUrl);

    expect(content).not.toContain("post_translation_generations");
    expect(content).not.toContain("tradeoffs");
    expect(sitemap).not.toContain("post_translation_generations");
    expect(sitemap).not.toContain("tradeoffs");
  });
});
