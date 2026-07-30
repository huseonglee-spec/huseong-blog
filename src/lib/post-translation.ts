import { normalizePostBodyMarkdown } from "./edit-post";
import { postHref } from "./posts";

export const POST_TRANSLATION_LOCALES = ["en", "ja", "zh-CN"] as const;

export type PostTranslationLocale = (typeof POST_TRANSLATION_LOCALES)[number];
export type PostTranslationModelLocale = "en" | "ja" | "zh-Hans";

const TRANSLATION_LOCALE_LABELS: Record<PostTranslationLocale, string> = {
  en: "English",
  ja: "日本語",
  "zh-CN": "简体中文",
};

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_BYTES = 512 * 1024;

export interface PostTranslationInput {
  locale?: unknown;
  title?: unknown;
  bodyMarkdown?: unknown;
}

export interface PublishablePostTranslation {
  locale: PostTranslationLocale;
  title: string;
  bodyMarkdown: string;
}

export function parsePostTranslationLocale(value: unknown): PostTranslationLocale {
  if (
    typeof value !== "string" ||
    !POST_TRANSLATION_LOCALES.includes(value as PostTranslationLocale)
  ) {
    throw new TypeError("지원하는 언어를 선택해 주세요.");
  }
  return value as PostTranslationLocale;
}

export function translationLocaleLabel(locale: PostTranslationLocale): string {
  return TRANSLATION_LOCALE_LABELS[locale];
}

export function postTranslationModelLocale(
  locale: PostTranslationLocale,
): PostTranslationModelLocale {
  return locale === "zh-CN" ? "zh-Hans" : locale;
}

export function postTranslationHref(
  slug: string,
  locale: PostTranslationLocale,
): string {
  return `${postHref(slug)}?lang=${encodeURIComponent(locale)}`;
}

export function parsePostTranslationInput(
  input: PostTranslationInput,
): PublishablePostTranslation {
  const locale = parsePostTranslationLocale(input.locale);

  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new TypeError("번역 제목을 입력해 주세요.");
  }
  const title = input.title.trim();
  if (title.length > MAX_TITLE_LENGTH) {
    throw new TypeError("번역 제목이 너무 깁니다.");
  }

  if (typeof input.bodyMarkdown !== "string" || !input.bodyMarkdown.trim()) {
    throw new TypeError("번역 본문을 입력해 주세요.");
  }
  const bodyMarkdown = normalizePostBodyMarkdown(input.bodyMarkdown);
  if (new TextEncoder().encode(bodyMarkdown).byteLength > MAX_BODY_BYTES) {
    throw new TypeError("번역 본문은 512 KiB 이하여야 합니다.");
  }

  return { locale, title, bodyMarkdown };
}
