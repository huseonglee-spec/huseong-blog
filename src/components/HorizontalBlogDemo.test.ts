import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("./HorizontalBlogDemo.astro", import.meta.url);
const pageUrl = new URL("../pages/horizontal-demo.astro", import.meta.url);

describe("HorizontalBlogDemo", () => {
  it("실제 게시글을 사용하는 독립 데모 페이지로 연결된다", async () => {
    const pageSource = await readFile(pageUrl, "utf8");

    expect(pageSource).toContain("getPublishedPosts");
    expect(pageSource).toContain("HorizontalBlogDemo");
  });

  it("한 글씩 스냅되는 좌우 덱과 명시적인 이전·다음 조작을 제공한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain("data-horizontal-track");
    expect(source).toContain("data-horizontal-post");
    expect(source).toContain('aria-label="이전 글"');
    expect(source).toContain('aria-label="다음 글"');
    expect(source).toMatch(/grid-auto-columns:\s*100vw/);
    expect(source).toMatch(/scroll-snap-type:\s*x mandatory/);
    expect(source).toMatch(/scroll-snap-align:\s*center/);
  });

  it("글 내부 스크롤 없이 도입부와 전체 글 링크만 한 화면에 배치한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).not.toContain('class="sheet-scroll"');
    expect(source).toMatch(/class="[^"]*post-preview[^"]*"/);
    expect(source).toContain("글 전체 읽기");
    expect(source).toMatch(/\.post-preview\s*\{[^}]*overflow:\s*hidden;/s);
  });

  it("키보드·진행 상태·모션 감소 환경을 지원한다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('event.key === "ArrowLeft"');
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain("prefers-reduced-motion: reduce");
  });

  it("모바일 좌우 핸들이 하단 진행 상태보다 앞에 표시된다", async () => {
    const source = await readFile(componentUrl, "utf8");
    const mobileStyles = source.match(/@media \(max-width: 760px\) \{([\s\S]*?)@media \(prefers-reduced-motion/);

    expect(mobileStyles?.[1]).toMatch(/\.edge-handle\s*\{[^}]*z-index:\s*12;/s);
  });
});
