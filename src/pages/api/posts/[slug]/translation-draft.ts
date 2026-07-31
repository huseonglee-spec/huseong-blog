import type { APIRoute } from "astro";

import { parsePostSlug } from "../../../../lib/edit-post";
import { parsePostTranslationLocale } from "../../../../lib/post-translation";
import { validCsrfToken } from "../../../../lib/server/auth";
import { isAllowedOrigin } from "../../../../lib/server/auth-core";
import {
  getPostTranslationDraft,
  requestPostTranslationDraft,
} from "../../../../lib/server/post-translation-draft";
import {
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "../../../../lib/server/request-body";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function sameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) return isAllowedOrigin(request.url, origin);
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return isAllowedOrigin(request.url, new URL(referer).origin);
  } catch {
    return false;
  }
}

export const GET: APIRoute = async (context) => {
  const session = context.locals.adminSession;
  if (!session) return json({ error: "로그인이 필요합니다." }, 401);
  if (!sameOriginRequest(context.request)) {
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  }
  if (!validCsrfToken(session, context.request.headers.get("x-csrf-token"))) {
    return json({ error: "보안 토큰이 올바르지 않습니다." }, 403);
  }

  let slug: string;
  let locale: ReturnType<typeof parsePostTranslationLocale>;
  try {
    slug = parsePostSlug(context.params.slug);
    locale = parsePostTranslationLocale(context.url.searchParams.get("locale"));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." },
      400,
    );
  }

  try {
    const draft = await getPostTranslationDraft(slug, locale);
    if (!draft) return json({ error: "글을 찾을 수 없습니다." }, 404);
    return json(draft, 200);
  } catch (error) {
    console.error("Failed to read post translation draft", error);
    return json({ error: "번역 초안 상태를 확인하지 못했습니다." }, 500);
  }
};

export const POST: APIRoute = async (context) => {
  const session = context.locals.adminSession;
  if (!session) return json({ error: "로그인이 필요합니다." }, 401);
  if (!sameOriginRequest(context.request)) {
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  }

  let form: FormData;
  try {
    form = await readBoundedFormData(context.request, 16_384);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: "요청 본문이 너무 큽니다." }, 413);
    }
    return json({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }
  if (!validCsrfToken(session, form.get("csrfToken"))) {
    return json({ error: "보안 토큰이 올바르지 않습니다." }, 403);
  }

  let slug: string;
  let locale: ReturnType<typeof parsePostTranslationLocale>;
  try {
    slug = parsePostSlug(context.params.slug);
    locale = parsePostTranslationLocale(form.get("locale"));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." },
      400,
    );
  }

  try {
    const result = await requestPostTranslationDraft(slug, locale);
    if (result.status === "missing") return json({ error: "글을 찾을 수 없습니다." }, 404);
    if (result.status === "published") {
      return json({ error: "이미 발행된 언어판입니다." }, 409);
    }
    return json(result, result.status === "queued" ? 202 : 200);
  } catch (error) {
    console.error("Failed to queue post translation draft", error);
    return json({ error: "번역 초안 생성을 요청하지 못했습니다." }, 500);
  }
};

export const ALL: APIRoute = () =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "GET, POST", "Cache-Control": "no-store" },
  });
