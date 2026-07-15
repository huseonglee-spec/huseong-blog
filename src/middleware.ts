import { defineMiddleware } from "astro:middleware";

import {
  adminRouteKind,
  sessionCookieName,
} from "./lib/server/auth-core";
import { getAdminSession } from "./lib/server/auth";

export const onRequest = defineMiddleware(async (context, next) => {
  const routeKind = adminRouteKind(context.url.pathname);
  const needsSession = routeKind !== "none" || context.url.pathname === "/";
  if (!needsSession) return next();

  const secure = context.url.protocol === "https:";
  const cookieName = sessionCookieName(secure);
  const token = context.cookies.get(cookieName)?.value;

  if (token) {
    const session = await getAdminSession(token);
    if (session) {
      context.locals.adminSession = session;
    } else {
      context.cookies.delete(cookieName, { path: "/" });
    }
  }

  if (routeKind === "page" && !context.locals.adminSession) {
    return context.redirect("/admin/login/", 303);
  }
  if (routeKind === "api" && !context.locals.adminSession) {
    return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  const response = await next();
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
});
