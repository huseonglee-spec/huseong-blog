import { createHash } from "node:crypto";

import {
  postTranslationModelLocale,
  type PostTranslationLocale,
  type PostTranslationModelLocale,
} from "./post-translation";

export const POST_TRANSLATION_PROMPT_VERSION = 1;
export const POST_TRANSLATION_MAX_TRANSIENT_ATTEMPTS = 4;
export const POST_TRANSLATION_MAX_INVALID_OUTPUT_ATTEMPTS = 2;

export const MULTILINGUAL_BLOG_TRANSLATION_CONTRACT = `Multilingual Blog Translation System

You translate personal blog writing from its source language into the requested target language.

Your task is not merely to transfer information. Recreate the author’s thought, voice, structure, intensity, restraint, ambiguity, and rhythm in the target language.

Input
SOURCE_LANGUAGE: language of the original text
TARGET_LOCALE: en, ja, zh-Hans, or zh-Hant
CONTENT_FORMAT: plain, markdown, mdx, or html
OUTPUT_MODE: publish or review
STYLE_PROFILE: optional instructions specific to the current piece
GLOSSARY: optional required translations
SOURCE_DOCUMENT: the original document
Translation Priorities

When several translations are possible, use this order:

Preserve the author’s exact idea.
Preserve the author’s stance and relationship to the reader.
Preserve the original intensity, restraint, and ambiguity.
Preserve rhythm, repetition, compression, and paragraph structure.
Make the result intentional and readable in the target language.
Prefer conventional fluency only after the above conditions are satisfied.

Fidelity does not mean word-for-word translation. It means preserving what the original expression is doing.

Authorial Integrity
Do not flatten the writing into generic polished prose.
Do not turn it into motivational, self-help, academic, corporate, or promotional language.
Do not add explanations, examples, implications, transitions, or conclusions absent from the source.
Do not remove meaningful repetition, hesitation, bluntness, ambiguity, or silence.
Do not soften absolute or uncomfortable statements.
Do not intensify restrained statements.
Do not make an abstract thought concrete unless the source does so.
Do not replace an unfamiliar concept with a familiar cliché.
Do not make the writing more lyrical, philosophical, mystical, or dramatic than the source.
Do not introduce cultural or philosophical terminology merely because the idea resembles Buddhism, Zen, Taoism, Stoicism, or another tradition.
Preserve whether a sentence is a personal observation, a personal rule, a hypothesis, or advice to the reader.
Never turn a first-person statement into a command simply to make it shorter.

Compression and Literary Form
Prefer simple verbs over long nominal or explanatory constructions.
Use concise expressions when they retain the full meaning.
Preserve deliberate fragments, repetition, parallelism, and line breaks.
Controlled grammatical incompleteness is allowed when it clearly reads as intentional.
Do not produce grammar that looks accidental or makes the intended subject unclear.
Slight strangeness is acceptable when it preserves an important idea or texture.
Productive strangeness is acceptable. Confusion is not.
Do not force every article into a sparse or aphoristic style. Match the density and form of the individual source text.
Apply STYLE_PROFILE only to the current piece. It must not override the source’s meaning.

Language-Specific Rules
English (en)
Use concise, controlled literary English where appropriate.
English normally requires an explicit subject. Do not remove it when doing so creates an unintended imperative.
Sentence fragments may be used deliberately, especially for emphasis, contrast, or rhythm.
Avoid inflated constructions such as “I choose to,” “the act of,” “in order to,” or “it is important to” unless their meaning exists in the source.
Do not replace unusual but precise thoughts with familiar English idioms.
Avoid generic inspirational phrasing.

Japanese (ja)
Omit subjects naturally when their identity remains clear.
Do not repeatedly insert 私, 私は, or other pronouns merely because they appear or are implied in the source.
Preserve the source’s relationship to the reader: plain statement, polite statement, self-address, or direct advice.
For Korean 한다-style prose, normally use consistent Japanese plain-form prose. Do not automatically convert it into polite です・ます style.
Use だ・である only where it suits the rhythm and level of abstraction; do not attach it mechanically to every sentence.
Fragments and noun-ending sentences may be used when they feel deliberate.
Do not make the text artificially poetic, archaic, Zen-like, or proverb-like.
Avoid ornamental kanji compounds when simpler Japanese preserves the meaning better.

Simplified Chinese (zh-Hans)
Use consistent Simplified Chinese characters and contemporary vocabulary.
Omit subjects where Chinese naturally permits it, but preserve first-person perspective when it is conceptually important.
Prefer concise modern prose.
Fragments may be used when their logical relationship remains clear.
Do not convert the writing into slogans, classical Chinese, four-character formulas, or idiomatic expressions absent from the source.
Do not add Chinese philosophical terminology to make the text sound more profound.

Traditional Chinese (zh-Hant)
Use consistent Traditional Chinese characters.
Follow the vocabulary and punctuation conventions of the configured regional locale if one is provided, such as zh-Hant-TW or zh-Hant-HK.
Do not treat Traditional Chinese as a mechanical character conversion from Simplified Chinese.
Apply the same rules concerning subject omission, concise modern prose, fragments, slogans, idioms, and philosophical embellishment as above.

Formatting Integrity
Preserve headings, paragraphs, lists, blockquotes, emphasis, and deliberate line breaks.
Preserve the original heading hierarchy.
Do not translate or modify URLs, code, commands, identifiers, component names, file paths, or placeholders.
Preserve Markdown, MDX, HTML, template, and interpolation syntax exactly.
Translate human-readable link text while leaving its destination unchanged.
Translate image alt text when it is ordinary reader-facing prose.
Do not alter frontmatter keys. Translate only values explicitly marked as translatable.
Follow the GLOSSARY exactly when a required translation is supplied.
Use established target-language names for widely recognized proper nouns. Otherwise, preserve the original name or follow the glossary.

Ambiguity and Tradeoffs
Do not silently resolve meaningful ambiguity.

When no target-language expression can preserve every aspect of the source:
Preserve the central idea and authorial stance.
Choose the expression that introduces the least new meaning.
In review mode, identify the tradeoff briefly.
In publish mode, output only the best translation.

Do not provide alternatives for trivial wording differences.

Final Check
Before returning the translation, verify:
Did I add an idea that was not present?
Did I remove meaningful ambiguity or repetition?
Did I change a personal statement into advice?
Did I soften or intensify the original?
Did I replace the author’s expression with a cliché?
Did I over-explain?
Did I make the prose more poetic or philosophical than intended?
Did I preserve all formatting and non-translatable syntax?
Does every unusual expression feel intentional rather than accidental?

Output
If OUTPUT_MODE is publish:
Return only the translated document.
Do not add introductions, notes, labels, or code fences.

If OUTPUT_MODE is review:
Return the complete translated document first.
Then list only the phrases involving a meaningful semantic or stylistic tradeoff.
For each note, include the source phrase, selected translation, and a brief explanation.`;

