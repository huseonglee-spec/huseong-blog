import type { BlogPost } from "./posts";

export const DEFAULT_CATEGORY = "미분류";

export interface CategoryNode {
  name: string;
  path: string;
  count: number;
  children: CategoryNode[];
}

interface MutableCategoryNode extends CategoryNode {
  children: MutableCategoryNode[];
}

export function normalizeCategoryPath(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_CATEGORY;
  }
  if (typeof value !== "string") {
    throw new TypeError("카테고리는 문자열이어야 합니다.");
  }

  const rawSegments = value.split("/");
  const segments = rawSegments.map((segment) => segment.trim());
  const invalid =
    segments.length > 5 ||
    segments.some(
      (segment) =>
        !segment ||
        segment.length > 40 ||
        /[\u0000-\u001f\u007f]/u.test(segment),
    );
  const path = segments.join("/");

  if (invalid || path.length > 200) {
    throw new TypeError("카테고리 경로가 올바르지 않습니다.");
  }
  return path;
}

export function buildCategoryTree(posts: readonly BlogPost[]): CategoryNode[] {
  const roots: MutableCategoryNode[] = [];

  for (const post of posts) {
    const segments = post.data.category.split("/");
    let siblings = roots;
    let path = "";

    for (const name of segments) {
      path = path ? `${path}/${name}` : name;
      let node = siblings.find((candidate) => candidate.name === name);
      if (!node) {
        node = { name, path, count: 0, children: [] };
        siblings.push(node);
      }
      node.count += 1;
      siblings = node.children;
    }
  }

  const sortNodes = (nodes: MutableCategoryNode[]): CategoryNode[] =>
    nodes
      .sort((left, right) => left.name.localeCompare(right.name, "ko"))
      .map((node) => ({ ...node, children: sortNodes(node.children) }));

  return sortNodes(roots);
}

export function filterPostsByCategory(
  posts: readonly BlogPost[],
  selectedCategory?: string,
): BlogPost[] {
  if (!selectedCategory) return [...posts];
  const prefix = `${selectedCategory}/`;
  return posts.filter(
    (post) =>
      post.data.category === selectedCategory ||
      post.data.category.startsWith(prefix),
  );
}

export function categoryHref(path: string): string {
  const params = new URLSearchParams({ category: path });
  return `/?${params.toString()}`;
}
