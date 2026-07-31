import type { APIRoute } from "astro";

import { parsePostSlug } from "../../../../lib/edit-post";
import { POST_TRANSLATION_PROMPT_VERSION } from "../../../../lib/post-translation-generation";
import {
  parsePostTranslationInput,
  postTranslationHref,
} from "../../../../lib/post-translation";
import { validCsrfToken } from "../../../../lib/server/auth";
import { isAllowedOrigin } from "../../../../lib/server/auth-core";
import { requestPostStudyGeneration } from "../../../../lib/server/post-study";
import {
  publishPostTranslation,
  type PostTranslationDraftPublication,
} from "../../../../lib/server/publish-post-translation";
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
  locale: ReturnType<typeof parsePostTranslationInput>["locale"],
): Promise<void> {
  try {
    await requestPostStudyGeneration(slug, locale);
  } catch (error) {
    console.error("Failed to queue post study generation", error);
  }
}

function parseDraftPublication(form: FormData): PostTranslationDraftPublication | undefined {
  const generationId = form.get("draftGenerationId");
  const sourceHash = form.get("draftSourceHash");
  const promptVersion = form.get("draftPromptVersion");
  const absent = [generationId, sourceHash, promptVersion]
    .every((value) => value === null || value === "");
  if (absent) return undefined;
  if (
    typeof generationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(generationId) ||
    typeof sourceHash !== "string" ||
    !/^[0-9a-f]{64}$/u.test(sourceHash) ||
    promptVersion !== String(POST_TRANSLATION_PROMPT_VERSION)
  ) {
    throw new TypeError("번역 초안 버전이 올바르지 않습니다. 다시 생성해 주세요.");
  }
  return { generationId, sourceHash, promptVersion: POST_TRANSLATION_PROMPT_VERSION };
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
  let draft: PostTranslationDraftPublication | undefined;
  try {
    slug = parsePostSlug(context.params.slug);
    translation = parsePostTranslationInput({
      locale: form.get("locale"),
      title: form.get("title"),
      bodyMarkdown: form.get("bodyMarkdown"),
    });
    draft = parseDraftPublication(form);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." },
      400,
    );
  }

  try {
    const status = await publishPostTranslation(slug, translation, draft);
    if (status === "missing") return json({ error: "글을 찾을 수 없습니다." }, 404);
    if (status === "exists") {
      return json({ error: "이미 발행된 언어판입니다. 기존 언어판은 변경하지 않았습니다." }, 409);
    }
    if (status === "stale") {
      return json({ error: "원문이 바뀌었거나 초안이 오래되었습니다. 번역 초안을 다시 생성해 주세요." }, 409);
    }
    await requestStudyGeneration(slug, translation.locale);
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
