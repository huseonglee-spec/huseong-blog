import { createHash } from "node:crypto";

import { normalizePostBodyMarkdown } from "./edit-post";

export const POST_WRITING_FEEDBACK_PROMPT_VERSION = 1;
export const POST_WRITING_FEEDBACK_MAX_TRANSIENT_ATTEMPTS = 4;
export const POST_WRITING_FEEDBACK_MAX_INVALID_OUTPUT_ATTEMPTS = 2;

export type PostWritingFeedbackLocale = "ko" | "en" | "ja" | "zh-CN";

export interface PostWritingFeedbackItem {
  feedback: string;
  reason: string;
}

export interface GeneratedPostWritingFeedback {
  items: PostWritingFeedbackItem[];
}

export type PostWritingFeedbackStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "superseded";

export interface PostWritingFeedbackGenerationRow {
  id: string;
  locale: PostWritingFeedbackLocale;
  status: PostWritingFeedbackStatus;
  source_hash: string;
  prompt_version: number;
  attempts: number;
  available_at: string | Date;
  last_error: string | null;
}

export interface PostWritingFeedbackItemRow {
  item_key: string;
  feedback: string;
  reason: string;
}

export interface PostWritingFeedbackView {
  generationId: string;
  locale: PostWritingFeedbackLocale;
  status: PostWritingFeedbackStatus;
  sourceHash: string;
  promptVersion: number;
  attempts: number;
  retryAt?: string;
  items: Array<PostWritingFeedbackItem & { itemKey: string }>;
  error?: string;
}

const FEEDBACK_ERROR_MESSAGES: Record<string, string> = {
  model_output_invalid: "피드백 결과 형식을 확인하지 못했습니다. 다시 요청해 주세요.",
  model_timeout: "피드백 생성 시간이 초과되었습니다. 잠시 뒤 다시 시도합니다.",
  model_unavailable: "OAuth 피드백 worker에 일시적으로 연결하지 못했습니다.",
  worker_interrupted: "worker가 중단되어 작업을 다시 대기열에 넣었습니다.",
};

export function postWritingFeedbackView(input: {
  generation: PostWritingFeedbackGenerationRow;
  items: readonly PostWritingFeedbackItemRow[];
}): PostWritingFeedbackView {
  const { generation } = input;
  return {
    generationId: generation.id,
    locale: generation.locale,
    status: generation.status,
    sourceHash: generation.source_hash,
    promptVersion: generation.prompt_version,
    attempts: generation.attempts,
    ...(generation.status === "pending"
      ? { retryAt: new Date(generation.available_at).toISOString() }
      : {}),
    items: input.items.map((item) => ({
      itemKey: item.item_key,
      feedback: item.feedback,
      reason: item.reason,
    })),
    ...(generation.status === "failed"
      ? { error: FEEDBACK_ERROR_MESSAGES[generation.last_error ?? ""] ?? "피드백을 만들지 못했습니다." }
      : {}),
  };
}

export interface PostWritingFeedbackSource {
  locale: PostWritingFeedbackLocale;
  title: string;
  bodyMarkdown: string;
}

export type PostWritingFeedbackFailureCode =
  | "model_output_invalid"
  | "model_timeout"
  | "model_unavailable";

interface ParsePostWritingFeedbackInput extends PostWritingFeedbackSource {
  raw: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function itemField(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string" || value !== value.trim()) return undefined;
  return value && value.length <= maximum ? value : undefined;
}

export function parsePostWritingFeedbackSource(input: {
  locale: unknown;
  title: unknown;
  bodyMarkdown: unknown;
}): PostWritingFeedbackSource {
  if (input.locale !== "ko" && input.locale !== "en" && input.locale !== "ja" && input.locale !== "zh-CN") {
    throw new TypeError("글 언어가 올바르지 않습니다.");
  }
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new TypeError("제목을 입력해 주세요.");
  }
  const title = input.title.trim();
  if (title.length > 200) throw new TypeError("제목이 너무 깁니다.");
  if (typeof input.bodyMarkdown !== "string" || !input.bodyMarkdown.trim()) {
    throw new TypeError("본문을 입력해 주세요.");
  }
  const bodyMarkdown = normalizePostBodyMarkdown(input.bodyMarkdown);
  if (new TextEncoder().encode(bodyMarkdown).byteLength > 512 * 1024) {
    throw new TypeError("본문은 512 KiB 이하여야 합니다.");
  }
  return { locale: input.locale, title, bodyMarkdown };
}

export function postWritingFeedbackSourceHash(title: string, bodyMarkdown: string): string {
  return createHash("sha256")
    .update(title.normalize("NFC"), "utf8")
    .update("\0", "utf8")
    .update(bodyMarkdown.normalize("NFC"), "utf8")
    .digest("hex");
}

export function postWritingFeedbackItemKey(feedback: string, reason: string): string {
  return createHash("sha256")
    .update(feedback.normalize("NFC"), "utf8")
    .update("\0", "utf8")
    .update(reason.normalize("NFC"), "utf8")
    .digest("hex");
}

