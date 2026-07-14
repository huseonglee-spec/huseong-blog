import { createHash, timingSafeEqual } from "node:crypto";

export type AdminRouteKind = "none" | "public" | "page" | "api";

export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const LOGIN_IP_LIMIT = 5;
export const LOGIN_GLOBAL_LIMIT = 20;

export function loginRetryAfter(
  ipAttemptCount: number,
  globalAttemptCount: number,
): number | null {
  if (ipAttemptCount > LOGIN_IP_LIMIT) return 15 * 60;
  if (globalAttemptCount > LOGIN_GLOBAL_LIMIT) return 60;
  return null;
}

function withoutTrailingSlash(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

export function adminRouteKind(pathname: string): AdminRouteKind {
  const path = withoutTrailingSlash(pathname);
  if (path === "/admin/login" || path === "/api/admin/login") return "public";
  if (path === "/admin" || path.startsWith("/admin/")) return "page";
  if (path === "/api/admin" || path.startsWith("/api/admin/")) return "api";
  return "none";
}

export function isAllowedOrigin(requestUrl: string, origin: string | null): boolean {
  if (!origin) return false;
  try {
    return new URL(requestUrl).origin === origin;
  } catch {
    return false;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function tokensMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function sessionCookieName(secure: boolean): string {
  return secure ? "__Host-huseong_admin" : "huseong_admin_dev";
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
