import { describe, expect, it } from "vitest";

import {
  buildPostStudyPrompt,
  normalizePostStudyItemKey,
  parsePostStudyMaxJobs,
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
    expect(english).toContain("canonicalText");
  });

  it("표면형은 본문에서 확인하고 표제어가 같은 활용형은 한 항목으로 합친다", () => {
    const raw = `\n\`\`\`json\n{"items":[
      {"kind":"expression","text":"took off","canonicalText":"take off","reading":null,"meaningKo":"도약했다","noteKo":"빠르게 성장했다는 뜻이다.","context":"The project took off"},
      {"kind":"expression","text":"took off","canonicalText":"Take off!","reading":null,"meaningKo":"도약했다","noteKo":"중복","context":"took off"}
    ]}\n\`\`\``;

    expect(
      parseGeneratedPostStudyItems({
        locale: "en",
        bodyMarkdown: "The project took off quickly.",
        raw,
      }),
    ).toEqual([
      expect.objectContaining({
        kind: "expression",
        text: "took off",
        canonicalText: "take off",
        context: "The project took off",
        itemKey: normalizePostStudyItemKey("en", "take off"),
      }),
    ]);
  });

  it("제목이나 본문을 고치면 생성 원문 해시가 바뀐다", () => {
    expect(postStudySourceHash("Title", "Body")).not.toBe(
      postStudySourceHash("Title", "Body changed"),
    );
  });

  it("본문에 없는 항목이나 Markdown 링크 URL만 맞는 항목은 출력을 거부한다", () => {
    const raw = JSON.stringify({
      items: [{
        kind: "word",
        text: "art",
        canonicalText: "art",
        reading: null,
        meaningKo: "예술",
        noteKo: "본문에 독립 단어로는 없다.",
        context: "article",
      }],
    });

    expect(() => parseGeneratedPostStudyItems({
      locale: "en",
      bodyMarkdown: "An article appears here with [a link](https://example.com/art).",
      raw,
    })).toThrow("본문에 없습니다");
  });

  it("일본어·중국어 읽기는 필수이고 영어 읽기는 금지한다", () => {
    const japanese = JSON.stringify({ items: [{
      kind: "word",
      text: "書く",
      canonicalText: "書く",
      reading: null,
      meaningKo: "쓰다",
      noteKo: "글을 쓴다는 뜻이다.",
      context: "書く",
    }] });
    expect(() => parseGeneratedPostStudyItems({
      locale: "ja",
      bodyMarkdown: "書く。",
      raw: japanese,
    })).toThrow("읽기가 필요합니다");
  });

  it("worker 작업 수 환경값은 1~10 정수만 허용한다", () => {
    expect(parsePostStudyMaxJobs(undefined)).toBe(3);
    expect(parsePostStudyMaxJobs("10")).toBe(10);
    expect(() => parsePostStudyMaxJobs("nope")).toThrow("must be an integer");
    expect(() => parsePostStudyMaxJobs("1.5")).toThrow("must be an integer");
    expect(() => parsePostStudyMaxJobs("11")).toThrow("between 1 and 10");
  });
});
