import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const companionUrl = new URL("./PostStudyCompanion.astro", import.meta.url);
const translationEditorUrl = new URL("./EditPostTranslationForm.astro", import.meta.url);
const focusUrl = new URL("./FocusBlogConcept.astro", import.meta.url);
const permalinkUrl = new URL("../pages/posts/[slug].astro", import.meta.url);

describe("관리자 언어 학습 패널", () => {
  it("로그인한 외국어 읽기 화면 옆에 현재 글의 단어와 표현을 자동으로 붙인다", async () => {
    const [companion, focus, permalink] = await Promise.all([
      readFile(companionUrl, "utf8"),
      readFile(focusUrl, "utf8"),
      readFile(permalinkUrl, "utf8"),
    ]);

    expect(focus).toContain("PostStudyCompanion");
    expect(focus).toContain("studyPanel");
    expect(companion).toContain('data-post-study-companion');
    expect(companion).toContain("단어와 표현");
    expect(companion).toContain("item.meaningKo");
    expect(companion).toContain("item.noteKo");
    expect(companion).toContain("item.reading");
    expect(permalink).toContain("getPostStudyPanel");
    expect(permalink).toContain("session && activeTranslationLocale");
  });

  it("각 항목 닫기는 서버에 영구 숨김을 저장하고 DOM에서도 바로 치운다", async () => {
    const companion = await readFile(companionUrl, "utf8");

    expect(companion).toContain("data-dismiss-study-item");
    expect(companion).toContain("/study/dismiss/");
    expect(companion).toContain("itemKey");
    expect(companion).toContain("card.remove()");
    expect(companion).toContain("배운 항목 숨기기");
  });

  it("번역 수정과 수동 다시 생성을 제공하고 생성 중 상태를 보여준다", async () => {
    const [companion, editor, focus] = await Promise.all([
      readFile(companionUrl, "utf8"),
      readFile(translationEditorUrl, "utf8"),
      readFile(focusUrl, "utf8"),
    ]);

    expect(focus).toContain("EditPostTranslationForm");
    expect(focus).toContain("언어판 수정");
    expect(editor).toContain('method: "PATCH"');
    expect(companion).toContain("다시 생성");
    expect(companion).toContain("/study/generate/");
    expect(companion).toContain("생성 중");
  });

  it("언어를 바꿔도 본문 위치를 유지하고 좁은 화면은 다시 열 수 있는 하단 패널을 쓴다", async () => {
    const [companion, focus] = await Promise.all([
      readFile(companionUrl, "utf8"),
      readFile(focusUrl, "utf8"),
    ]);

    expect(companion).toMatch(/\.post-study-companion\s*\{[^}]*position:\s*fixed/s);
    expect(companion).toContain('role="complementary"');
    expect(companion).not.toContain('aria-modal="true"');
    expect(companion).toContain("data-open-study-panel");
    expect(companion).toContain("data-close-study-panel");
    expect(focus).toContain("--study-panel");
    expect(focus).toContain('.focus-blog[data-variation="focus-index"] .focus-reader { margin:0; }');
    expect(focus).not.toContain('[data-study-panel="true"] .focus-reader');
    expect(focus).not.toContain('[data-study-panel="true"] .focus-post');
    expect(companion).toMatch(/@media \(max-width:1280px\)/);
  });

  it("필요한 두 새 컴포넌트가 실제 파일로 존재한다", async () => {
    await expect(access(companionUrl)).resolves.toBeUndefined();
    await expect(access(translationEditorUrl)).resolves.toBeUndefined();
  });
});
