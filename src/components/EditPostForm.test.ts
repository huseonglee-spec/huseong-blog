import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("./EditPostForm.astro", import.meta.url);

describe("EditPostForm", () => {
  it("prefills the current post and saves it through the protected edit endpoint", async () => {
    const source = await readFile(componentUrl, "utf8");

    expect(source).toContain('value={post.data.title}');
    expect(source).toContain('value={post.data.category}');
    expect(source).toContain("{post.bodyMarkdown}</textarea>");
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain("`/api/posts/${encodeURIComponent(post.id)}/`");
    expect(source).toContain("window.location.reload()");
  });
});
