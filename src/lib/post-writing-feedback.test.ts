import { describe, expect, it } from "vitest";

import {
  buildPostWritingFeedbackPrompt,
  parsePostWritingFeedbackMaxJobs,
  parsePostWritingFeedbackSource,
  parseGeneratedPostWritingFeedback,
  postWritingFeedbackItemKey,
  postWritingFeedbackRetryDecision,
  postWritingFeedbackSourceHash,
} from "./post-writing-feedback";

describe("글쓰기 피드백 생성 계약", () => {
  it("현재 글의 언어와 저장하지 않은 초안을 전달하고 피드백·이유만 읽는다", () => {
    const input = {
      locale: "ko" as const,
      title: "삶의 방향성",
      bodyMarkdown: "계속 수행하는 것을 반복한다.",
    };

    const prompt = buildPostWritingFeedbackPrompt(input);
    expect(prompt).toContain("생각의 옳고 그름을 평가하지 않는다");
    expect(prompt).toContain("긍정 평가, 점수, 전체 총평");
    expect(prompt).toContain('"locale":"ko"');
    expect(prompt).toContain('"title":"삶의 방향성"');

    expect(parseGeneratedPostWritingFeedback({
      ...input,
      raw: JSON.stringify({
        items: [{
          feedback: "‘계속’과 ‘반복한다’ 중 하나를 덜어내세요.",
          reason: "두 표현이 모두 지속을 나타내어 의미가 겹칩니다.",
        }],
      }),
    })).toEqual({
      items: [{
        feedback: "‘계속’과 ‘반복한다’ 중 하나를 덜어내세요.",
        reason: "두 표현이 모두 지속을 나타내어 의미가 겹칩니다.",
      }],
    });
  });

  it("피드백 0개는 허용하고 envelope·문장·개수 경계를 벗어난 출력은 거절한다", () => {
    const input = {
      locale: "en" as const,
      title: "Direction",
      bodyMarkdown: "Keep moving.",
    };

    expect(parseGeneratedPostWritingFeedback({
      ...input,
      raw: '{"items":[]}',
    })).toEqual({ items: [] });
    expect(() => parseGeneratedPostWritingFeedback({
      ...input,
      raw: '{"items":[],"summary":"good"}',
    })).toThrow("피드백 JSON envelope");
    expect(() => parseGeneratedPostWritingFeedback({
      ...input,
      raw: '{"items":[{"feedback":"","reason":"이유"}]}',
    })).toThrow("피드백 항목 필드");
    expect(() => parseGeneratedPostWritingFeedback({
      ...input,
      raw: JSON.stringify({
        items: Array.from({ length: 21 }, (_, index) => ({
          feedback: `피드백 ${index}`,
          reason: `이유 ${index}`,
        })),
      }),
    })).toThrow("피드백 항목이 너무 많습니다");
  });

  it("언어와 미저장 초안을 정규화하고 같은 내용은 같은 source hash로 식별한다", () => {
    const source = parsePostWritingFeedbackSource({
      locale: "ja",
      title: "  方 向  ",
      bodyMarkdown: "一行目\r\n二行目\r\n",
    });
    expect(source).toEqual({
      locale: "ja",
      title: "方 向",
      bodyMarkdown: "一行目\n二行目",
    });
    expect(postWritingFeedbackSourceHash("é", "본문")).toBe(
      postWritingFeedbackSourceHash("e\u0301", "본문"),
    );
    expect(() => parsePostWritingFeedbackSource({
      locale: "fr",
      title: "제목",
      bodyMarkdown: "본문",
    })).toThrow("글 언어");
    expect(() => parsePostWritingFeedbackSource({
      locale: "ko",
      title: "제목",
      bodyMarkdown: "가".repeat(200_000),
    })).toThrow("512 KiB");
  });

  it("worker 작업 수와 실패 종류별 재시도 횟수를 제한한다", () => {
    expect(parsePostWritingFeedbackMaxJobs(undefined)).toBe(2);
    expect(() => parsePostWritingFeedbackMaxJobs("9")).toThrow("between 1 and 8");
    expect(postWritingFeedbackRetryDecision("model_output_invalid", 1)).toEqual({
      retry: true,
      delaySeconds: 60,
    });
    expect(postWritingFeedbackRetryDecision("model_output_invalid", 2).retry).toBe(false);
    expect(postWritingFeedbackRetryDecision("model_timeout", 3)).toEqual({
      retry: true,
      delaySeconds: 900,
    });
    expect(postWritingFeedbackRetryDecision("model_timeout", 4).retry).toBe(false);
  });

  it("같은 피드백과 이유는 NFC 차이와 무관하게 같은 항목 key로 수렴한다", () => {
    expect(postWritingFeedbackItemKey("é를 검토하세요.", "이유"))
      .toBe(postWritingFeedbackItemKey("e\u0301를 검토하세요.", "이유"));
    expect(postWritingFeedbackItemKey("다른 피드백", "이유")).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("같은 항목 key를 만드는 exact·NFC 중복 모델 출력은 거절한다", () => {
    const input = {
      locale: "ko" as const,
      title: "제목",
      bodyMarkdown: "본문",
    };
    const duplicate = (feedbacks: string[]) => JSON.stringify({
      items: feedbacks.map((feedback) => ({ feedback, reason: "같은 이유" })),
    });

    expect(() => parseGeneratedPostWritingFeedback({
      ...input,
      raw: duplicate(["같은 피드백", "같은 피드백"]),
    })).toThrow("중복");
    expect(() => parseGeneratedPostWritingFeedback({
      ...input,
      raw: duplicate(["é를 검토하세요", "e\u0301를 검토하세요"]),
    })).toThrow("중복");
  });
});
