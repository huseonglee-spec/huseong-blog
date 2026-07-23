import { describe, expect, it } from "vitest";

import {
  buildCategoryTree,
  categoryHref,
  filterPostsByCategory,
  normalizeCategoryPath,
} from "./categories";
import type { BlogPost } from "./posts";

function post(id: string, category: string): BlogPost {
  return {
    id,
    data: {
      title: id,
      publishedAt: new Date("2026-07-14T00:00:00.000Z"),
      draft: false,
      category,
      visibility: "public",
    },
    bodyMarkdown: "본문",
    updatedAt: new Date("2026-07-14T00:00:00.000Z"),
  };
}

describe("post categories", () => {
  it("normalizes slash-separated paths and rejects empty hierarchy levels", () => {
    expect(normalizeCategoryPath(" 기술 / AI / 에이전트 ")).toBe(
      "기술/AI/에이전트",
    );
    expect(normalizeCategoryPath(undefined)).toBe("미분류");
    expect(() => normalizeCategoryPath("기술//AI")).toThrow(
      "카테고리 경로가 올바르지 않습니다.",
    );
  });

  it("builds a hierarchy with descendant-inclusive counts", () => {
    const tree = buildCategoryTree([
      post("one", "기술/AI"),
      post("two", "기술/웹"),
      post("three", "일상"),
    ]);

    expect(tree).toEqual([
      {
        name: "기술",
        path: "기술",
        count: 2,
        children: [
          { name: "웹", path: "기술/웹", count: 1, children: [] },
          { name: "AI", path: "기술/AI", count: 1, children: [] },
        ],
      },
      { name: "일상", path: "일상", count: 1, children: [] },
    ]);
  });

  it("filters a parent category to all of its descendants", () => {
    const posts = [
      post("one", "기술/AI"),
      post("two", "기술/웹"),
      post("three", "일상"),
    ];

    expect(filterPostsByCategory(posts, "기술").map(({ id }) => id)).toEqual([
      "one",
      "two",
    ]);
    expect(filterPostsByCategory(posts, undefined)).toEqual(posts);
    expect(categoryHref("기술/AI")).toBe("/?category=%EA%B8%B0%EC%88%A0%2FAI");
  });
});
