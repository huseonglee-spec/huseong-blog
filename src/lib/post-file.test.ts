import { describe, expect, it } from "vitest";

import { parsePostFile } from "./post-file";

describe("parsePostFile", () => {
  it("validates frontmatter and returns a database-ready post", () => {
    const post = parsePostFile(
      `---\ntitle: 격일로 달리기\npublishedAt: 2026-07-13T10:26:22-04:00\ndraft: false\n---\n\n본문`,
      "every-other-day-running.md",
    );

    expect(post).toEqual({
      slug: "every-other-day-running",
      title: "격일로 달리기",
      subtitle: null,
      publishedAt: new Date("2026-07-13T14:26:22.000Z"),
      thumbnail: null,
      thumbnailAlt: null,
      draft: false,
      bodyMarkdown: "본문",
    });
  });

  it("rejects invalid slugs and missing titles", () => {
    expect(() => parsePostFile("---\ntitle: ok\n---\nbody", "한글.md")).toThrow(
      /slug/i,
    );
    expect(() => parsePostFile("---\npublishedAt: 2026-07-13\n---\nbody", "valid.md")).toThrow(
      /title/i,
    );
  });
});
