import { describe, expect, it } from "vitest";

import { parsePostInput } from "./post-input";

describe("web post input", () => {
  it("returns a validated database-ready post", () => {
    const post = parsePostInput({
      slug: "new-post",
      title: " 새 글 ",
      subtitle: "부제",
      publishedAt: "2026-07-15T01:30:00.000Z",
      thumbnail: "https://example.com/image.jpg",
      thumbnailAlt: "표지",
      draft: "on",
      bodyMarkdown: "\n본문입니다.\n",
    });

    expect(post).toEqual({
      slug: "new-post",
      title: "새 글",
      subtitle: "부제",
      publishedAt: new Date("2026-07-15T01:30:00.000Z"),
      thumbnail: "https://example.com/image.jpg",
      thumbnailAlt: "표지",
      draft: true,
      bodyMarkdown: "본문입니다.",
    });
  });

  it("rejects unsafe or invalid fields", () => {
    const valid = {
      slug: "new-post",
      title: "새 글",
      publishedAt: "2026-07-15T01:30:00.000Z",
      bodyMarkdown: "본문",
    };

    expect(() => parsePostInput({ ...valid, slug: "../escape" })).toThrow(/slug/i);
    expect(() => parsePostInput({ ...valid, title: "" })).toThrow(/제목/);
    expect(() => parsePostInput({ ...valid, publishedAt: "not-a-date" })).toThrow(/게시 일시/);
    expect(() => parsePostInput({ ...valid, publishedAt: undefined })).toThrow(/게시 일시/);
    expect(() => parsePostInput({ ...valid, thumbnail: "javascript:alert(1)" })).toThrow(/썸네일/);
    expect(() => parsePostInput({ ...valid, bodyMarkdown: "" })).toThrow(/본문/);
  });
});
