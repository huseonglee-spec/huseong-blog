import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("./FocusBlogConcept.astro", import.meta.url);
const indexPageUrl = new URL("../pages/design-lab.astro", import.meta.url);
const conceptPageUrl = new URL("../pages/design-lab/[concept].astro", import.meta.url);
const homePageUrl = new URL("../pages/index.astro", import.meta.url);
const permalinkPageUrl = new URL("../pages/posts/[slug].astro", import.meta.url);
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

  it("각 글을 고유 URL로 연결하고 뒤로가기로 선택 상태를 복원한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain('import { postHref, type BlogPost } from "../lib/posts"');
    expect(source).toContain("postTranslationHref");
    expect(source).toContain("const readerPostHref = (post: BlogPost)");
    expect(source).toContain("activeTranslationLocale && post.id === initialSlug");
    expect(source).toContain("postTranslationHref(post.id, activeTranslationLocale)");
    expect(source).toContain("data-post-href={readerPostHref(post)}");
    expect(source).toContain("initialSlug?: string");
    expect(source).toContain("href={readerPostHref(post)}");
    expect(source).toContain("window.history.pushState");
    expect(source).toContain('window.addEventListener("popstate"');
    expect(source).toContain('searchParams.get("lang")');
    expect(source).toContain("currentLanguage !== renderedLanguage");
    expect(source).toContain("window.location.reload()");
  });

  it("운영형 인덱스는 카테고리 안에 글을 넣은 아코디언으로 탐색한다", async () => {
    const source = await readFile(componentUrl, "utf8");
    const accordionMarkup = source.match(/<nav class="category-accordion"[\s\S]*?<\/nav>/)?.[0] ?? "";

    expect(source).toContain("data-category-accordion");
    expect(source).not.toContain('isActualPreview ? "카테고리" : "생각의 갈래"');
    expect(source).toContain('data-accordion-category="__all__"');
    expect(source).toContain("<strong>전체 글 보기</strong>");
    expect(source).toContain("data-all-posts");
    expect(accordionMarkup).not.toContain('String(index + 1).padStart(2, "0")');
    expect(source).toMatch(/\.category-accordion\s*\{[^}]*scrollbar-width:none/);
    expect(source).toContain(".category-accordion::-webkit-scrollbar");
    expect(source).toContain("data-category-toggle");
    expect(source).toContain("data-accordion-posts");
    expect(source).toContain("data-mobile-archive-toggle");
    expect(source).toContain('class="sidebar-login" href="/admin/login/"');
    expect(source).toContain('"actual-mobile-controls"');
    expect(source).toContain('"actual-mobile-controls--authenticated": authenticated');
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

  it("운영형 인덱스의 글 제목을 데스크톱과 모바일에서 작게 유지한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain("font-size:clamp(1.75rem,3vw,3rem)");
    expect(source).toContain("font-size:clamp(1.7rem,8vw,2.6rem)");
  });

  it("로그인 여부와 무관하게 홈에서 확정한 인덱스 집중 모드를 사용한다", async () => {
    const [componentSource, source] = await Promise.all([
      readFile(componentUrl, "utf8"),
      readFile(homePageUrl, "utf8"),
    ]);

    expect(source).toContain('import FocusBlogConcept from "../components/FocusBlogConcept.astro"');
    expect(source).not.toContain('import BlogFeed from "../components/BlogFeed.astro"');
    expect(source).toContain('<FocusBlogConcept');
    expect(source).toContain('posts={posts}');
    expect(source).toContain('variation="focus-index"');
    expect(source).toContain('composerCsrfToken={session?.csrfToken}');
    expect(source).toContain('editCsrfToken={session?.csrfToken}');
    expect(source).toContain('translationCsrfToken={session?.csrfToken}');
    expect(componentSource).toContain('import NewPostComposer from "./NewPostComposer.astro"');
    expect(componentSource).toContain('import EditPostForm from "./EditPostForm.astro"');
    expect(componentSource).toContain('import PostTranslationForm from "./PostTranslationForm.astro"');
  });

  it("개별 글 URL에서도 홈과 같은 인덱스 집중 UI로 해당 글을 연다", async () => {
    const source = await readFile(permalinkPageUrl, "utf8");

    expect(source).toContain('import FocusBlogConcept from "../../components/FocusBlogConcept.astro"');
    expect(source).not.toContain('import BlogFeed from "../../components/BlogFeed.astro"');
    expect(source).toContain('<FocusBlogConcept');
    expect(source).toContain('variation="focus-index"');
    expect(source).toContain('initialSlug={activePost.id}');
  });
});
