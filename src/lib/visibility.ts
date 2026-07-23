export const POST_VISIBILITIES = [
  "public",
  "friends",
  "close_friends",
  "private",
] as const;

export type PostVisibility = (typeof POST_VISIBILITIES)[number];

const VISIBILITY_LABELS: Record<PostVisibility, string> = {
  public: "전체 공개",
  friends: "친구 공개",
  close_friends: "친한 친구 공개",
  private: "비공개",
};

export function normalizePostVisibility(value: unknown): PostVisibility {
  if (value === undefined || value === null || value === "") return "public";
  if (
    typeof value !== "string" ||
    !POST_VISIBILITIES.includes(value as PostVisibility)
  ) {
    throw new TypeError("공개 범위가 올바르지 않습니다.");
  }
  return value as PostVisibility;
}

export function visibilityLabel(visibility: PostVisibility): string {
  return VISIBILITY_LABELS[visibility];
}

export function canViewPost(
  visibility: PostVisibility,
  isOwner: boolean,
): boolean {
  return isOwner || visibility === "public";
}
