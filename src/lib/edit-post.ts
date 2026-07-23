import { normalizeCategoryPath } from "./categories";
import {
  normalizePostVisibility,
  type PostVisibility,
} from "./visibility";

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_BYTES = 512 * 1024;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PostEditInput {
  title?: unknown;
  bodyMarkdown?: unknown;
  category?: unknown;
  visibility?: unknown;
}

export interface EditablePostFields {
  title: string;
  bodyMarkdown: string;
  category: string;
  visibility: PostVisibility;
}

export function normalizePostBodyMarkdown(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function parsePostSlug(value: unknown): string {
  if (typeof value !== "string" || !SLUG_PATTERN.test(value)) {
    throw new TypeError("글 주소가 올바르지 않습니다.");
  }
  return value;
}

export function parsePostEditInput(input: PostEditInput): EditablePostFields {
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

  return {
    title,
    category: normalizeCategoryPath(input.category),
    visibility: normalizePostVisibility(input.visibility),
    bodyMarkdown,
  };
}
