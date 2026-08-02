import { describe, expect, it } from "vitest";

import { postWritingFeedbackView } from "../post-writing-feedback";

describe("글쓰기 피드백 view", () => {
  it("ready generation의 숨기지 않은 피드백만 정렬해 반환한다", () => {
    expect(postWritingFeedbackView({
      generation: {
        id: "generation-1",
        locale: "ko",
        status: "ready",
        source_hash: "a".repeat(64),
        prompt_version: 1,
        attempts: 1,
        available_at: new Date("2026-08-02T12:00:00Z"),
        last_error: null,
      },
      items: [{
        item_key: "b".repeat(64),
        feedback: "반복을 덜어내세요.",
        reason: "같은 의미가 겹칩니다.",
      }],
    })).toEqual({
      generationId: "generation-1",
      locale: "ko",
      status: "ready",
      sourceHash: "a".repeat(64),
      promptVersion: 1,
      attempts: 1,
      items: [{
        itemKey: "b".repeat(64),
        feedback: "반복을 덜어내세요.",
        reason: "같은 의미가 겹칩니다.",
      }],
    });
  });

  it("피드백 0개 ready와 worker 실패를 서로 다른 정상 view로 반환한다", () => {
    const base = {
      id: "generation-2",
      locale: "en" as const,
      source_hash: "c".repeat(64),
      prompt_version: 1,
      attempts: 2,
      available_at: new Date("2026-08-02T12:00:00Z"),
    };
    expect(postWritingFeedbackView({
      generation: { ...base, status: "ready", last_error: null },
      items: [],
    }).items).toEqual([]);
    expect(postWritingFeedbackView({
      generation: { ...base, status: "failed", last_error: "model_output_invalid" },
      items: [],
    })).toMatchObject({
      status: "failed",
      error: "피드백 결과 형식을 확인하지 못했습니다. 다시 요청해 주세요.",
      items: [],
    });
  });
});
