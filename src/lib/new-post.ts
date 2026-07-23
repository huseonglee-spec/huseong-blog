import type { WritablePost } from "./post-file";
import { normalizeCategoryPath } from "./categories";
import { normalizePostBodyMarkdown } from "./edit-post";
import { normalizePostVisibility } from "./visibility";

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_BYTES = 512 * 1024;
const ENTROPY_PATTERN = /^[a-f0-9]{8}$/;
const SUBMISSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function parseSubmissionId(value: unknown): string {
  if (typeof value !== "string" || !SUBMISSION_ID_PATTERN.test(value)) {
    throw new TypeError("제출 식별자가 올바르지 않습니다.");
  }
  return value;
}

export interface NewPostInput {
  title?: unknown;
  bodyMarkdown?: unknown;
  category?: unknown;
  visibility?: unknown;
}

export function parseNewPostInput(
  input: NewPostInput,
  publishedAt: Date,
  entropy: string,
): WritablePost {
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new TypeError("제목을 입력해 주세요.");
  }
  const title = input.title.trim();
  if (title.length > MAX_TITLE_LENGTH) {
    throw new TypeError("제목이 너무 깁니다.");
  }

  if (typeof input.bodyMarkdown !== "string" || !input.bodyMarkdown.trim()) {
    throw new TypeError("본문을 입력해 주세요.");
  }
  const bodyMarkdown = normalizePostBodyMarkdown(input.bodyMarkdown);
  if (new TextEncoder().encode(bodyMarkdown).byteLength > MAX_BODY_BYTES) {
    throw new TypeError("본문은 512 KiB 이하여야 합니다.");
  }

  if (Number.isNaN(publishedAt.getTime()) || !ENTROPY_PATTERN.test(entropy)) {
    throw new TypeError("글 식별자를 생성하지 못했습니다.");
  }
  const timestamp = publishedAt
    .toISOString()
    .slice(0, 19)
    .replace("T", "-")
    .replaceAll(":", "");

  return {
    slug: `${timestamp}-${entropy}`,
    title,
    subtitle: null,
    publishedAt,
    thumbnail: null,
    thumbnailAlt: null,
    draft: false,
    category: normalizeCategoryPath(input.category),
    visibility: normalizePostVisibility(input.visibility),
    bodyMarkdown,
  };
}
