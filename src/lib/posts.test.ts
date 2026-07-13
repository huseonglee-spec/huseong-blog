import { describe, expect, it } from "vitest";

import {
  initialVisibleCount,
  postHref,
  sortPostsNewest,
} from "./posts";

describe("post feed helpers", () => {
  it("sorts posts from newest to oldest without mutating the source", () => {
    const source = [
      { id: "older", data: { publishedAt: new Date("2026-01-01") } },
      { id: "newer", data: { publishedAt: new Date("2026-07-13") } },
    ];

    expect(sortPostsNewest(source).map((post) => post.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(source.map((post) => post.id)).toEqual(["older", "newer"]);
  });

  it("creates a trailing-slash permalink that works on static hosting", () => {
    expect(postHref("language-controls-thought")).toBe(
      "/posts/language-controls-thought/",
    );
  });

  it("reveals enough batches to include a directly requested post", () => {
    expect(initialVisibleCount(-1, 5)).toBe(5);
    expect(initialVisibleCount(0, 5)).toBe(5);
    expect(initialVisibleCount(4, 5)).toBe(5);
    expect(initialVisibleCount(5, 5)).toBe(10);
    expect(initialVisibleCount(13, 5)).toBe(15);
  });
});
