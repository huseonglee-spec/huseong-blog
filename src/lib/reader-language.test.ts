import { describe, expect, it } from "vitest";

import {
  READER_LOCALE_COOKIE,
  readerLocalePreferenceOrder,
  selectReaderLocale,
  selectReaderLocalesByPost,
} from "./reader-language";

describe("독자 언어 우선 선택", () => {
  const allLocales = ["ko", "en", "ja", "zh-CN"] as const;

  it("한국어·일본어·중국어 브라우저를 대응하는 언어판에 연결한다", () => {
    expect(selectReaderLocale(allLocales, undefined, "ko-KR,ko;q=0.9,en;q=0.8")).toBe("ko");
    expect(selectReaderLocale(allLocales, undefined, "ja-JP,ja;q=0.9,en;q=0.8")).toBe("ja");
    expect(selectReaderLocale(allLocales, undefined, "zh-TW,zh;q=0.9,en;q=0.8")).toBe("zh-CN");
  });

  it("그 밖의 브라우저 언어는 English를 우선하고 없으면 한국어를 보여준다", () => {
    expect(selectReaderLocale(["ko", "en"], undefined, "fr-CA,fr;q=0.9")).toBe("en");
    expect(selectReaderLocale(["ko"], undefined, "fr-CA,fr;q=0.9")).toBe("ko");
    expect(selectReaderLocale(["ko"], undefined, "ja-JP")).toBe("ko");
  });

  it("일본어·중국어판이 없으면 English 다음 한국어 순서로 fallback한다", () => {
    expect(selectReaderLocale(["ko", "en"], undefined, "ja-JP")).toBe("en");
    expect(selectReaderLocale(["ko", "en"], undefined, "zh-CN")).toBe("en");
    expect(readerLocalePreferenceOrder(undefined, "ja-JP")).toEqual(["ja", "en", "ko"]);
  });

  it("독자가 직접 저장한 선택을 브라우저 언어보다 우선한다", () => {
    expect(selectReaderLocale(allLocales, "ko", "ja-JP")).toBe("ko");
    expect(selectReaderLocale(allLocales, "zh-CN", "ko-KR")).toBe("zh-CN");
    expect(READER_LOCALE_COOKIE).toBe("huseong_reader_locale");
  });

  it("Accept-Language의 품질값 순서를 지키고 잘못된 저장값은 무시한다", () => {
    expect(readerLocalePreferenceOrder(undefined, "ja;q=0.4,en-US;q=0.9,ko;q=0.7")).toEqual(["en", "ko"]);
    expect(selectReaderLocale(allLocales, "not-a-locale", "ja-JP")).toBe("ja");
  });

  it("같은 독자 우선순위를 글마다 실제 존재하는 언어판에 맞춰 적용한다", () => {
    expect(selectReaderLocalesByPost(
      ["all", "english", "korean"],
      { all: ["en", "ja"], english: ["en"] },
      undefined,
      "ja-JP",
    )).toEqual({ all: "ja", english: "en", korean: "ko" });
  });
});
