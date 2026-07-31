import { describe, expect, it } from "vitest";

import {
  buildPostTranslationPrompt,
  MULTILINGUAL_BLOG_TRANSLATION_CONTRACT,
  parseGeneratedPostTranslation,
  parsePostTranslationMaxJobs,
  POST_TRANSLATION_PROMPT_VERSION,
  postTranslationRetryDecision,
  postTranslationSourceHash,
} from "./post-translation-generation";
import { postTranslationModelLocale } from "./post-translation";

const sourceTitle = "빨리 설명하지 않기";
const sourceBody = [
  "## 멈춘 문장",
  "",
  "나는 이해하지 못한 것을 너무 빨리 설명하지 않는다.",
  "",
  "`pause()`를 지우지 않는다. [기록](https://example.com/note)을 남긴다.",
  "",
  "![낮은 파도](https://example.com/wave.png)",
  "",
  "> 모호함도 생각의 일부다.",
  "",
  "- 반복을 지우지 않는다.",
].join("\n");
const translatedBody = [
  "## A Sentence at Rest",
  "",
  "I do not explain what I do not understand too quickly.",
  "",
  "I do not remove `pause()`. I leave a [record](https://example.com/note).",
  "",
  "![Low waves](https://example.com/wave.png)",
  "",
  "> Ambiguity, too, is part of thought.",
  "",
  "- I do not erase repetition.",
].join("\n");

function validOutput(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    targetLocale: "en",
    title: "Not Explaining Too Quickly",
    bodyMarkdown: translatedBody,
    tradeoffs: [{
      sourcePhrase: "너무 빨리 설명하지 않는다",
      selectedTranslation: "do not explain what I do not understand too quickly",
      reason: "The restraint remains a personal rule rather than advice to the reader.",
    }],
    ...overrides,
  });
}

