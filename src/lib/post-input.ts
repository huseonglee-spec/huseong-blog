import type { WritablePost } from "./post-file";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BODY_BYTES = 512 * 1024;

export type PostInput = Record<string, unknown>;

function requiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label}을(를) 입력해 주세요.`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new TypeError(`${label}이(가) 너무 깁니다.`);
  }
  return result;
}

function optionalString(value: unknown, label: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new TypeError(`${label} 형식이 올바르지 않습니다.`);
  const result = value.trim();
  if (!result) return null;
  if (result.length > maxLength) throw new TypeError(`${label}이(가) 너무 깁니다.`);
  return result;
}

function validateThumbnail(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return value;
  } catch {
    // 아래의 사용자용 오류로 통일한다.
  }
  throw new TypeError("썸네일은 http(s) URL 또는 /로 시작하는 경로여야 합니다.");
}

export function parsePostInput(input: PostInput): WritablePost {
  const slug = requiredString(input.slug, "slug", 100);
  if (!SLUG_PATTERN.test(slug)) {
    throw new TypeError("slug는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.");
  }

  const title = requiredString(input.title, "제목", 200);
  const subtitle = optionalString(input.subtitle, "부제", 500);
  const thumbnail = validateThumbnail(optionalString(input.thumbnail, "썸네일", 2_048));
  const thumbnailAlt = optionalString(input.thumbnailAlt, "썸네일 설명", 500);

  if (typeof input.publishedAt !== "string" || !input.publishedAt) {
    throw new TypeError("게시 일시를 입력해 주세요.");
  }
  const publishedAt = new Date(input.publishedAt);
  if (Number.isNaN(publishedAt.getTime())) {
    throw new TypeError("게시 일시가 올바르지 않습니다.");
  }

  if (typeof input.bodyMarkdown !== "string" || !input.bodyMarkdown.trim()) {
    throw new TypeError("본문을 입력해 주세요.");
  }
  const bodyMarkdown = input.bodyMarkdown.trim();
  if (Buffer.byteLength(bodyMarkdown, "utf8") > MAX_BODY_BYTES) {
    throw new TypeError("본문은 512 KiB 이하여야 합니다.");
  }

  const draft = input.draft === true || input.draft === "true" || input.draft === "on";

  return {
    slug,
    title,
    subtitle,
    publishedAt,
    thumbnail,
    thumbnailAlt,
    draft,
    bodyMarkdown,
  };
}
