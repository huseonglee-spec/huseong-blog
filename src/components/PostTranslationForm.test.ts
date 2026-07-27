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
    expect(componentSource).toContain("POST_TRANSLATION_LOCALES.map");
    expect(componentSource).toContain('method: "POST"');
    expect(componentSource).toContain("/translations/");
    expect(componentSource).toContain("언어판 발행");
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
