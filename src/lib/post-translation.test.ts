import { describe, expect, it } from "vitest";

import {
  parsePostTranslationInput,
  parsePostTranslationLocale,
  translationLocaleLabel,
} from "./post-translation";

describe("새 언어판 입력", () => {
  it("지원 언어와 번역 제목·본문만 정리한다", () => {
    expect(
      parsePostTranslationInput({
        locale: "ja",
        title: "  新しい題名  ",
        bodyMarkdown: "  첫 문단\r\n\r\n둘째 문단  ",
      }),
    ).toEqual({
      locale: "ja",
      title: "新しい題名",
      bodyMarkdown: "첫 문단\n\n둘째 문단",
    });
    expect(translationLocaleLabel("en")).toBe("English");
    expect(translationLocaleLabel("zh-CN")).toBe("简体中文");
  });

  it("한국어 원문과 지원하지 않는 언어 코드를 받지 않는다", () => {
    expect(() => parsePostTranslationLocale("ko")).toThrow("지원하는 언어를 선택해 주세요.");
    expect(() => parsePostTranslationLocale("fr")).toThrow("지원하는 언어를 선택해 주세요.");
  });

  it("빈 제목·본문과 제한을 넘은 내용을 받지 않는다", () => {
    expect(() =>
      parsePostTranslationInput({ locale: "en", title: "", bodyMarkdown: "본문" }),
    ).toThrow("번역 제목을 입력해 주세요.");
    expect(() =>
      parsePostTranslationInput({ locale: "en", title: "Title", bodyMarkdown: "" }),
    ).toThrow("번역 본문을 입력해 주세요.");
    expect(() =>
      parsePostTranslationInput({
        locale: "en",
        title: "Title",
        bodyMarkdown: "a".repeat(512 * 1024 + 1),
      }),
    ).toThrow("번역 본문은 512 KiB 이하여야 합니다.");
  });
});
