import {
  postTranslationHref,
  translationLocaleLabel,
  type PostTranslationLocale,
} from "./post-translation";
import { postHref } from "./posts";

export const READER_LOCALE_COOKIE = "huseong_reader_locale";
export const READER_LOCALES = ["ko", "en", "ja", "zh-CN"] as const;

export type ReaderLocale = (typeof READER_LOCALES)[number];

function parseReaderLocale(value: unknown): ReaderLocale | undefined {
  return typeof value === "string" && READER_LOCALES.includes(value as ReaderLocale)
    ? value as ReaderLocale
    : undefined;
}

function localeFromLanguageTag(tag: string): ReaderLocale {
  const primary = tag.trim().toLowerCase().split("-")[0];
  if (primary === "ko") return "ko";
  if (primary === "ja") return "ja";
  if (primary === "zh") return "zh-CN";
  return "en";
}

function primaryBrowserLocale(acceptLanguage?: string | null): ReaderLocale {
  const candidates = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...parameters] = part.trim().split(";");
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1;
      return {
        tag,
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter(({ tag, quality }) => Boolean(tag) && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  return localeFromLanguageTag(candidates[0]?.tag ?? "en");
}

export function readerLocalePreferenceOrder(
  savedLocale?: unknown,
  acceptLanguage?: string | null,
): ReaderLocale[] {
  const preferred = parseReaderLocale(savedLocale) ?? primaryBrowserLocale(acceptLanguage);
  if (preferred === "ko") return ["ko"];
  if (preferred === "ja") return ["ja", "en", "ko"];
  if (preferred === "zh-CN") return ["zh-CN", "en", "ko"];
  return ["en", "ko"];
}

export function selectReaderLocale(
  availableLocales: readonly ReaderLocale[],
  savedLocale?: unknown,
  acceptLanguage?: string | null,
): ReaderLocale {
  const available = new Set<ReaderLocale>(["ko", ...availableLocales]);
  return readerLocalePreferenceOrder(savedLocale, acceptLanguage)
    .find((locale) => available.has(locale)) ?? "ko";
}

export function selectReaderLocalesByPost(
  postSlugs: readonly string[],
  availableTranslationLocalesByPost: Record<string, readonly PostTranslationLocale[]>,
  savedLocale?: unknown,
  acceptLanguage?: string | null,
): Record<string, ReaderLocale> {
  return Object.fromEntries(
    postSlugs.map((slug) => [
      slug,
      selectReaderLocale(
        ["ko", ...(availableTranslationLocalesByPost[slug] ?? [])],
        savedLocale,
        acceptLanguage,
      ),
    ]),
  );
}

export function readerLocaleLabel(locale: ReaderLocale): string {
  return locale === "ko" ? "한국어" : translationLocaleLabel(locale);
}

export function readerLocaleHref(slug: string, locale: ReaderLocale): string {
  return locale === "ko" ? postHref(slug) : postTranslationHref(slug, locale);
}

export function asPostTranslationLocale(
  locale: ReaderLocale,
): PostTranslationLocale | undefined {
  return locale === "ko" ? undefined : locale;
}
