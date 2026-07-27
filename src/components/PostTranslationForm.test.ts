import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("./PostTranslationForm.astro", import.meta.url);
const focusUrl = new URL("./FocusBlogConcept.astro", import.meta.url);

describe("관리자 새 언어판 발행 화면", () => {
  it("기존 글에서 언어·제목·Markdown 본문만 입력해 바로 발행한다", async () => {
    const [componentSource, focusSource] = await Promise.all([
      readFile(componentUrl, "utf8"),
      readFile(focusUrl, "utf8"),
    ]);

    expect(focusSource).toContain("PostTranslationForm");
    expect(focusSource).toContain("data-add-translation");
    expect(componentSource).toContain('name="locale"');
    expect(componentSource).toContain('name="title"');
    expect(componentSource).toContain('name="bodyMarkdown"');
    expect(componentSource).toContain('method="post"');
    expect(componentSource).toContain("POST_TRANSLATION_LOCALES.map");
    expect(componentSource).toContain('method: "POST"');
    expect(componentSource).toContain("/translations/");
    expect(componentSource).toContain("언어판 발행");
  });

  it("번역 입력 옆에서 한국어 원문의 제목과 본문을 함께 보여준다", async () => {
    const [componentSource, focusSource] = await Promise.all([
      readFile(componentUrl, "utf8"),
      readFile(focusUrl, "utf8"),
    ]);

    expect(componentSource).toContain('import { renderPostMarkdown } from "../lib/markdown"');
    expect(componentSource).toContain('class="translation-source"');
    expect(componentSource).toContain('lang="ko"');
    expect(componentSource).toContain("한국어 원문");
    expect(componentSource).toContain("post.data.title");
    expect(componentSource).toContain("set:html={sourceHtml}");
    expect(componentSource).toMatch(/\.translation-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\) minmax\(0,1fr\)/s);
    expect(componentSource).toMatch(/@media \(max-width:780px\)[\s\S]*grid-template-columns:1fr/);
    expect(focusSource).toContain('.focus-viewport:has(.post-translation-form:not([hidden]))');
    expect(focusSource).toContain('.focus-post:has(> .post-translation-form:not([hidden]))');
    expect(focusSource).toContain("width:min(1000px,100%)");
  });

  it("초안·AI 번역·표현 추천·미리보기 같은 부가 흐름을 넣지 않는다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).not.toContain("초안");
    expect(source).not.toContain("AI");
    expect(source).not.toContain("표현 추천");
    expect(source).not.toContain("미리보기");
    expect(source).not.toContain("문단 짝맞춤");
  });
});
