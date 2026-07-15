import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("./BlogFeed.astro", import.meta.url);

describe("BlogFeed", () => {
  it("게시글 작성일자를 화면에 표시하지 않는다", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).not.toMatch(/<time\b/);
    expect(source).not.toContain("dateFormatter");
  });
});
