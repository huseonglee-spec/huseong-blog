import { describe, expect, it } from "vitest";

import type { BlogPost } from "./posts";
import {
  englishExpressionNotes,
  translatePostsForAdmin,
} from "./translation-prototype";

const post = (id: string, title: string, bodyMarkdown: string): BlogPost => ({
  id,
  data: {
    title,
    publishedAt: new Date("2026-07-14T00:00:00.000Z"),
    draft: false,
    category: "생각",
    visibility: "public",
  },
  bodyMarkdown,
  updatedAt: new Date("2026-07-14T00:00:00.000Z"),
});

describe("영어 UI 검증용 번역", () => {
  it("기존 글의 정체성과 메타데이터는 유지하고 제목과 본문만 영어로 바꾼다", () => {
    const original = post("writing", "글쓰기", "한국어 원문");
    const [translated] = translatePostsForAdmin([original]);

    expect(translated.id).toBe("writing");
    expect(translated.data.title).toBe("Writing");
    expect(translated.bodyMarkdown).toContain("The act of writing");
    expect(translated.data.category).toBe("생각");
    expect(original.data.title).toBe("글쓰기");
  });

  it("아직 번역 fixture가 없는 글은 원문을 안전하게 유지한다", () => {
    const original = post("unknown-post", "원문 제목", "원문 본문");

    expect(translatePostsForAdmin([original])).toEqual([original]);
  });

  it("글쓰기 번역에 현재 표현과 한국어 대안을 연결한다", () => {
    expect(englishExpressionNotes.writing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          current: "in and of itself",
          alternatives: expect.arrayContaining(["in its own right"]),
        }),
      ]),
    );
  });
});
