import type { APIRoute } from "astro";

import { getPublishedPosts } from "../lib/content";
import { postHref } from "../lib/posts";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL("https://huseong.com");
  const posts = await getPublishedPosts();
  const urls = [
    `<url><loc>${escapeXml(new URL("/", base).href)}</loc></url>`,
    ...posts.map(
      (post) =>
        `<url><loc>${escapeXml(new URL(postHref(post.id), base).href)}</loc><lastmod>${post.updatedAt.toISOString()}</lastmod></url>`,
    ),
  ];

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`,
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/xml; charset=utf-8",
      },
    },
  );
};
