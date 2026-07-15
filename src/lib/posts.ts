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

export function postHref(slug: string): string {
  return `/posts/${slug}/`;
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
