import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const contentUrl = new URL("./content.ts", import.meta.url);
const indexUrl = new URL("../pages/index.astro", import.meta.url);
const permalinkUrl = new URL("../pages/posts/[slug].astro", import.meta.url);
const sitemapUrl = new URL("../pages/sitemap.xml.ts", import.meta.url);

describe("post visibility boundary", () => {
  it("filters restricted posts in the database query by default", async () => {
    const source = await readFile(contentUrl, "utf8");

    expect(source).toContain("includeRestricted = false");
    expect(source).toContain("visibility = 'public'");
    expect(source).toContain("normalizePostVisibility(row.visibility)");
  });

  it("lets only the authenticated owner include restricted posts", async () => {
    const [indexSource, permalinkSource, sitemapSource] = await Promise.all([
      readFile(indexUrl, "utf8"),
      readFile(permalinkUrl, "utf8"),
      readFile(sitemapUrl, "utf8"),
    ]);

    expect(indexSource).toContain("getPublishedPosts(Boolean(session))");
    expect(permalinkSource).toContain("getPublishedPosts(Boolean(session))");
    expect(sitemapSource).toContain("getPublishedPosts()");
    expect(sitemapSource).not.toContain("getPublishedPosts(true)");
  });
});
