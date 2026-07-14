import type { APIRoute } from "astro";

import {
  isAllowedOrigin,
  sessionCookieName,
} from "../../../lib/server/auth-core";
import {
  deleteAdminSession,
  validCsrfToken,
} from "../../../lib/server/auth";
import {
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "../../../lib/server/request-body";

export const POST: APIRoute = async (context) => {
  if (!isAllowedOrigin(context.request.url, context.request.headers.get("origin"))) {
    return new Response("허용되지 않은 요청입니다.", { status: 403 });
  }

  let form: FormData;
  try {
    form = await readBoundedFormData(context.request, 4_096);
  } catch (error) {
    const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
    return new Response("요청 형식이 올바르지 않습니다.", { status });
  }
  const session = context.locals.adminSession!;
  if (!validCsrfToken(session, form.get("csrfToken"))) {
    return new Response("보안 토큰이 올바르지 않습니다.", { status: 403 });
  }

  const secure = context.url.protocol === "https:";
  const cookieName = sessionCookieName(secure);
  const token = context.cookies.get(cookieName)?.value;
  if (token) await deleteAdminSession(token);
  context.cookies.delete(cookieName, { path: "/" });

  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/login/", "Cache-Control": "no-store" },
  });
};

export const ALL: APIRoute = () =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