export type PostTranslationGenerationStatus =
  | "idle"
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "superseded"
  | "published";

export interface PostTranslationTradeoff {
  sourcePhrase: string;
  selectedTranslation: string;
  reason: string;
}

export interface GeneratedPostTranslation {
  targetLocale: PostTranslationModelLocale;
  title: string;
  bodyMarkdown: string;
  tradeoffs: PostTranslationTradeoff[];
}

export type PostTranslationFailureCode =
  | "model_output_invalid"
  | "model_timeout"
  | "model_unavailable";

export interface PostTranslationRetryDecision {
  retry: boolean;
  delaySeconds: number;
}

interface BuildPostTranslationPromptInput {
  locale: PostTranslationLocale;
  title: string;
  bodyMarkdown: string;
}

interface ParseGeneratedPostTranslationInput extends BuildPostTranslationPromptInput {
  raw: string;
}

const MAX_RAW_OUTPUT_BYTES = 1024 * 1024;
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_TRADEOFFS = 20;
const MAX_TRADEOFF_PHRASE_LENGTH = 400;
const MAX_TRADEOFF_REASON_LENGTH = 800;

export function postTranslationSourceHash(title: string, bodyMarkdown: string): string {
  return createHash("sha256")
    .update(title.normalize("NFC"), "utf8")
    .update("\0", "utf8")
    .update(bodyMarkdown.normalize("NFC"), "utf8")
    .digest("hex");
}

export function parsePostTranslationMaxJobs(value: string | undefined): number {
  if (value === undefined || value === "") return 2;
  if (!/^\d+$/u.test(value)) {
    throw new TypeError("HUSEONG_BLOG_TRANSLATION_MAX_JOBS must be an integer");
  }
  const parsed = Number(value);
  if (parsed < 1 || parsed > 8) {
    throw new RangeError("HUSEONG_BLOG_TRANSLATION_MAX_JOBS must be between 1 and 8");
  }
  return parsed;
}

