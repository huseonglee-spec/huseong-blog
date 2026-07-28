import type { APIRoute } from "astro";

import { parsePostSlug } from "../../../../lib/edit-post";
import {
  parsePostTranslationInput,
  postTranslationHref,
  type PublishablePostTranslation,
} from "../../../../lib/post-translation";
import { postStudySourceHash } from "../../../../lib/post-study";
import { validCsrfToken } from "../../../../lib/server/auth";
import { isAllowedOrigin } from "../../../../lib/server/auth-core";
import { requestPostStudyGeneration } from "../../../../lib/server/post-study";
import { publishPostTranslation } from "../../../../lib/server/publish-post-translation";
import {
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "../../../../lib/server/request-body";
import { updatePostTranslation } from "../../../../lib/server/update-post-translation";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function requestStudyGeneration(
  slug: string,
  translation: PublishablePostTranslation,
): Promise<void> {
  try {
    await requestPostStudyGeneration(
      slug,
      translation.locale,
      postStudySourceHash(translation.title, translation.bodyMarkdown),
    );
  } catch (error) {
    console.error("Failed to queue post study generation", error);
  }
}

export const POST: APIRoute = async (context) => {
  const session = context.locals.adminSession;
  if (!session) return json({ error: "로그인이 필요합니다." }, 401);

  if (!isAllowedOrigin(context.request.url, context.request.headers.get("origin"))) {
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  }

  let form: FormData;
  try {
    form = await readBoundedFormData(context.request, 600_000);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: "번역 본문이 너무 큽니다." }, 413);
    }
    return json({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }

  if (!validCsrfToken(session, form.get("csrfToken"))) {
    return json({ error: "보안 토큰이 올바르지 않습니다." }, 403);
  }

  let slug: string;
  let translation: ReturnType<typeof parsePostTranslationInput>;
  try {
    slug = parsePostSlug(context.params.slug);
    translation = parsePostTranslationInput({
      locale: form.get("locale"),
      title: form.get("title"),
      bodyMarkdown: form.get("bodyMarkdown"),
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." },
      400,
    );
  }

  try {
    const status = await publishPostTranslation(slug, translation);
    if (status === "missing") return json({ error: "글을 찾을 수 없습니다." }, 404);
    if (status === "exists") {
      return json({ error: "이미 발행된 언어판입니다. 기존 언어판은 변경하지 않았습니다." }, 409);
    }
    await requestStudyGeneration(slug, translation);
    return json(
      { location: `${postTranslationHref(slug, translation.locale)}#post-${slug}` },
      201,
    );
  } catch (error) {
    console.error("Failed to publish post translation", error);
    return json({ error: "언어판을 발행하지 못했습니다." }, 500);
  }
};

export const PATCH: APIRoute = async (context) => {
  const session = context.locals.adminSession;
  if (!session) return json({ error: "로그인이 필요합니다." }, 401);

  if (!isAllowedOrigin(context.request.url, context.request.headers.get("origin"))) {
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  }

  let form: FormData;
  try {
    form = await readBoundedFormData(context.request, 600_000);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: "번역 본문이 너무 큽니다." }, 413);
    }
    return json({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }

  if (!validCsrfToken(session, form.get("csrfToken"))) {
    return json({ error: "보안 토큰이 올바르지 않습니다." }, 403);
  }

  let slug: string;
  let translation: ReturnType<typeof parsePostTranslationInput>;
  try {
    slug = parsePostSlug(context.params.slug);
    translation = parsePostTranslationInput({
      locale: form.get("locale"),
      title: form.get("title"),
      bodyMarkdown: form.get("bodyMarkdown"),
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." },
      400,
    );
  }

  try {
    const updated = await updatePostTranslation(slug, translation);
    if (!updated) return json({ error: "언어판을 찾을 수 없습니다." }, 404);
    await requestStudyGeneration(slug, translation);
    return json(
      { location: `${postTranslationHref(slug, translation.locale)}#post-${slug}` },
      200,
    );
  } catch (error) {
    console.error("Failed to update post translation", error);
    return json({ error: "언어판을 수정하지 못했습니다." }, 500);
  }
};

export const ALL: APIRoute = () =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST, PATCH", "Cache-Control": "no-store" },
  });
