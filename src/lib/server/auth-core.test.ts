import { describe, expect, it } from "vitest";

import {
  adminRouteKind,
  hashToken,
  isAllowedOrigin,
  loginRetryAfter,
  needsAdminSession,
  safeReturnPath,
  sessionCookieOptions,
  tokensMatch,
} from "./auth-core";

describe("administrator authentication helpers", () => {
  it("classifies public and protected administrator routes", () => {
    expect(adminRouteKind("/admin/login/")).toBe("public");
    expect(adminRouteKind("/api/admin/login/")).toBe("public");
    expect(adminRouteKind("/admin/")).toBe("page");
    expect(adminRouteKind("/api/admin/logout/")).toBe("api");
    expect(adminRouteKind("/api/posts/")).toBe("api");
    expect(adminRouteKind("/api/posts/example/")).toBe("api");
    expect(adminRouteKind("/api/posts/example/delete/")).toBe("none");
    expect(adminRouteKind("/admin/posts/new/")).toBe("none");
    expect(adminRouteKind("/api/admin/posts/")).toBe("none");
    expect(adminRouteKind("/posts/example/")).toBe("none");
  });

  it("hydrates sessions only where administrator controls can appear", () => {
    expect(needsAdminSession("/")).toBe(true);
    expect(needsAdminSession("/posts/example/")).toBe(true);
    expect(needsAdminSession("/api/posts/example/")).toBe(true);
    expect(needsAdminSession("/sitemap.xml")).toBe(false);
  });

  it("requires an exact same-origin value", () => {
    expect(isAllowedOrigin("https://huseong.com/admin/", "https://huseong.com")).toBe(true);
    expect(isAllowedOrigin("https://huseong.com/admin/", "https://huseong.com.evil.test")).toBe(false);
    expect(isAllowedOrigin("https://huseong.com/admin/", null)).toBe(false);
  });

  it("accepts only local login return paths", () => {
    expect(safeReturnPath("/?compose=1#new-post", "/admin/")).toBe("/?compose=1#new-post");
    expect(safeReturnPath("https://evil.example/", "/admin/")).toBe("/admin/");
    expect(safeReturnPath("//evil.example/", "/admin/")).toBe("/admin/");
    expect(safeReturnPath(null, "/admin/")).toBe("/admin/");
  });

  it("applies both per-IP and global login attempt limits", () => {
    expect(loginRetryAfter(5, 20)).toBeNull();
    expect(loginRetryAfter(6, 1)).toBe(15 * 60);
    expect(loginRetryAfter(1, 21)).toBe(60);
    expect(loginRetryAfter(6, 21)).toBe(15 * 60);
  });

  it("creates production and local cookie settings safely", () => {
    expect(sessionCookieOptions(true)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    });
    expect(sessionCookieOptions(false)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: "/",
    });
  });

  it("hashes session tokens and compares CSRF tokens safely", () => {
    expect(hashToken("secret-session-token")).not.toContain("secret-session-token");
    expect(hashToken("secret-session-token")).toHaveLength(43);
    expect(tokensMatch("same-token", "same-token")).toBe(true);
    expect(tokensMatch("same-token", "different-token")).toBe(false);
  });
});
