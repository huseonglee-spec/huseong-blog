import { describe, expect, it } from "vitest";

import { parsePostFile } from "./post-file";

describe("parsePostFile", () => {
  it("validates frontmatter and returns a database-ready post", () => {
    const post = parsePostFile(
      `---\ntitle: 격일로 달리기\npublishedAt: 2026-07-13T10:26:22-04:00\ncategory: 건강 / 운동\nvisibility: friends\ndraft: false\n---\n\n본문`,
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
      category: "건강/운동",
      visibility: "friends",
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

  it("category를 생략하면 기존 글의 분류를 보존할 수 있도록 undefined를 반환한다", () => {
    const post = parsePostFile(
      "---\ntitle: 기존 글 수정\n---\n\n수정된 본문",
      "existing-post.md",
    );

    expect(post.category).toBeUndefined();
    expect(post.visibility).toBeUndefined();
  });
});
