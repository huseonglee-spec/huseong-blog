import { createHash } from "node:crypto";

import type { PostTranslationLocale } from "./post-translation";

export const POST_STUDY_PROMPT_VERSION = 1;

export type PostStudyItemKind = "word" | "expression";
export type PostStudyGenerationStatus =
  | "idle"
  | "pending"
  | "processing"
  | "ready"
  | "failed";

export interface PostStudyItem {
  itemKey: string;
  kind: PostStudyItemKind;
  text: string;
  reading?: string;
  meaningKo: string;
  noteKo: string;
  context: string;
}

export interface PostStudyPanelView {
  locale: PostTranslationLocale;
  status: PostStudyGenerationStatus;
  items: PostStudyItem[];
  isRefreshing: boolean;
}

interface BuildPostStudyPromptInput {
  locale: PostTranslationLocale;
  title: string;
  bodyMarkdown: string;
  dismissedTexts: readonly string[];
}

interface ParseGeneratedPostStudyItemsInput {
  locale: PostTranslationLocale;
  bodyMarkdown: string;
  raw: string;
}

const MAX_STUDY_TEXT_LENGTH = 120;
const MAX_STUDY_FIELD_LENGTH = 500;
const MAX_PROMPT_BODY_LENGTH = 30_000;

function normalizeComparableText(locale: PostTranslationLocale, value: string): string {
  let normalized = value
    .normalize("NFKC")
    .replace(/[‘’]/gu, "'")
    .trim();
  if (locale === "en") normalized = normalized.toLocaleLowerCase("en");
  return normalized
    .replace(/'/gu, "")
    .replace(/[\p{P}\p{S}_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizePostStudyItemKey(
  locale: PostTranslationLocale,
  text: string,
): string {
  const normalized = normalizeComparableText(locale, text);
  if (!normalized) throw new TypeError("학습 항목이 비어 있습니다.");
  return `${locale}:${normalized}`;
}

export function postStudySourceHash(title: string, bodyMarkdown: string): string {
  return createHash("sha256")
    .update(title.normalize("NFC"), "utf8")
    .update("\0", "utf8")
    .update(bodyMarkdown.normalize("NFC"), "utf8")
    .digest("hex");
}

export function buildPostStudyPrompt(input: BuildPostStudyPromptInput): string {
  const levelRule = input.locale === "en"
    ? [
        "영어 학습자는 중급이다.",
        "본문에 실제 나온 B1-B2 수준의 단어, 숙어, 관용 표현을 8~14개 고른다.",
        "A1-A2 기본 단어는 제외한다. 다만 쉬운 단어가 묶여 특별한 뜻이 되는 표현은 포함할 수 있다.",
        "reading은 null로 둔다.",
      ].join("\n")
    : input.locale === "ja"
      ? [
          "일본어 학습자는 완전 초급이다.",
          "본문에 실제 나온 아주 쉬운 기본 단어, 조사와 짧은 표현까지 10~18개 고른다.",
          "reading에는 해당 단어 또는 표현의 히라가나 읽기를 적는다.",
        ].join("\n")
      : [
          "중국어 학습자는 완전 초급이다.",
          "본문에 실제 나온 아주 쉬운 기본 단어와 짧은 표현까지 10~18개 고른다.",
          "reading에는 성조가 표시된 병음을 적는다.",
        ].join("\n");
  const dismissed = input.dismissedTexts.length > 0
    ? input.dismissedTexts.slice(0, 200).map((text) => `- ${text}`).join("\n")
    : "- 없음";
  const body = input.bodyMarkdown.slice(0, MAX_PROMPT_BODY_LENGTH);

  return [
    "아래 블로그 언어판에서 작성자가 공부할 단어와 표현을 골라라.",
    "도구를 사용하지 말고 설명 문장이나 Markdown 없이 JSON 객체 하나만 출력한다.",
    levelRule,
    "모든 text와 context는 반드시 제공된 본문에 실제로 나타난 문자열이어야 한다.",
    "meaningKo는 짧은 한국어 뜻이고, noteKo는 이 글의 문맥에서 왜 이렇게 쓰였는지 쉬운 한국어로 설명한다.",
    "kind는 word 또는 expression만 사용한다.",
    "이미 배워서 숨긴 항목은 철자, 대소문자, 문장부호가 조금 달라도 다시 고르지 않는다.",
    "출력 형식:",
    '{"items":[{"kind":"word|expression","text":"본문의 원문","reading":null,"meaningKo":"한국어 뜻","noteKo":"문맥 설명","context":"본문의 짧은 구절"}]}',
    "",
    `언어: ${input.locale}`,
    `제목: ${input.title}`,
    "이미 숨긴 항목:",
    dismissed,
    "",
    "본문:",
    body,
  ].join("\n");
}

function trimString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
}

function extractJsonObject(raw: string): unknown {
  const withoutFence = raw
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end < start) throw new TypeError("학습 항목 JSON을 찾지 못했습니다.");
  return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function appearsInBody(
  locale: PostTranslationLocale,
  bodyMarkdown: string,
  text: string,
): boolean {
  const normalizedBody = normalizeComparableText(locale, bodyMarkdown);
  const normalizedText = normalizeComparableText(locale, text);
  if (!normalizedText) return false;
  if (locale === "en") {
    return ` ${normalizedBody.trim()} `.includes(` ${normalizedText.trim()} `);
  }
  return normalizedBody.includes(normalizedText);
}

export function parseGeneratedPostStudyItems(
  input: ParseGeneratedPostStudyItemsInput,
): PostStudyItem[] {
  const payload = record(extractJsonObject(input.raw));
  if (!payload || !Array.isArray(payload.items)) {
    throw new TypeError("학습 항목 JSON 형식이 올바르지 않습니다.");
  }

  const seen = new Set<string>();
  const items: PostStudyItem[] = [];
  for (const candidate of payload.items.slice(0, 24)) {
    const item = record(candidate);
    if (!item || (item.kind !== "word" && item.kind !== "expression")) continue;
    const text = trimString(item.text, MAX_STUDY_TEXT_LENGTH);
    const meaningKo = trimString(item.meaningKo, MAX_STUDY_FIELD_LENGTH);
    const noteKo = trimString(item.noteKo, MAX_STUDY_FIELD_LENGTH);
    const rawContext = trimString(item.context, MAX_STUDY_FIELD_LENGTH);
    if (!text || !meaningKo || !noteKo || !rawContext) continue;
    if (!appearsInBody(input.locale, input.bodyMarkdown, text)) continue;
    const context = appearsInBody(input.locale, input.bodyMarkdown, rawContext)
      ? rawContext
      : text;
    const itemKey = normalizePostStudyItemKey(input.locale, text);
    if (seen.has(itemKey)) continue;
    seen.add(itemKey);
    const reading = trimString(item.reading, MAX_STUDY_TEXT_LENGTH);
    items.push({
      itemKey,
      kind: item.kind,
      text,
      ...(reading ? { reading } : {}),
      meaningKo,
      noteKo,
      context,
    });
  }
  return items;
}
