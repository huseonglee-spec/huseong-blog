import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../scripts/migrate.ts", import.meta.url);
const translationRouteUrl = new URL("../pages/api/posts/[slug]/translations.ts", import.meta.url);
const generateRouteUrl = new URL("../pages/api/posts/[slug]/study/generate.ts", import.meta.url);
const dismissRouteUrl = new URL("../pages/api/posts/[slug]/study/dismiss.ts", import.meta.url);
const workerUrl = new URL("../../scripts/post-study-worker.ts", import.meta.url);
const middlewareUrl = new URL("../lib/server/auth-core.ts", import.meta.url);
const postStudyServerUrl = new URL("../lib/server/post-study.ts", import.meta.url);

describe("언어판 학습 데이터 계약", () => {
  it("생성 결과와 영구 숨김 이력을 언어판 아래에 따로 저장한다", async () => {
    const source = await readFile(migrationUrl, "utf8");

    expect(source).toContain("CREATE TABLE IF NOT EXISTS post_study_generations");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS post_study_items");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS post_study_dismissals");
    expect(source).toContain("FOREIGN KEY (post_slug, locale)");
    expect(source).toContain("REFERENCES post_translations(post_slug, locale) ON DELETE CASCADE");
    expect(source).toContain("PRIMARY KEY (locale, item_key)");
    expect(source).toContain("DROP COLUMN post_slug");
    expect(source).toContain("WHERE status IN ('pending', 'processing')");
  });

  it("언어판 발행과 수정 뒤 새 원문 해시로 생성을 예약한다", async () => {
    const source = await readFile(translationRouteUrl, "utf8");

    expect(source).toContain("export const POST");
    expect(source).toContain("export const PATCH");
    expect(source).toContain("updatePostTranslation");
    expect(source).toContain("postStudySourceHash");
    expect(source).toContain("requestPostStudyGeneration");
  });

  it("숨긴 항목은 같은 언어의 다른 글에서도 전역으로 제외한다", async () => {
    const [serverSource, workerSource] = await Promise.all([
      readFile(postStudyServerUrl, "utf8"),
      readFile(workerUrl, "utf8"),
    ]);

    expect(serverSource).toContain("ON CONFLICT (locale, item_key) DO NOTHING");
    expect(serverSource).not.toContain("d.post_slug");
    expect(workerSource).toContain("WHERE locale = ${locale}");
  });

  it("다시 생성과 항목 숨김 API도 로그인·동일 출처·CSRF를 모두 검사한다", async () => {
    const [generateSource, dismissSource, authSource] = await Promise.all([
      readFile(generateRouteUrl, "utf8"),
      readFile(dismissRouteUrl, "utf8"),
      readFile(middlewareUrl, "utf8"),
    ]);

    for (const source of [generateSource, dismissSource]) {
      expect(source).toContain("if (!session)");
      expect(source).toContain("isAllowedOrigin");
      expect(source).toContain("validCsrfToken");
    }
    expect(generateSource).toContain("requestPostStudyGeneration");
    expect(dismissSource).toContain("dismissPostStudyItem");
    expect(authSource).toContain("\\/study\\/(?:generate|dismiss)");
  });

  it("항상 켜진 로컬 worker가 API key 없이 Hermes OAuth 프로필로 처리한다", async () => {
    const source = await readFile(workerUrl, "utf8");

    expect(source).toContain('"--profile"');
    expect(source).toContain('"macmini"');
    expect(source).toContain('"--source"');
    expect(source).toContain('"tool"');
    expect(source).toContain('"-t"');
    expect(source).toContain('"safe"');
    expect(source).toContain('"-m"');
    expect(source).toContain('"gpt-5.6-sol"');
    expect(source).not.toContain("OPENAI_API_KEY");
    expect(source).not.toContain("api.openai.com");
    expect(source).toContain("recoverStaleProcessingGenerations");
    expect(source).toContain("interval '20 minutes'");
  });
});
