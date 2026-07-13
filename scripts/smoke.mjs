import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

import { chromium } from "playwright-core";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4321";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: true,
});

await mkdir("artifacts", { recursive: true });

try {
  for (const scenario of [
    { name: "desktop", width: 1440, height: 1200 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({
      viewport: { width: scenario.width, height: scenario.height },
      deviceScaleFactor: 1,
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    const state = await page.evaluate(() => {
      const titleLink = document.querySelector(".post-title-link");

      return {
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        articleCount: document.querySelectorAll("[data-post]").length,
        title: titleLink?.textContent?.trim(),
        bodyText: document.querySelector(".post-body")?.textContent?.trim(),
        date: document.querySelector("time")?.textContent?.trim(),
        permalink: titleLink?.getAttribute("href"),
        topLevelHeader: Boolean(document.querySelector("body > header")),
        menu: Boolean(document.querySelector("body > nav")),
      };
    });

    assert.equal(state.innerWidth, scenario.width);
    assert.ok(
      state.scrollWidth <= state.innerWidth,
      `${scenario.name}: horizontal overflow (${state.scrollWidth} > ${state.innerWidth})`,
    );
    assert.equal(state.articleCount, 1);
    assert.equal(state.title, "언어가 사고를 지배한다.");
    assert.match(state.bodyText ?? "", /언어는 사고라는 본질/);
    assert.equal(state.date, "2026년 7월 13일");
    assert.equal(state.permalink, "/posts/language-controls-thought/");
    assert.equal(state.topLevelHeader, false);
    assert.equal(state.menu, false);

    await page.screenshot({
      path: `artifacts/${scenario.name}.png`,
      fullPage: true,
    });
    await page.close();

    console.log(`${scenario.name}:`, state);
  }

  const directPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  const response = await directPage.goto(
    `${baseUrl}/posts/language-controls-thought/`,
    { waitUntil: "networkidle" },
  );

  assert.equal(response?.status(), 200);
  assert.equal(
    await directPage.locator("[data-feed]").getAttribute("data-active-slug"),
    "language-controls-thought",
  );
  assert.equal(await directPage.locator("[data-post]").count(), 1);
  console.log("direct permalink: 200 and active post rendered in feed");
  await directPage.close();
} finally {
  await browser.close();
}
