import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../scripts/migrate.ts", import.meta.url);
const contentUrl = new URL("../lib/content.ts", import.meta.url);
const routeUrl = new URL("../pages/api/posts/[slug]/translations.ts", import.meta.url);

describe("새 언어판 발행 계약", () => {
  it("글과 언어 조합당 하나의 공개 언어판을 저장한다", async () => {
    const source = await readFile(migrationUrl, "utf8");
    const translationTable = source.match(
      /CREATE TABLE IF NOT EXISTS post_translations[\s\S]*?\n  \)\n/,
    )?.[0] ?? "";

    expect(translationTable).toContain("CREATE TABLE IF NOT EXISTS post_translations");
    expect(translationTable).toContain("REFERENCES posts(slug) ON DELETE CASCADE");
    expect(translationTable).toContain("PRIMARY KEY (post_slug, locale)");
    expect(translationTable).toContain("body_markdown text NOT NULL");
    expect(translationTable).not.toContain("draft");
  });

  it("번역 조회도 원문의 공개 범위를 그대로 지킨다", async () => {
    const source = await readFile(contentUrl, "utf8");

    expect(source).toContain("getPublishedPostTranslation");
    expect(source).toContain("post_translations");
    expect(source).toContain("visibility = 'public'");
  });

  it("로그인·동일 출처·CSRF 검사를 거쳐 언어판을 upsert한다", async () => {
    const source = await readFile(routeUrl, "utf8");

    expect(source).toContain("isAllowedOrigin");
    expect(source).toContain("validCsrfToken");
    expect(source).toContain("parsePostTranslationInput");
    expect(source).toContain("publishPostTranslation");
    expect(source).toContain("export const POST");
  });
});