export function postTranslationRetryDecision(
  code: PostTranslationFailureCode,
  attempts: number,
): PostTranslationRetryDecision {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new RangeError("translation generation attempts must be a positive integer");
  }
  const invalidOutput = code === "model_output_invalid";
  const maximumAttempts = invalidOutput
    ? POST_TRANSLATION_MAX_INVALID_OUTPUT_ATTEMPTS
    : POST_TRANSLATION_MAX_TRANSIENT_ATTEMPTS;
  const delays = invalidOutput ? [60] : [60, 300, 900];
  return {
    retry: attempts < maximumAttempts,
    delaySeconds: delays[Math.min(attempts - 1, delays.length - 1)] ?? 300,
  };
}

export function buildPostTranslationPrompt(input: BuildPostTranslationPromptInput): string {
  const targetLocale = postTranslationModelLocale(input.locale);
  const sourceDocument = JSON.stringify({
    title: input.title,
    bodyMarkdown: input.bodyMarkdown,
  });
  return [
    "Follow the versioned translation contract below without weakening or extending it.",
    "Return exactly one JSON object and no Markdown fence, introduction, or trailing text.",
    `The object must have exactly these keys: {\"targetLocale\":\"${targetLocale}\",\"title\":string,\"bodyMarkdown\":string,\"tradeoffs\":[{\"sourcePhrase\":string,\"selectedTranslation\":string,\"reason\":string}]}.`,
    "Use tradeoffs only for meaningful semantic or stylistic compromises, never trivial alternatives.",
    "Preserve the source body line structure and all non-translatable syntax so automated integrity checks can verify it.",
    "",
    "BEGIN_VERSIONED_TRANSLATION_CONTRACT",
    MULTILINGUAL_BLOG_TRANSLATION_CONTRACT,
    "END_VERSIONED_TRANSLATION_CONTRACT",
    "",
    "SOURCE_LANGUAGE=ko",
    `TARGET_LOCALE=${targetLocale}`,
    "CONTENT_FORMAT=markdown",
    "OUTPUT_MODE=review",
    "SOURCE_DOCUMENT_JSON=",
    sourceDocument,
  ].join("\n");
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index]);
}

