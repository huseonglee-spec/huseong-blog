import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const loginPageUrl = new URL("../../pages/admin/login.astro", import.meta.url);
const loginApiUrl = new URL("../../pages/api/admin/login.ts", import.meta.url);
const adminPageUrl = new URL("../../pages/admin/index.astro", import.meta.url);

describe("administrator navigation", () => {
  it("returns to the blog home after login by default", async () => {
    const [loginPage, loginApi] = await Promise.all([
      readFile(loginPageUrl, "utf8"),
      readFile(loginApiUrl, "utf8"),
    ]);

    expect(loginPage).toContain(
      'safeReturnPath(Astro.url.searchParams.get("next"), "/")',
    );
    expect(loginApi).toContain('safeReturnPath(form.get("next"), "/")');
    expect(loginApi).toContain('if (next !== "/") params.set("next", next)');
  });

  it("does not keep a standalone admin landing page", async () => {
    await expect(access(adminPageUrl)).rejects.toThrow();
  });
});
