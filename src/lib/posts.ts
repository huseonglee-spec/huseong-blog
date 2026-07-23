import type { PostVisibility } from "./visibility";

export interface BlogPost {
  id: string;
  data: {
    title: string;
    subtitle?: string;
    publishedAt: Date;
    thumbnail?: string;
    thumbnailAlt?: string;
    draft: boolean;
    category: string;
    visibility: PostVisibility;
  };
  bodyMarkdown: string;
  updatedAt: Date;
}

type DatedPost = {
  id: string;
  data: {
    publishedAt: Date;
  };
};

export function sortPostsNewest<T extends DatedPost>(posts: readonly T[]): T[] {
  return [...posts].sort(
    (left, right) =>
      right.data.publishedAt.getTime() - left.data.publishedAt.getTime(),
  );
}

export function postHref(slug: string, language?: "ko" | "en"): string {
  const path = `/posts/${slug}/`;
  return language === "en" ? `${path}?lang=en` : path;
}

export function initialVisibleCount(
  activeIndex: number,
  batchSize: number,
): number {
  if (batchSize < 1) {
    throw new RangeError("batchSize must be at least 1");
  }

  if (activeIndex < 0) {
    return batchSize;
  }

  return Math.ceil((activeIndex + 1) / batchSize) * batchSize;
}