function strictString(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > maxLength) {
    throw new TypeError(`${label} 형식이 올바르지 않습니다.`);
  }
  return value;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function matches(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

function lineStructure(markdown: string): string[] {
  let fenced = false;
  return markdown.split("\n").map((line) => {
    const fence = line.match(/^\s*(```+|~~~+)/u)?.[1];
    if (fence) {
      fenced = !fenced;
      return `fence:${fence[0]}`;
    }
    if (fenced) return "code";
    if (!line.trim()) return "blank";
    const marker = line.match(/^(\s*)(#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/u);
    return marker ? `${marker[1].length}:${marker[2].trim()}` : "text";
  });
}

function fencedCode(markdown: string): string[] {
  return matches(markdown, /^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gmu);
}

function markdownDestinations(markdown: string): string[] {
  return [...markdown.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)/gu)]
    .map((match) => match[1] ?? "");
}

function imageAltTexts(markdown: string): string[] {
  return [...markdown.matchAll(/!\[([^\]]*)\]\([^)]*\)/gu)]
    .map((match) => match[1] ?? "");
}

function frontmatterKeys(markdown: string): string[] {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---(?:\n|$)/u)?.[1];
  if (!frontmatter) return [];
  return [...frontmatter.matchAll(/^([A-Za-z0-9_-]+):/gmu)].map((match) => match[1] ?? "");
}

function assertEqualSequence(label: string, source: readonly string[], translated: readonly string[]): void {
  if (source.length !== translated.length || source.some((value, index) => value !== translated[index])) {
    throw new TypeError(`${label} 보존 검증에 실패했습니다.`);
  }
}

export function validatePostTranslationFormatting(
  sourceTitle: string,
  sourceBodyMarkdown: string,
  translatedTitle: string,
  translatedBodyMarkdown: string,
): void {
  assertEqualSequence(
    "Markdown 줄 구조",
    lineStructure(sourceBodyMarkdown),
    lineStructure(translatedBodyMarkdown),
  );
  assertEqualSequence("코드 블록", fencedCode(sourceBodyMarkdown), fencedCode(translatedBodyMarkdown));
  assertEqualSequence(
    "링크 목적지",
    markdownDestinations(sourceBodyMarkdown),
    markdownDestinations(translatedBodyMarkdown),
  );
  assertEqualSequence(
    "frontmatter key",
    frontmatterKeys(sourceBodyMarkdown),
    frontmatterKeys(translatedBodyMarkdown),
  );

  const sourceDocument = `${sourceTitle}\n${sourceBodyMarkdown}`;
  const translatedDocument = `${translatedTitle}\n${translatedBodyMarkdown}`;
  const exactSyntaxPatterns = [
    /`[^`\n]+`/gu,
    /https?:\/\/[^\s)\]}>'"]+/gu,
    /\{\{[\s\S]*?\}\}/gu,
    /\$\{[\s\S]*?\}/gu,
    /<\/?[A-Za-z][^>]*>/gu,
    /(?:^|[\s(])(?:\.{0,2}\/)?[\w.-]+(?:\/[\w.@+-]+)+/gmu,
  ];
  for (const pattern of exactSyntaxPatterns) {
    const required = matches(sourceDocument, pattern).map((value) => value.trimStart());
    const available = matches(translatedDocument, pattern).map((value) => value.trimStart());
    for (const token of required) {
      const index = available.indexOf(token);
      if (index < 0) throw new TypeError("비번역 syntax 보존 검증에 실패했습니다.");
      available.splice(index, 1);
    }
  }

  const sourceEmphasis = matches(sourceBodyMarkdown, /(?:\*\*|__|(?<!\*)\*(?!\*)|(?<!_)_(?!_))/gu);
  const translatedEmphasis = matches(translatedBodyMarkdown, /(?:\*\*|__|(?<!\*)\*(?!\*)|(?<!_)_(?!_))/gu);
  assertEqualSequence("강조 syntax", sourceEmphasis, translatedEmphasis);

  const sourceImages = imageAltTexts(sourceBodyMarkdown);
  const translatedImages = imageAltTexts(translatedBodyMarkdown);
  if (
    sourceImages.length !== translatedImages.length ||
    translatedImages.some((alt, index) => Boolean(sourceImages[index]) && !alt.trim())
  ) {
    throw new TypeError("이미지 alt text 보존 검증에 실패했습니다.");
  }
}

export function parseGeneratedPostTranslation(
  input: ParseGeneratedPostTranslationInput,
): GeneratedPostTranslation {
  if (utf8Bytes(input.raw) > MAX_RAW_OUTPUT_BYTES) {
    throw new TypeError("번역 출력이 너무 큽니다.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.raw.trim()) as unknown;
  } catch {
    throw new TypeError("번역 JSON 형식이 올바르지 않습니다.");
  }
  const payload = objectRecord(parsed);
  if (!payload || !exactKeys(payload, ["targetLocale", "title", "bodyMarkdown", "tradeoffs"])) {
    throw new TypeError("번역 JSON envelope가 올바르지 않습니다.");
  }
  const expectedLocale = postTranslationModelLocale(input.locale);
  if (payload.targetLocale !== expectedLocale) {
    throw new TypeError("번역 locale이 요청과 다릅니다.");
  }
  const title = strictString(payload.title, MAX_TITLE_LENGTH, "번역 제목");
  const bodyMarkdown = strictString(payload.bodyMarkdown, MAX_BODY_BYTES, "번역 본문");
  if (utf8Bytes(bodyMarkdown) > MAX_BODY_BYTES) {
    throw new TypeError("번역 본문은 512 KiB 이하여야 합니다.");
  }
  if (!Array.isArray(payload.tradeoffs) || payload.tradeoffs.length > MAX_TRADEOFFS) {
    throw new TypeError("절충 메모 형식이 올바르지 않습니다.");
  }

  const sourceDocument = `${input.title}\n${input.bodyMarkdown}`;
  const translatedDocument = `${title}\n${bodyMarkdown}`;
  const tradeoffs = payload.tradeoffs.map((candidate) => {
    const tradeoff = objectRecord(candidate);
    if (!tradeoff || !exactKeys(tradeoff, ["sourcePhrase", "selectedTranslation", "reason"])) {
      throw new TypeError("절충 메모 envelope가 올바르지 않습니다.");
    }
    const sourcePhrase = strictString(
      tradeoff.sourcePhrase,
      MAX_TRADEOFF_PHRASE_LENGTH,
      "절충 메모 원문",
    );
    const selectedTranslation = strictString(
      tradeoff.selectedTranslation,
      MAX_TRADEOFF_PHRASE_LENGTH,
      "절충 메모 번역",
    );
    const reason = strictString(
      tradeoff.reason,
      MAX_TRADEOFF_REASON_LENGTH,
      "절충 메모 이유",
    );
    if (!sourceDocument.includes(sourcePhrase) || !translatedDocument.includes(selectedTranslation)) {
      throw new TypeError("절충 메모가 원문 또는 번역에 연결되지 않습니다.");
    }
    return { sourcePhrase, selectedTranslation, reason };
  });

  validatePostTranslationFormatting(input.title, input.bodyMarkdown, title, bodyMarkdown);
  return { targetLocale: expectedLocale, title, bodyMarkdown, tradeoffs };
}
