import { describe, expect, it } from "vitest";

import {
  buildPostStudyPrompt,
  normalizePostStudyItemKey,
  parseGeneratedPostStudyItems,
  postStudySourceHash,
} from "./post-study";

describe("언어판 학습 항목", () => {
  it("대소문자·유니코드·주변 문장부호가 달라도 같은 영어 항목으로 본다", () => {
    const expected = normalizePostStudyItemKey("en", "in and of itself");
    expect(normalizePostStudyItemKey("en", "  In and of itself  ")).toBe(expected);
    expect(normalizePostStudyItemKey("en", "‘IN AND OF ITSELF!’")).toBe(expected);
    expect(normalizePostStudyItemKey("en", "don't hesitate")).toBe(
      normalizePostStudyItemKey("en", "dont hesitate"),
    );
    expect(normalizePostStudyItemKey("en", "well, then")).toBe(
      normalizePostStudyItemKey("en", "well then"),
    );
  });

  it("일본어와 중국어는 글자를 보존하면서 공백과 문장부호만 정규화한다", () => {
    expect(normalizePostStudyItemKey("ja", "「考える」")).toBe(
      normalizePostStudyItemKey("ja", "考える"),
    );
    expect(normalizePostStudyItemKey("zh-CN", "  想法。 ")).toBe(
      normalizePostStudyItemKey("zh-CN", "想法"),
    );
  });

  it("영어는 중급, 일본어와 중국어는 완전 초급까지 고르도록 프롬프트를 나눈다", () => {
    const english = buildPostStudyPrompt({
      locale: "en",
      title: "Writing",
      bodyMarkdown: "Writing is valuable in and of itself.",
      dismissedTexts: [],
    });
    const japanese = buildPostStudyPrompt({
      locale: "ja",
      title: "書くこと",
      bodyMarkdown: "書くことには価値がある。",
      dismissedTexts: [],
    });
    const chinese = buildPostStudyPrompt({
      locale: "zh-CN",
      title: "写作",
      bodyMarkdown: "写作本身就有价值。",
      dismissedTexts: [],
    });

    expect(english).toContain("B1-B2");
    expect(english).toContain("A1-A2");
    expect(japanese).toContain("완전 초급");
    expect(japanese).toContain("히라가나");
    expect(chinese).toContain("완전 초급");
    expect(chinese).toContain("병음");
  });

  it("모델 JSON을 검증하고 본문에 실제 있는 항목만 중복 없이 받는다", () => {
    const raw = `\n\`\`\`json\n{"items":[
      {"kind":"expression","text":"in and of itself","reading":null,"meaningKo":"그 자체로","noteKo":"결과와 무관한 자체 가치를 강조한다.","context":"not quoted from article"},
      {"kind":"expression","text":"In and of itself!","meaningKo":"그 자체로","noteKo":"중복","context":"in and of itself"},
      {"kind":"word","text":"hallucinated","meaningKo":"환각한","noteKo":"본문에 없음","context":"없음"}
    ]}\n\`\`\``;

    expect(
      parseGeneratedPostStudyItems({
        locale: "en",
        bodyMarkdown: "Writing is valuable in and of itself.",
        raw,
      }),
    ).toEqual([
      expect.objectContaining({
        kind: "expression",
        text: "in and of itself",
        context: "in and of itself",
        itemKey: normalizePostStudyItemKey("en", "in and of itself"),
      }),
    ]);
  });

  it("제목이나 본문을 고치면 생성 원문 해시가 바뀐다", () => {
    expect(postStudySourceHash("Title", "Body")).not.toBe(
      postStudySourceHash("Title", "Body changed"),
    );
  });

  it("영어 단어는 다른 긴 단어의 일부만 일치하면 버린다", () => {
    const raw = JSON.stringify({
      items: [{
        kind: "word",
        text: "art",
        meaningKo: "예술",
        noteKo: "본문에 독립 단어로는 없다.",
        context: "article",
      }],
    });

    expect(parseGeneratedPostStudyItems({
      locale: "en",
      bodyMarkdown: "An article appears here.",
      raw,
    })).toEqual([]);
  });
});
