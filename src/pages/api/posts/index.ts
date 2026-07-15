import { randomBytes } from "node:crypto";

import type { APIRoute } from "astro";

import { parseNewPostInput, parseSubmissionId } from "../../../lib/new-post";
import { isAllowedOrigin } from "../../../lib/server/auth-core";
import { validCsrfToken } from "../../../lib/server/auth";
import { createPublishedPost } from "../../../lib/server/create-post";
import {
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "../../../lib/server/request-body";

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

  const session = context.locals.adminSession!;
  if (!validCsrfToken(session, form.get("csrfToken"))) {
    return json({ error: "보안 토큰이 올바르지 않습니다." }, 403);
  }

  const input = {
    title: form.get("title"),
    category: form.get("category"),
    bodyMarkdown: form.get("bodyMarkdown"),
  };
  const publishedAt = new Date();

  let post: ReturnType<typeof parseNewPostInput>;
  let submissionId: string;
  try {
    submissionId = parseSubmissionId(form.get("submissionId"));
    post = parseNewPostInput(input, publishedAt, randomBytes(4).toString("hex"));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." },
      400,
    );
  }

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const savedSlug = await createPublishedPost(post, submissionId);
      if (savedSlug) {
        return json({ location: `/?published=${savedSlug}#post-${savedSlug}` }, 201);
      }
      if (attempt < 2) {
        post = parseNewPostInput(input, publishedAt, randomBytes(4).toString("hex"));
      }
    }
    return json({ error: "글 주소를 만들지 못했습니다. 다시 시도해 주세요." }, 409);
  } catch (error) {
    console.error("Failed to publish inline post", error);
    return json({ error: "글을 게시하지 못했습니다." }, 500);
  }
};

export const ALL: APIRoute = () =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
