import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("./WritingFeedbackDemo.astro", import.meta.url);
const indexPageUrl = new URL("../pages/feedback-lab.astro", import.meta.url);
const conceptPageUrl = new URL("../pages/feedback-lab/[concept].astro", import.meta.url);

const variations = [
  "quiet-footer",
  "sticky-toolbar",
  "margin-tab",
  "review-workspace",
  "draft-memory",
] as const;

const variationNames = [
  "조용한 동료",
  "상단 검토 바",
  "여백 탭",
  "양면 검토실",
  "초안 기억",
] as const;

describe("글쓰기 AI 피드백 UI/UX 데모", () => {
  it("비교 인덱스와 다섯 개의 실제 편집 화면 시안을 제공한다", async () => {
    const [indexPage, conceptPage] = await Promise.all([
      readFile(indexPageUrl, "utf8"),
      readFile(conceptPageUrl, "utf8"),
    ]);

    for (const variation of variations) {
      expect(indexPage).toContain(variation);
      expect(conceptPage).toContain(variation);
    }
    for (const name of variationNames) expect(indexPage).toContain(name);
    expect(conceptPage).toContain("WritingFeedbackDemo");
    expect(conceptPage).toContain('robots="noindex, nofollow"');
  });

  it("실제 수정 흐름처럼 제목과 본문을 편집하고 저장과 별개로 피드백을 실행한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain('data-feedback-demo');
    expect(source).toContain('name="title"');
    expect(source).toContain('name="bodyMarkdown"');
    expect(source).toContain('data-feedback-trigger');
    expect(source).toContain("AI 피드백");
    expect(source).toContain("저장");
    expect(source).toContain("삶의 방향성");
    expect(source).not.toContain("fetch(");
  });

  it("실제 블로그의 카테고리·글 탐색·관리자·언어판 UI 안에서 편집 화면을 보여준다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain("data-demo-category-rail");
    expect(source).toContain('aria-label="카테고리별 글"');
    expect(source).toContain("전체 글 보기");
    expect(source).toContain("생각");
    expect(source).toContain("책");
    expect(source).toContain("하루");
    expect(source).toContain("정신 응급처치");
    expect(source).toContain("data-category-toggle");
    expect(source).toContain("data-category-posts");
    expect(source).toContain("새 글 쓰기");
    expect(source).toContain("로그아웃");
    expect(source).toContain('aria-label="이 글의 언어판"');
    expect(source).toContain("English");
    expect(source).toContain("日本語");
    expect(source).toContain("简体中文");
    expect(source).toContain("--category-rail:300px");
  });

  it("모바일에서 닫힌 카테고리 레일을 포커스 불가로 만들고 브레이크포인트 변경 때 상태를 재조정한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source.includes('categoryRail.toggleAttribute("inert", !open && mobileViewport.matches);')).toBe(true);
    expect(source.includes('mobileViewport.addEventListener("change", () => setCategoryOpen(false));')).toBe(true);
  });

  it("실행 뒤 로딩과 문제·이유 두 요소의 결과 목록을 보여주고 항목을 삭제한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain('data-feedback-loading');
    expect(source).toContain('data-feedback-panel');
    expect(source).toContain('data-feedback-list');
    expect(source).toContain('data-feedback-card');
    expect(source).toContain('data-feedback-message');
    expect(source).toContain('data-feedback-reason');
    expect(source).toContain('data-dismiss-feedback');
    expect(source).toContain("card.remove()");
    expect(source).toContain("피드백을 찾는 중");
  });

  it("재실행과 이전 초안 상태를 직접 체험할 수 있다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain('data-feedback-rerun');
    expect(source).toContain('data-mark-draft-stale');
    expect(source).toContain('data-stale-notice');
    expect(source).toContain("이전 초안 기준");
    expect(source).toContain('root.dataset.feedbackState = "ready"');
  });

  it("idle 초기화에서는 빈 피드백 수를 유지하고 ready 초기화에서만 카드를 센다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain('data-feedback-state={initialReady ? "ready" : "idle"}');
    expect(source).toContain('data-feedback-count>{initialReady ? "3" : ""}');
    expect(source).toMatch(/if\s*\(root\.dataset\.feedbackState\s*===\s*"ready"\)\s*updateCount\(\);/);
  });

  it("이전·현재 초안 선택은 aria-current를 한 곳에만 두고 구조화된 히스토리 라벨을 보존한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source.includes("data-draft-current")).toBe(true);
    expect(source.includes("data-draft-previous")).toBe(true);
    expect(source.includes("data-draft-state-label")).toBe(true);
    expect(source.includes('selectedDraft?.setAttribute("aria-current", "true");')).toBe(true);
    expect(source.includes('unselectedDraft?.removeAttribute("aria-current");')).toBe(true);
    expect(source.includes("staleButtons.forEach((item) => { item.textContent")).toBe(false);
  });

  it("피드백 로딩 중에는 이전 초안 상태 컨트롤을 비활성화한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source.includes("staleButtons.forEach((button) => { button.disabled = loading; });")).toBe(true);
  });

  it("초안 히스토리 행은 현재와 이전을 직접 선택하고 로딩 중 함께 잠긴다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).not.toContain("data-draft-previous data-mark-draft-stale");
    expect(source).toContain('currentDraft?.addEventListener("click", () => selectDraft(false));');
    expect(source).toContain('previousDraft?.addEventListener("click", () => selectDraft(true));');
    expect(source).toMatch(/\[currentDraft,\s*previousDraft\]\.forEach\(\(button\)\s*=>\s*\{\s*if\s*\(button\)\s*button\.disabled\s*=\s*loading;/);
  });

  it("초안 기억 안은 데스크톱에서 닫힌 피드백 패널을 직접 다시 여는 컨트롤을 보여준다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source.includes('.feedback-demo[data-variation="draft-memory"][data-panel-open="false"] > .feedback-panel-toggle { display:flex; }')).toBe(true);
  });

  it("다섯 안이 서로 다른 레이아웃을 가지며 좁은 화면에서도 결과를 열고 닫을 수 있다", async () => {
    const source = await readFile(componentUrl, "utf8");

    for (const variation of variations) {
      expect(source).toContain(`[data-variation="${variation}"]`);
    }
    expect(source).toContain('data-feedback-panel-toggle');
    expect(source).toContain('data-category-rail-toggle');
    expect(source).toContain('aria-expanded="false"');
    expect(source).toContain('const initiallyOpen = root.dataset.panelOpen === "true" && !mobileViewport.matches;');
    expect(source).toContain('if (open && mobileViewport.matches) setPanelOpen(false);');
    expect(source).toMatch(/@media\s*\(max-width:\s*820px\)/);
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('[data-variation="margin-tab"] > .feedback-panel-toggle');
  });

  it("데모 파일이 실제로 존재한다", async () => {
    await Promise.all([
      expect(access(componentUrl)).resolves.toBeUndefined(),
      expect(access(indexPageUrl)).resolves.toBeUndefined(),
      expect(access(conceptPageUrl)).resolves.toBeUndefined(),
    ]);
  });
});
