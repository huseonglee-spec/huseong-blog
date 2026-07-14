import type { APIRoute } from "astro";

import { parsePostInput } from "../../../../lib/post-input";
import { isAllowedOrigin } from "../../../../lib/server/auth-core";
import { validCsrfToken } from "../../../../lib/server/auth";
import { updateAdminPost } from "../../../../lib/server/admin-posts";
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

export const POST: APIRoute = async (context) => {
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
  if (!validCsrfToken(context.locals.adminSession!, form.get("csrfToken"))) {
    return json({ error: "보안 토큰이 올바르지 않습니다." }, 403);
  }

  const slug = context.params.slug ?? "";
  const revision = Number(form.get("revision"));
  if (!Number.isInteger(revision) || revision < 1) {
    return json({ error: "수정 버전이 올바르지 않습니다. 페이지를 새로고침해 주세요." }, 400);
  }

  let post: ReturnType<typeof parsePostInput>;
  try {
    post = parsePostInput({ ...Object.fromEntries(form.entries()), slug });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." },
      400,
    );
  }

  try {
    const result = await updateAdminPost(slug, revision, post);
    if (result === "missing") return json({ error: "글을 찾을 수 없습니다." }, 404);
    if (result === "conflict") {
      return json({ error: "다른 곳에서 글이 수정되었습니다. 페이지를 새로고침해 주세요." }, 409);
    }
    return json({ location: `/admin/posts/${slug}/edit/?saved=1` }, 200);
  } catch (error) {
    console.error("Failed to update administrator post", error);
    return json({ error: "글을 저장하지 못했습니다." }, 500);
  }
};

export const ALL: APIRoute = () =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
