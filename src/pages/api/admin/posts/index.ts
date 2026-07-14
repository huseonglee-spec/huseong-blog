import type { APIRoute } from "astro";

import { parsePostInput } from "../../../../lib/post-input";
import { isAllowedOrigin } from "../../../../lib/server/auth-core";
import { validCsrfToken } from "../../../../lib/server/auth";
import { createAdminPost } from "../../../../lib/server/admin-posts";
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

  let post: ReturnType<typeof parsePostInput>;
  try {
    post = parsePostInput(Object.fromEntries(form.entries()));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." },
      400,
    );
  }

  try {
    const result = await createAdminPost(post);
    if (result === "duplicate") {
      return json({ error: "같은 slug의 글이 이미 있습니다." }, 409);
    }
    return json({ location: `/admin/posts/${post.slug}/edit/?created=1` }, 201);
  } catch (error) {
    console.error("Failed to create administrator post", error);
    return json({ error: "글을 저장하지 못했습니다." }, 500);
  }
};

export const ALL: APIRoute = () =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
