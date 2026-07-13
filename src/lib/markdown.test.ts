import { describe, expect, it } from "vitest";

import { renderPostMarkdown } from "./markdown";

describe("renderPostMarkdown", () => {
  it("renders rich Markdown and collects H1-H3 headings for the table of contents", async () => {
    const result = await renderPostMarkdown(`
# 첫 제목

일반 문단과 **굵은 글자**, *기울임*, [링크](https://example.com), ![설명](/image.jpg).

## 같은 제목

> 인용문

### 같은 제목
`);

    expect(result.html).toContain('<h1 id="첫-제목">첫 제목</h1>');
    expect(result.html).toContain("<strong>굵은 글자</strong>");
    expect(result.headings).toEqual([
      { depth: 1, slug: "첫-제목", text: "첫 제목" },
      { depth: 2, slug: "같은-제목", text: "같은 제목" },
      { depth: 3, slug: "같은-제목-1", text: "같은 제목" },
    ]);
  });

  it("renders explicit YouTube and video directives without allowing arbitrary scripts", async () => {
    const result = await renderPostMarkdown(`
::youtube[달리기 영상]{#dQw4w9WgXcQ}

::video[훈련 기록]{src="https://cdn.example.com/run.mp4" poster="/poster.jpg"}

<script>alert("xss")</script>
`);

    expect(result.html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(result.html).toContain('title="달리기 영상"');
    expect(result.html).toContain('src="https://cdn.example.com/run.mp4"');
    expect(result.html).toContain('poster="/poster.jpg"');
    expect(result.html).not.toContain("<script>");
  });
});
