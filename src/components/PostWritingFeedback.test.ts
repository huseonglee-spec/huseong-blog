import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("./PostWritingFeedback.astro", import.meta.url);
const editPostUrl = new URL("./EditPostForm.astro", import.meta.url);
const editTranslationUrl = new URL("./EditPostTranslationForm.astro", import.meta.url);

describe("04 양면 검토실 production UI", () => {
  it("원문과 모든 언어판 수정 폼에 같은 피드백 컴포넌트를 연결한다", async () => {
    const [component, editPost, editTranslation] = await Promise.all([
      readFile(componentUrl, "utf8"),
      readFile(editPostUrl, "utf8"),
      readFile(editTranslationUrl, "utf8"),
    ]);

    expect(editPost).toContain('import PostWritingFeedback from "./PostWritingFeedback.astro"');
    expect(editPost).toContain('<PostWritingFeedback slug={post.id} locale="ko"');
    expect(editTranslation).toContain('import PostWritingFeedback from "./PostWritingFeedback.astro"');
    expect(editTranslation).toContain("<PostWritingFeedback slug={post.id} locale={locale}");
    expect(component).toContain("data-post-writing-feedback");
    expect(component).toContain("data-writing-feedback-panel");
    expect(component).toContain("data-writing-feedback-request");
    expect(component).toContain("data-writing-feedback-dismiss");
    expect(component).toContain("data-writing-feedback-rerun");
    expect(component).toContain("AI 피드백");
    expect(component).toContain("피드백");
    expect(component).toContain("이유");
    expect(component).not.toMatch(/자동 적용|원클릭 적용|AI가 수정|점수|총평/u);
  });

  it("명시적 클릭 때 현재 제목·본문만 보내고 편집 후에는 이전 초안 기준으로 표시한다", async () => {
    const component = await readFile(componentUrl, "utf8");

    expect(component).toContain('form.querySelector<HTMLInputElement>("[name=title]")');
    expect(component).toContain('form.querySelector<HTMLTextAreaElement>("[name=bodyMarkdown]")');
    expect(component).toContain('requestButton.addEventListener("click"');
    expect(component).toContain('rerunButton?.addEventListener("click", () => requestFeedback(true))');
    expect(component).toContain('data.set("force", String(force))');
    expect(component).toContain('titleInput.addEventListener("input"');
    expect(component).toContain('bodyInput.addEventListener("input"');
    expect(component).toContain('[data-cancel-edit], [data-cancel-translation-edit]');
    expect(component).toContain('[data-edit-post], [data-edit-translation], [data-post-index-button]');
    expect(component).toContain("이전 초안 기준");
    expect(component).toContain("/api/posts/${encodeURIComponent(slug)}/writing-feedback/");
    expect(component).not.toContain('addEventListener("input", requestFeedback');
  });

  it("데스크톱은 고정 오른쪽 검토면, 모바일은 하단 시트로 전환한다", async () => {
    const component = await readFile(componentUrl, "utf8");

    expect(component).toContain("position:fixed");
    expect(component).toContain("width:400px");
    expect(component).toContain('data-variation="focus-index"');
    expect(component).toContain('.focus-blog[data-focus-blog]');
    expect(component).toContain('.focus-reader[data-focus-reader]');
    expect(component).toContain('.focus-post[data-focus-post]');
    expect(component).toContain('@media (max-width: 1199px)');
    expect(component).toContain("inset:auto 8px 8px");
    expect(component).toContain("max-height:min(74svh,760px)");
    expect(component).toContain('root.dataset.writingFeedbackOpen = String(open)');
    expect(component).toContain('root.dataset.archiveOpen = "false"');
  });
});
