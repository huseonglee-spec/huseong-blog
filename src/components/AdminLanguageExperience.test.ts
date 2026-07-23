import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const indexUrl = new URL("../pages/index.astro", import.meta.url);
const permalinkUrl = new URL("../pages/posts/[slug].astro", import.meta.url);
const actionsUrl = new URL("./HomeActions.astro", import.meta.url);
const feedUrl = new URL("./BlogFeed.astro", import.meta.url);
const companionUrl = new URL("./TranslationCompanion.astro", import.meta.url);

describe("관리자 다국어 블로그 경험", () => {
  it("별도 번역 페이지가 아니라 기존 피드와 글 상세에서 전역 언어를 선택한다", async () => {
    const [indexSource, permalinkSource, actionsSource] = await Promise.all([
      readFile(indexUrl, "utf8"),
      readFile(permalinkUrl, "utf8"),
      readFile(actionsUrl, "utf8"),
    ]);

    expect(indexSource).toContain('requestedLanguage === "en" && session');
    expect(indexSource).toContain("translatePostsForAdmin");
    expect(permalinkSource).toContain('requestedLanguage === "en" && session');
    expect(actionsSource).toContain('aria-label="블로그 언어"');
    expect(actionsSource).toContain("🇰🇷");
    expect(actionsSource).toContain("🇺🇸");
    expect(actionsSource).toContain("🇯🇵");
    expect(actionsSource).toContain("🇨🇳");
    expect(actionsSource).toContain("한국어");
    expect(actionsSource).toContain("English");
    expect(actionsSource).toContain("日本語");
    expect(actionsSource).toContain("简体中文");
    expect(actionsSource).toMatch(/\.language-switch[^}]*font-size:\s*1rem/s);
    expect(actionsSource).not.toContain("translation-lab");
  });

  it("영어 모드에서 기존 블로그 오른쪽 열에 표현 패널을 붙인다", async () => {
    const [feedSource, companionSource] = await Promise.all([
      readFile(feedUrl, "utf8"),
      readFile(companionUrl, "utf8"),
    ]);

    expect(feedSource).toContain("TranslationCompanion");
    expect(feedSource).toContain("translationLanguage");
    expect(feedSource).toContain("data-edit-translation");
    expect(companionSource).toContain("data-translation-companion");
    expect(companionSource).toContain("data-companion-close");
    expect(companionSource).toMatch(/data-translation-companion\s+hidden/);
    expect(companionSource).toContain("data-expression-post");
    expect(companionSource).toMatch(/grid-column:\s*3/);
    expect(companionSource).toMatch(/position:\s*sticky/);
  });

  it("영어 글의 Edit 버튼을 눌렀을 때만 같은 글의 표현 패널을 연다", async () => {
    const companionSource = await readFile(companionUrl, "utf8");

    expect(companionSource).toContain("data-edit-translation");
    expect(companionSource).toContain("showExpressions");
    expect(companionSource).toContain("companion.hidden = false");
  });

  it("좁은 화면에서는 표현 패널을 현재 글 아래에 붙이는 진입점을 제공한다", async () => {
    const companionSource = await readFile(companionUrl, "utf8");

    expect(companionSource).toMatch(/@media \(max-width: 1080px\)/);
    expect(companionSource).toMatch(/\.translation-companion\s*\{[^}]*grid-column:\s*1;/s);
    expect(companionSource).not.toContain("data-mobile-expression-toggle");
  });
});
