import type { APIRoute } from "astro";

import { parsePostSlug } from "../../../../../lib/edit-post";
import { parsePostTranslationLocale } from "../../../../../lib/post-translation";
import { validCsrfToken } from "../../../../../lib/server/auth";
import { isAllowedOrigin } from "../../../../../lib/server/auth-core";
import { dismissPostStudyItem } from "../../../../../lib/server/post-study";
import { readBoundedFormData } from "../../../../../lib/server/request-body";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export const POST: APIRoute = async (context) => {
  const session = context.locals.adminSession;
  if (!session) return json({ error: "로그인이 필요합니다." }, 401);
  if (!isAllowedOrigin(context.request.url, context.request.headers.get("origin"))) {
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
  let locale: ReturnType<typeof parsePostTranslationLocale>;
  let itemKey: string;
  try {
    slug = parsePostSlug(context.params.slug);
    locale = parsePostTranslationLocale(form.get("locale"));
    const itemKeyValue = form.get("itemKey");
    if (typeof itemKeyValue !== "string" || !itemKeyValue.trim() || itemKeyValue.length > 240) {
      throw new TypeError("숨길 학습 항목이 올바르지 않습니다.");
    }
    itemKey = itemKeyValue.trim();
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." },
      400,
    );
  }

  try {
    const dismissed = await dismissPostStudyItem(slug, locale, itemKey);
    if (!dismissed) return json({ error: "학습 항목을 찾을 수 없습니다." }, 404);
    return json({ dismissed: true }, 200);
  } catch (error) {
    console.error("Failed to dismiss post study item", error);
    return json({ error: "학습 항목을 숨기지 못했습니다." }, 500);
  }
};

export const ALL: APIRoute = () =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
