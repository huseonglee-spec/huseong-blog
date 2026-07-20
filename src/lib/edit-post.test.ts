import { describe, expect, it } from "vitest";

import { parsePostEditInput, parsePostSlug } from "./edit-post";

describe("admin post editing input", () => {
  it("normalizes editable post fields without changing its identity", () => {
    expect(
      parsePostEditInput({
        title: "  수정한 제목  ",
        category: " 생각 / 기록 ",
        bodyMarkdown: "  수정한 첫 문단\r\n\r\n둘째 문단  ",
      }),
    ).toEqual({
      title: "수정한 제목",
      category: "생각/기록",
      bodyMarkdown: "수정한 첫 문단\n\n둘째 문단",
    });
  });

  it("rejects empty or oversized editable content", () => {
    expect(() => parsePostEditInput({ title: "", bodyMarkdown: "본문" })).toThrow(
      "제목을 입력해 주세요.",
    );
    expect(() => parsePostEditInput({ title: "제목", bodyMarkdown: "" })).toThrow(
      "본문을 입력해 주세요.",
    );
    expect(() =>
      parsePostEditInput({ title: "제목", bodyMarkdown: "가".repeat(200_000) }),
    ).toThrow("본문은 512 KiB 이하여야 합니다.");
  });

  it("accepts only canonical post slugs", () => {
    expect(parsePostSlug("language-controls-thought")).toBe("language-controls-thought");
    expect(() => parsePostSlug("../unsafe")).toThrow("글 주소가 올바르지 않습니다.");
  });
});