describe("작가 보존형 번역 생성 계약", () => {
  it("Project Store의 번역 계약 전문과 고정 MVP 입력을 versioned prompt에 보존한다", () => {
    const prompt = buildPostTranslationPrompt({
      locale: "zh-CN",
      title: sourceTitle,
      bodyMarkdown: sourceBody,
    });

    expect(POST_TRANSLATION_PROMPT_VERSION).toBe(1);
    expect(prompt).toContain(MULTILINGUAL_BLOG_TRANSLATION_CONTRACT);
    expect(prompt).toContain("SOURCE_LANGUAGE=ko");
    expect(prompt).toContain("TARGET_LOCALE=zh-Hans");
    expect(prompt).toContain("CONTENT_FORMAT=markdown");
    expect(prompt).toContain("OUTPUT_MODE=review");
    expect(prompt).toContain('"title":"빨리 설명하지 않기"');
    expect(prompt).toContain('"bodyMarkdown":"## 멈춘 문장');
    expect(postTranslationModelLocale("en")).toBe("en");
    expect(postTranslationModelLocale("ja")).toBe("ja");
    expect(postTranslationModelLocale("zh-CN")).toBe("zh-Hans");
  });

  it("strict JSON envelope에서 제목·Markdown·의미 있는 절충 메모만 분리한다", () => {
    expect(parseGeneratedPostTranslation({
      locale: "en",
      title: sourceTitle,
      bodyMarkdown: sourceBody,
      raw: validOutput(),
    })).toEqual({
      targetLocale: "en",
      title: "Not Explaining Too Quickly",
      bodyMarkdown: translatedBody,
      tradeoffs: [{
        sourcePhrase: "너무 빨리 설명하지 않는다",
        selectedTranslation: "do not explain what I do not understand too quickly",
        reason: "The restraint remains a personal rule rather than advice to the reader.",
      }],
    });
  });

  it("제목 casing만 다른 절충 번역은 문서에 연결된 것으로 본다", () => {
    const parsed = parseGeneratedPostTranslation({
      locale: "en",
      title: sourceTitle,
      bodyMarkdown: sourceBody,
      raw: validOutput({
        tradeoffs: [{
          sourcePhrase: "빨리 설명하지 않기",
          selectedTranslation: "not explaining too quickly",
          reason: "Preserves the title as a personal restraint.",
        }],
      }),
    });
    expect(parsed.tradeoffs[0]?.selectedTranslation).toBe("not explaining too quickly");
  });

  it("Markdown heading·line break·blockquote·list·link·alt·code를 보존하지 않은 출력을 거부한다", () => {
    for (const bodyMarkdown of [
      translatedBody.replace("## A Sentence", "### A Sentence"),
      translatedBody.replace("https://example.com/note", "https://evil.example/note"),
      translatedBody.replace("`pause()`", "`resume()`"),
      translatedBody.replace("![Low waves]", "![]"),
      translatedBody.replace("> Ambiguity", "Ambiguity"),
      translatedBody.replace("- I do not erase", "I do not erase"),
    ]) {
      expect(() => parseGeneratedPostTranslation({
        locale: "en",
        title: sourceTitle,
        bodyMarkdown: sourceBody,
        raw: validOutput({ bodyMarkdown }),
      })).toThrow();
    }
  });

  it("locale·키·타입·길이·절충 연결이 틀린 JSON과 truncated output을 거부한다", () => {
    expect(() => parseGeneratedPostTranslation({
      locale: "ja",
      title: sourceTitle,
      bodyMarkdown: sourceBody,
      raw: validOutput(),
    })).toThrow("locale");
    expect(() => parseGeneratedPostTranslation({
      locale: "en",
      title: sourceTitle,
      bodyMarkdown: sourceBody,
      raw: validOutput({ extra: true }),
    })).toThrow("envelope");
    expect(() => parseGeneratedPostTranslation({
      locale: "en",
      title: sourceTitle,
      bodyMarkdown: sourceBody,
      raw: validOutput().slice(0, -1),
    })).toThrow("JSON");
    expect(() => parseGeneratedPostTranslation({
      locale: "en",
      title: sourceTitle,
      bodyMarkdown: sourceBody,
      raw: validOutput({ title: "x".repeat(201) }),
    })).toThrow("제목");
    expect(() => parseGeneratedPostTranslation({
      locale: "en",
      title: sourceTitle,
      bodyMarkdown: sourceBody,
      raw: validOutput({
        tradeoffs: [{
          sourcePhrase: "원문에 없음",
          selectedTranslation: "not in translation",
          reason: "invalid",
        }],
      }),
    })).toThrow("연결");
  });

  it("제목이나 본문이 바뀌면 source hash가 바뀌고 worker 수는 1~8로 제한한다", () => {
    expect(postTranslationSourceHash(sourceTitle, sourceBody)).toMatch(/^[0-9a-f]{64}$/u);
    expect(postTranslationSourceHash(sourceTitle, sourceBody)).not.toBe(
      postTranslationSourceHash(`${sourceTitle}!`, sourceBody),
    );
    expect(postTranslationSourceHash(sourceTitle, sourceBody)).not.toBe(
      postTranslationSourceHash(sourceTitle, `${sourceBody}\n`),
    );
    expect(parsePostTranslationMaxJobs(undefined)).toBe(2);
    expect(parsePostTranslationMaxJobs("8")).toBe(8);
    expect(() => parsePostTranslationMaxJobs("0")).toThrow("between 1 and 8");
    expect(() => parsePostTranslationMaxJobs("9")).toThrow("between 1 and 8");
    expect(() => parsePostTranslationMaxJobs("1.5")).toThrow("integer");
  });

  it("일시 실패와 invalid output을 제한된 backoff 뒤 명시적 failed 상태로 보낸다", () => {
    expect(postTranslationRetryDecision("model_timeout", 1)).toEqual({
      retry: true,
      delaySeconds: 60,
    });
    expect(postTranslationRetryDecision("model_unavailable", 3)).toEqual({
      retry: true,
      delaySeconds: 900,
    });
    expect(postTranslationRetryDecision("model_timeout", 4)).toEqual({
      retry: false,
      delaySeconds: 900,
    });
    expect(postTranslationRetryDecision("model_output_invalid", 1)).toEqual({
      retry: true,
      delaySeconds: 60,
    });
    expect(postTranslationRetryDecision("model_output_invalid", 2)).toEqual({
      retry: false,
      delaySeconds: 60,
    });
    expect(() => postTranslationRetryDecision("model_timeout", 0)).toThrow(RangeError);
  });
});
