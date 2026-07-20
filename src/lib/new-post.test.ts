import { describe, expect, it } from "vitest";

import { parseNewPostInput, parseSubmissionId } from "./new-post";

describe("inline new post input", () => {
  it("builds a publishable post from a title and markdown body", () => {
    const post = parseNewPostInput(
      {
        title: "  새 글  ",
        category: " 생각 / 기록 ",
        bodyMarkdown: "  첫 문단\r\n\r\n둘째 문단  ",
      },
      new Date("2026-07-14T23:30:45.000Z"),
      "a1b2c3d4",
    );

    expect(post).toMatchObject({
      slug: "2026-07-14-233045-a1b2c3d4",
      title: "새 글",
      subtitle: null,
      thumbnail: null,
      thumbnailAlt: null,
      draft: false,
      category: "생각/기록",
      bodyMarkdown: "첫 문단\n\n둘째 문단",
    });
    expect(post.publishedAt.toISOString()).toBe("2026-07-14T23:30:45.000Z");
  });

  it("rejects empty or oversized content", () => {
    expect(() =>
      parseNewPostInput({ title: "", bodyMarkdown: "본문" }, new Date(), "a1b2c3d4"),
    ).toThrow("제목을 입력해 주세요.");
    expect(() =>
      parseNewPostInput({ title: "제목", bodyMarkdown: "" }, new Date(), "a1b2c3d4"),
    ).toThrow("본문을 입력해 주세요.");
    expect(() =>
      parseNewPostInput(
        { title: "제목", bodyMarkdown: "가".repeat(200_000) },
        new Date(),
        "a1b2c3d4",
      ),
    ).toThrow("본문은 512 KiB 이하여야 합니다.");
  });

  it("accepts only canonical UUID submission IDs", () => {
    expect(parseSubmissionId("123e4567-e89b-42d3-a456-426614174000")).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(() => parseSubmissionId("not-a-submission-id")).toThrow(
      "제출 식별자가 올바르지 않습니다.",
    );
  });

  it("requires server-generated hexadecimal entropy", () => {
    expect(() =>
      parseNewPostInput({ title: "제목", bodyMarkdown: "본문" }, new Date(), "unsafe"),
    ).toThrow("글 식별자를 생성하지 못했습니다.");
  });
});
