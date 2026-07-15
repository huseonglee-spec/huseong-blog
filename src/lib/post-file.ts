import path from "node:path";

import matter from "gray-matter";

import { normalizeCategoryPath } from "./categories";

export interface WritablePost {
  slug: string;
  title: string;
  subtitle: string | null;
  publishedAt: Date;
  thumbnail: string | null;
  thumbnailAlt: string | null;
  draft: boolean;
  category?: string;
  bodyMarkdown: string;
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function optionalString(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  return value;
}

export function parsePostFile(source: string, fileName: string): WritablePost {
  const slug = path.basename(fileName).replace(/\.(md|mdx)$/i, "");
  if (!slugPattern.test(slug)) {
    throw new TypeError(`slug must use lowercase ASCII letters, numbers, and hyphens: ${slug}`);
  }

  const parsed = matter(source);
  const title = parsed.data.title;
  if (typeof title !== "string" || !title.trim()) {
    throw new TypeError("title is required");
  }

  const publishedAt = parsed.data.publishedAt
    ? new Date(parsed.data.publishedAt)
    : new Date();
  if (Number.isNaN(publishedAt.getTime())) {
    throw new TypeError("publishedAt must be a valid date");
  }

  if (parsed.data.draft !== undefined && typeof parsed.data.draft !== "boolean") {
    throw new TypeError("draft must be a boolean");
  }

  const bodyMarkdown = parsed.content.trim();
  if (!bodyMarkdown) throw new TypeError("post body must not be empty");

  return {
    slug,
    title: title.trim(),
    subtitle: optionalString(parsed.data.subtitle, "subtitle"),
    publishedAt,
    thumbnail: optionalString(parsed.data.thumbnail, "thumbnail"),
    thumbnailAlt: optionalString(parsed.data.thumbnailAlt, "thumbnailAlt"),
    draft: parsed.data.draft ?? false,
    category:
      parsed.data.category === undefined
        ? undefined
        : normalizeCategoryPath(parsed.data.category),
    bodyMarkdown,
  };
}
