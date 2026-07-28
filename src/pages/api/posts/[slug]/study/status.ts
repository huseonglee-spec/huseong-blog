import type { APIRoute } from "astro";

import { parsePostSlug } from "../../../../../lib/edit-post";
import { postStudySourceHash } from "../../../../../lib/post-study";
import { parsePostTranslationLocale } from "../../../../../lib/post-translation";
import {
  getPostStudyPanel,
  getPostStudySource,
} from "../../../../../lib/server/post-study";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export const GET: APIRoute = async (context) => {
  if (!context.locals.adminSession) return json({ error: "로그인이 필요합니다." }, 401);

  let slug: string;
  let locale: ReturnType<typeof parsePostTranslationLocale>;
  let requestedSourceHash: string;
  try {
    slug = parsePostSlug(context.params.slug);
    locale = parsePostTranslationLocale(context.url.searchParams.get("locale"));
    requestedSourceHash = context.url.searchParams.get("sourceHash") ?? "";
    if (!/^[0-9a-f]{64}$/u.test(requestedSourceHash)) {
      throw new TypeError("언어판 버전이 올바르지 않습니다.");
    }
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." },
      400,
    );
  }

  try {
    const source = await getPostStudySource(slug, locale);
    if (!source) return json({ error: "언어판을 찾을 수 없습니다." }, 404);
    const currentSourceHash = postStudySourceHash(source.title, source.bodyMarkdown);
    if (currentSourceHash !== requestedSourceHash) return json({ status: "changed" }, 200);
    const panel = await getPostStudyPanel(slug, locale, currentSourceHash);
    return json({ status: panel.status }, 200);
  } catch (error) {
    console.error("Failed to read post study status", error);
    return json({ error: "생성 상태를 확인하지 못했습니다." }, 500);
  }
};

export const ALL: APIRoute = () =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "GET", "Cache-Control": "no-store" },
  });
