import { describe, expect, it } from "vitest";

import { postWritingFeedbackQueueResult } from "./post-writing-feedback-queue";

function results(options: {
  post?: boolean;
  inserted?: boolean;
  existing?: "pending" | "processing" | "ready";
}): unknown[] {
  return [
    options.post === false ? [] : [{ slug: "source-post" }],
    [],
    options.inserted ? [{ id: "new-generation" }] : [],
    options.existing ? [{ id: "existing-generation", status: options.existing }] : [],
  ];
}

describe("글쓰기 피드백 queue 결과", () => {
  it("없는 글은 generation을 만들지 않는다", () => {
    expect(postWritingFeedbackQueueResult(results({ post: false }))).toEqual({
      status: "missing",
    });
  });

  it("새 요청은 queued이고 동일 초안의 중복 요청은 기존 generation으로 수렴한다", () => {
    expect(postWritingFeedbackQueueResult(results({ inserted: true }))).toEqual({
      status: "queued",
      generationId: "new-generation",
    });
    for (const status of ["pending", "processing", "ready"] as const) {
      expect(postWritingFeedbackQueueResult(results({ existing: status }))).toEqual({
        status,
        generationId: "existing-generation",
      });
    }
  });

  it("글은 있지만 generation이 없는 불가능한 결과를 숨기지 않는다", () => {
    expect(() => postWritingFeedbackQueueResult(results({}))).toThrow(
      "Unexpected writing feedback queue state",
    );
  });
});
