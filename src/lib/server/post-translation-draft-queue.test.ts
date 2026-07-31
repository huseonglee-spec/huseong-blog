import { describe, expect, it } from "vitest";

import { postTranslationDraftQueueResult } from "./post-translation-draft-queue";

function results(options: {
  source?: boolean;
  published?: boolean;
  inserted?: boolean;
  existing?: "pending" | "processing" | "ready";
}): unknown[] {
  return [
    options.source === false ? [] : [{ slug: "source-post" }],
    options.published ? [{ post_slug: "source-post" }] : [],
    [],
    options.inserted ? [{ id: "new-generation" }] : [],
    options.existing ? [{ id: "existing-generation", status: options.existing }] : [],
  ];
}

describe("번역 초안 queue 결과", () => {
  it("글 없음과 이미 발행된 locale을 generation으로 만들지 않는다", () => {
    expect(postTranslationDraftQueueResult(results({ source: false }))).toEqual({
      status: "missing",
    });
    expect(postTranslationDraftQueueResult(results({ published: true }))).toEqual({
      status: "published",
    });
  });

  it("새 요청을 queued로 반환하고 중복 요청은 기존 active/ready generation으로 수렴한다", () => {
    expect(postTranslationDraftQueueResult(results({ inserted: true }))).toEqual({
      status: "queued",
      generationId: "new-generation",
    });
    for (const status of ["pending", "processing", "ready"] as const) {
      expect(postTranslationDraftQueueResult(results({ existing: status }))).toEqual({
        status,
        generationId: "existing-generation",
      });
    }
  });

  it("source와 publication이 있지만 generation이 없는 불가능한 결과를 숨기지 않는다", () => {
    expect(() => postTranslationDraftQueueResult(results({}))).toThrow(
      "Unexpected post translation draft queue state",
    );
  });
});
