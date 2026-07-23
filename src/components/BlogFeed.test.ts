import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("./BlogFeed.astro", import.meta.url);
const composerUrl = new URL("./NewPostComposer.astro", import.meta.url);
const globalCssUrl = new URL("../styles/global.css", import.meta.url);

describe("BlogFeed", () => {
  it("게시글 작성일자를 화면에 표시하지 않는다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).not.toMatch(/<time\b/);
    expect(source).not.toContain("dateFormatter");
  });

  it("데스크톱에서 글 피드를 화면 중앙 열에 배치한다", async () => {
    const source = await readFile(globalCssUrl, "utf8");

    expect(source).toMatch(
      /grid-template-columns:\s*minmax\(170px, 1fr\)\s+minmax\(0, 760px\)\s+minmax\(170px, 1fr\)/,
    );
    expect(source).toMatch(/\.feed\s*\{[^}]*grid-column:\s*2;/s);
  });

  it("새 글과 기존 글 모두 공개 범위를 설정할 수 있다", async () => {
    const [feedSource, composerSource] = await Promise.all([
      readFile(componentUrl, "utf8"),
      readFile(composerUrl, "utf8"),
    ]);

    expect(composerSource).toContain('name="visibility"');
    expect(composerSource).toContain("POST_VISIBILITIES.map");
    expect(feedSource).toContain("visibilityLabel(post.data.visibility)");
  });
});
