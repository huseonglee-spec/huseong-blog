import type { APIRoute } from "astro";

import { parsePostEditInput, parsePostSlug } from "../../../lib/edit-post";
import { validCsrfToken } from "../../../lib/server/auth";
import { isAllowedOrigin } from "../../../lib/server/auth-core";
import {
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "../../../lib/server/request-body";
import { updatePublishedPost } from "../../../lib/server/update-post";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export const PATCH: APIRoute = async (context) => {
  if (!isAllowedOrigin(context.request.url, context.request.headers.get("origin"))) {
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

  const session = context.locals.adminSession!;
  if (!validCsrfToken(session, form.get("csrfToken"))) {
    return json({ error: "보안 토큰이 올바르지 않습니다." }, 403);
  }

  let slug: string;
  let fields: ReturnType<typeof parsePostEditInput>;
  try {
    slug = parsePostSlug(context.params.slug);
    fields = parsePostEditInput({
      title: form.get("title"),
      category: form.get("category"),
      bodyMarkdown: form.get("bodyMarkdown"),
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." },
      400,
    );
  }

  try {
    const updated = await updatePublishedPost(slug, fields);
    if (!updated) return json({ error: "글을 찾을 수 없습니다." }, 404);
    return json({ location: `/posts/${slug}/#post-${slug}` }, 200);
  } catch (error) {
    console.error("Failed to update post", error);
    return json({ error: "글을 수정하지 못했습니다." }, 500);
  }
};

export const ALL: APIRoute = () =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "PATCH", "Cache-Control": "no-store" },
  });
