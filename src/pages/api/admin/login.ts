import type { APIRoute } from "astro";

import {
  isAllowedOrigin,
  sessionCookieName,
  sessionCookieOptions,
} from "../../../lib/server/auth-core";
import { loginWithPassword } from "../../../lib/server/auth";
import {
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "../../../lib/server/request-body";

function redirect(location: string, status = 303, headers: HeadersInit = {}): Response {
  return new Response(null, {
    status,
    headers: { Location: location, "Cache-Control": "no-store", ...headers },
  });
}

export const POST: APIRoute = async (context) => {
  if (!isAllowedOrigin(context.request.url, context.request.headers.get("origin"))) {
    return new Response("허용되지 않은 요청입니다.", { status: 403 });
  }

  let form: FormData;
  try {
    form = await readBoundedFormData(context.request, 4_096);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return new Response("요청이 너무 큽니다.", { status: 413 });
    }
    return redirect("/admin/login/?error=invalid");
  }
  const password = form.get("password");
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > 1_024) {
    return redirect("/admin/login/?error=invalid");
  }

  let clientAddress = "unknown";
  try {
    clientAddress = context.clientAddress;
  } catch {
    // adapter가 주소를 제공하지 않는 로컬 환경은 별도 공용 bucket을 사용한다.
  }

  const secure = context.url.protocol === "https:";
  const cookieName = sessionCookieName(secure);
  const previousToken = context.cookies.get(cookieName)?.value;
  const result = await loginWithPassword(password, clientAddress, previousToken);

  if (result.status === "limited") {
    return redirect("/admin/login/?error=limited", 303, {
      "Retry-After": String(result.retryAfter),
    });
  }
  if (result.status === "invalid") {
    return redirect("/admin/login/?error=invalid");
  }

  context.cookies.set(cookieName, result.token, sessionCookieOptions(secure));
  return redirect("/admin/");
};

export const ALL: APIRoute = () =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
