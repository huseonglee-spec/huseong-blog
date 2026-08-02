import type { APIRoute } from "astro";

import { parsePostSlug } from "../../../../lib/edit-post";
import { parsePostWritingFeedbackSource } from "../../../../lib/post-writing-feedback";
import { validCsrfToken } from "../../../../lib/server/auth";
import { isAllowedOrigin } from "../../../../lib/server/auth-core";
import {
  dismissPostWritingFeedbackItem,
  getPostWritingFeedback,
  requestPostWritingFeedback,
} from "../../../../lib/server/post-writing-feedback";
import {
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "../../../../lib/server/request-body";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ITEM_KEY_PATTERN = /^[0-9a-f]{64}$/u;

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

function generationId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError("피드백 작업 ID가 올바르지 않습니다.");
  }
  return value;
}

function itemKey(value: unknown): string {
  if (typeof value !== "string" || !ITEM_KEY_PATTERN.test(value)) {
    throw new TypeError("피드백 항목 ID가 올바르지 않습니다.");
  }
  return value;
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
  let requestedGenerationId: string;
  try {
    slug = parsePostSlug(context.params.slug);
    requestedGenerationId = generationId(context.url.searchParams.get("generationId"));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." }, 400);
  }

  try {
    const result = await getPostWritingFeedback(slug, requestedGenerationId);
    if (!result) return json({ error: "피드백 작업을 찾을 수 없습니다." }, 404);
    return json(result, 200);
  } catch (error) {
    console.error("Failed to read post writing feedback", error);
    return json({ error: "피드백 상태를 확인하지 못했습니다." }, 500);
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
    form = await readBoundedFormData(context.request, 600_000);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: "본문이 너무 큽니다." }, 413);
    }
    return json({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }
  if (!validCsrfToken(session, form.get("csrfToken"))) {
    return json({ error: "보안 토큰이 올바르지 않습니다." }, 403);
  }

  let slug: string;
  let source: ReturnType<typeof parsePostWritingFeedbackSource>;
  try {
    slug = parsePostSlug(context.params.slug);
    source = parsePostWritingFeedbackSource({
      locale: form.get("locale"),
      title: form.get("title"),
      bodyMarkdown: form.get("bodyMarkdown"),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." }, 400);
  }

  try {
    const result = await requestPostWritingFeedback(
      slug,
      source,
      form.get("force") === "true",
    );
    if (result.status === "missing") return json({ error: "글을 찾을 수 없습니다." }, 404);
    return json(result, result.status === "queued" ? 202 : 200);
  } catch (error) {
    console.error("Failed to queue post writing feedback", error);
    return json({ error: "피드백을 요청하지 못했습니다." }, 500);
  }
};

export const PATCH: APIRoute = async (context) => {
  const session = context.locals.adminSession;
  if (!session) return json({ error: "로그인이 필요합니다." }, 401);
  if (!sameOriginRequest(context.request)) {
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  }

  let form: FormData;
  try {
    form = await readBoundedFormData(context.request, 16_384);
  } catch {
    return json({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }
  if (!validCsrfToken(session, form.get("csrfToken"))) {
    return json({ error: "보안 토큰이 올바르지 않습니다." }, 403);
  }

  let slug: string;
  let requestedGenerationId: string;
  let requestedItemKey: string;
  try {
    slug = parsePostSlug(context.params.slug);
    requestedGenerationId = generationId(form.get("generationId"));
    requestedItemKey = itemKey(form.get("itemKey"));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." }, 400);
  }

  try {
    const dismissed = await dismissPostWritingFeedbackItem(
      slug,
      requestedGenerationId,
      requestedItemKey,
    );
    if (!dismissed) return json({ error: "피드백 항목을 찾을 수 없습니다." }, 404);
    return json({ dismissed: true }, 200);
  } catch (error) {
    console.error("Failed to dismiss post writing feedback", error);
    return json({ error: "피드백 항목을 숨기지 못했습니다." }, 500);
  }
};

export const ALL: APIRoute = () =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "GET, POST, PATCH", "Cache-Control": "no-store" },
  });
