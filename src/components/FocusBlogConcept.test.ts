import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("./FocusBlogConcept.astro", import.meta.url);
const indexPageUrl = new URL("../pages/design-lab.astro", import.meta.url);
const conceptPageUrl = new URL("../pages/design-lab/[concept].astro", import.meta.url);
const homePageUrl = new URL("../pages/index.astro", import.meta.url);
const variations = ["focus", "focus-column", "focus-index", "focus-margin", "focus-night"];

describe("FocusBlogConcept", () => {
  it("조용한 집중 모드를 기준으로 한 다섯 변주를 독립 URL로 제공한다", async () => {
    const indexSource = await readFile(indexPageUrl, "utf8");
    const pageSource = await readFile(conceptPageUrl, "utf8");

    for (const variation of variations) {
      expect(indexSource).toContain(`id: "${variation}"`);
      expect(pageSource).toContain(`"${variation}"`);
    }
    expect(indexSource).toContain("조용한 집중 모드");
    expect(pageSource).toContain("FocusBlogConcept");
    expect(pageSource).toContain("getPublishedPosts");
    expect(pageSource).toContain('robots="noindex, nofollow"');
  });

  it("모든 변주가 이미지 카드 없이 글 전문을 문서 전체 스크롤로 보여준다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain("data-focus-blog");
    expect(source).toContain("data-document-scroll");
    expect(source).toContain('class="post-content post-body"');
    expect(source).not.toContain("concept-cover");
    expect(source).not.toContain("글 전체 읽기");
    expect(source).not.toContain("overflow-y: auto");
    expect(source).not.toContain('addEventListener("wheel"');
    expect(source).toMatch(/\.focus-copy\s*\{[^}]*overflow:\s*visible/s);
    expect(source).toMatch(/\.focus-post\[hidden\]\s*\{[^}]*display:\s*none/s);
    expect(source).toContain('const isActualPreview = variation === "focus-index"');
    expect(source).toContain("!isActualPreview &&");
  });

  it("카테고리와 글 인덱스를 유지하며 글을 한 편씩 탐색한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain("data-category-filter");
    expect(source).toContain("data-category-directory");
    expect(source).toContain("data-category-count");
    expect(source).toContain("data-post-index-button");
    expect(source).toContain("data-active-category");
    expect(source).toContain('aria-label="이전 글"');
    expect(source).toContain('aria-label="다음 글"');
    expect(source).toContain('event.key === "ArrowLeft"');
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain('addEventListener("touchstart"');
    expect(source).toContain('addEventListener("touchend"');
  });

  it("운영형 인덱스는 카테고리 안에 글을 넣은 아코디언으로 탐색한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain("data-category-accordion");
    expect(source).toContain("data-category-toggle");
    expect(source).toContain("data-accordion-posts");
    expect(source).toContain("data-mobile-archive-toggle");
    expect(source).toContain('class="sidebar-login" href="/admin/login/"');
    expect(source).toContain('class="actual-mobile-controls"');
    expect(source).toContain('aria-expanded="false"');
    expect(source).not.toContain("candidate === group && willExpand");
    expect(source).toContain('!isActualPreview && (\n        <footer class="reader-dock"');
  });

  it("다섯 변주와 모바일 레이아웃을 각각 정의한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    for (const variation of variations) {
      expect(source).toContain(`[data-variation="${variation}"]`);
    }
    expect(source).toContain("@media (max-width: 780px)");
    expect(source).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("공개 홈에서는 확정한 인덱스 집중 모드를 사용한다", async () => {
    const source = await readFile(homePageUrl, "utf8");

    expect(source).toContain('import FocusBlogConcept from "../components/FocusBlogConcept.astro"');
    expect(source).toContain('<FocusBlogConcept posts={posts} variation="focus-index" />');
  });
});
