import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("./PostTranslationForm.astro", import.meta.url);
const focusUrl = new URL("./FocusBlogConcept.astro", import.meta.url);

describe("관리자 새 언어판 초안 화면", () => {
  it("발행되지 않은 언어 하나를 골라 OAuth 초안을 만들거나 직접 작성한다", async () => {
    const [componentSource, focusSource] = await Promise.all([
      readFile(componentUrl, "utf8"),
      readFile(focusUrl, "utf8"),
    ]);

    expect(focusSource).toContain("PostTranslationForm");
    expect(focusSource).toContain("hasMissingTranslationLocale");
    expect(focusSource).toContain("publishedLocales={availableTranslationLocalesByPost[post.id] ?? []}");
    expect(componentSource).toContain("availableLocales");
    expect(componentSource).toContain("POST_TRANSLATION_LOCALES.filter");
    expect(componentSource).toContain('name="locale"');
    expect(componentSource).toContain('name="title"');
    expect(componentSource).toContain('name="bodyMarkdown"');
    expect(componentSource).toContain("번역 초안 생성");
    expect(componentSource).toContain("data-manual-translation");
    expect(componentSource).toContain("처음부터 직접 작성");
    expect(componentSource).toContain("언어판 발행");
  });

  it("pending·processing·ready·failed·superseded 상태와 재시도·polling을 한 화면에 보여 준다", async () => {
    const source = await readFile(componentUrl, "utf8");

    for (const status of ["pending", "processing", "ready", "failed", "superseded", "published"]) {
      expect(source).toContain(`${status}:`);
    }
    expect(source).toContain("setTimeout(() => void loadDraft(generation), 1_500)");
    expect(source).toContain("번역 초안 다시 생성");
    expect(source).toContain('headers: {\n            Accept: "application/json",\n            "x-csrf-token": csrf.value');
    expect(source).toContain('credentials: "same-origin"');
    expect(source).toContain("draftGenerationId");
    expect(source).toContain("draftSourceHash");
    expect(source).toContain("draftPromptVersion");
    expect(source).toContain("staleGeneratedDraft");
    expect(source).toContain("이전 생성 초안을 버렸습니다");
  });

  it("polling·pending·processing 중 편집을 잠그고 terminal state 뒤 다시 연다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain("let draftRequestsInFlight = 0");
    expect(source).toContain("draftRequestsInFlight += 1");
    expect(source).toContain("draftRequestsInFlight = Math.max(0, draftRequestsInFlight - 1)");
    expect(source).toContain(
      "const editorLocked = requestInFlight || draftRequestsInFlight > 0 || generating || published",
    );
    expect(source).toContain("title.readOnly = editorLocked");
    expect(source).toContain("body.readOnly = editorLocked");
    expect(source).toContain("generationId.value !== draft.generationId");
    expect(source).toMatch(/const payload = new FormData\(form\);\s+requestInFlight = true;/);
    expect(source).toContain("body: payload");
  });

  it("번역 입력 옆의 한국어 원문과 reader에 섞이지 않는 절충 메모를 보여 준다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain('class="translation-source"');
    expect(source).toContain('lang="ko"');
    expect(source).toContain("post.data.title");
    expect(source).toContain("set:html={sourceHtml}");
    expect(source).toContain("의미·문체 절충 메모");
    expect(source).toContain("발행되는 제목과 본문에는 포함되지 않습니다.");
    expect(source).toMatch(/\.translation-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\) minmax\(0,1fr\)/s);
    expect(source).toMatch(/@media \(max-width:780px\)[\s\S]*grid-template-columns:1fr/);
    expect(source).toContain("min-width:0");
    expect(source).toContain("overflow-wrap:anywhere");
    expect(source).toContain("min-height:44px");
  });

  it("취소 후 같은 편집 상태로 다시 열고 keyboard 발행을 지원한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain("data-cancel-translation");
    expect(source).toContain("form.hidden = true");
    expect(source).toContain("form.hidden = false");
    expect(source).toContain("form.requestSubmit()");
    expect(source).toContain('event.key === "Enter"');
    expect(source).not.toContain("clearEditor();\n      pollGeneration += 1;\n      form.hidden = true");
  });
});