export function parsePostWritingFeedbackMaxJobs(value: string | undefined): number {
  if (value === undefined || value === "") return 2;
  if (!/^\d+$/u.test(value)) {
    throw new TypeError("HUSEONG_BLOG_FEEDBACK_MAX_JOBS must be an integer");
  }
  const parsed = Number(value);
  if (parsed < 1 || parsed > 8) {
    throw new RangeError("HUSEONG_BLOG_FEEDBACK_MAX_JOBS must be between 1 and 8");
  }
  return parsed;
}

export function postWritingFeedbackRetryDecision(
  code: PostWritingFeedbackFailureCode,
  attempts: number,
): { retry: boolean; delaySeconds: number } {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new RangeError("writing feedback attempts must be a positive integer");
  }
  const invalidOutput = code === "model_output_invalid";
  const maximumAttempts = invalidOutput
    ? POST_WRITING_FEEDBACK_MAX_INVALID_OUTPUT_ATTEMPTS
    : POST_WRITING_FEEDBACK_MAX_TRANSIENT_ATTEMPTS;
  const delays = invalidOutput ? [60] : [60, 300, 900];
  return {
    retry: attempts < maximumAttempts,
    delaySeconds: delays[Math.min(attempts - 1, delays.length - 1)] ?? 300,
  };
}

export function buildPostWritingFeedbackPrompt(input: PostWritingFeedbackSource): string {
  const source = JSON.stringify({
    locale: input.locale,
    title: input.title,
    bodyMarkdown: input.bodyMarkdown,
  });
  return [
    "아래 개인 블로그 초안의 표현 문제만 검토한다.",
    "도구를 사용하지 말고 Markdown fence나 설명 없이 JSON 객체 하나만 출력한다.",
    '출력은 정확히 {"items":[{"feedback":string,"reason":string}]} 형식이다.',
    "문제가 없으면 items는 빈 배열이다. 항목 수를 채우지 않는다.",
    "판단과 이유는 한국어로 쓴다. 후보 어휘나 후보 문장은 현재 글의 언어로 쓴다.",
    "제목과 본문을 모두 검토한다.",
    "어휘 정확성, 군더더기와 반복, 조사·맞춤법·문법, 문장·문단 순서, 행갈이와 리듬을 검토한다.",
    "낯설거나 날카로운 어휘라도 생각을 더 정확히 담으면 익숙한 어휘보다 우선한다.",
    "작성 의도가 모호하면 하나로 단정하지 말고 해석별 후보를 제안한다.",
    "직접 인용문은 문맥으로 판단해 피드백 대상에서 제외한다.",
    "생각의 옳고 그름을 평가하지 않는다. 논리, 전제, 게시 가치, 보편적 공감 가능성도 평가하지 않는다.",
    "개인적 생각을 보편 정의·공리·진리로 확장하지 않는다.",
    "불필요한 배경, 사례, 설명, 결론을 요구하거나 추가하지 않는다.",
    "비보편적이거나 불편하거나 날카로운 생각과 표현을 평범하고 보편적인 문장으로 평탄화하지 않는다.",
    "긍정 평가, 점수, 전체 총평, 칭찬, 자동 재작성, 완성 원고, 원클릭 적용 문구를 출력하지 않는다.",
    "각 항목의 feedback에는 무엇을 어떻게 다듬을지만, reason에는 그렇게 판단한 이유만 쓴다.",
    "",
    `SOURCE_DOCUMENT_JSON=${source}`,
  ].join("\n");
}

export function parseGeneratedPostWritingFeedback(
  input: ParsePostWritingFeedbackInput,
): GeneratedPostWritingFeedback {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.raw.trim()) as unknown;
  } catch {
    throw new TypeError("피드백 JSON 형식이 올바르지 않습니다.");
  }
  const payload = record(parsed);
  if (!payload || !hasExactKeys(payload, ["items"]) || !Array.isArray(payload.items)) {
    throw new TypeError("피드백 JSON envelope가 올바르지 않습니다.");
  }
  if (payload.items.length > 20) throw new TypeError("피드백 항목이 너무 많습니다.");
  const itemKeys = new Set<string>();
  return {
    items: payload.items.map((candidate) => {
      const item = record(candidate);
      if (!item || !hasExactKeys(item, ["feedback", "reason"])) {
        throw new TypeError("피드백 항목 envelope가 올바르지 않습니다.");
      }
      const feedback = itemField(item.feedback, 1_200);
      const reason = itemField(item.reason, 1_600);
      if (!feedback || !reason) throw new TypeError("피드백 항목 필드가 올바르지 않습니다.");
      const itemKey = postWritingFeedbackItemKey(feedback, reason);
      if (itemKeys.has(itemKey)) throw new TypeError("중복 피드백 항목은 허용하지 않습니다.");
      itemKeys.add(itemKey);
      return { feedback, reason };
    }),
  };
}
