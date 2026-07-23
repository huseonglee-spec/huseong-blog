import { describe, expect, it } from "vitest";

import {
  POST_VISIBILITIES,
  canViewPost,
  normalizePostVisibility,
  visibilityLabel,
} from "./visibility";

describe("post visibility", () => {
  it("supports exactly the four requested visibility layers", () => {
    expect(POST_VISIBILITIES).toEqual([
      "public",
      "friends",
      "close_friends",
      "private",
    ]);
    expect(POST_VISIBILITIES.map(visibilityLabel)).toEqual([
      "전체 공개",
      "친구 공개",
      "친한 친구 공개",
      "비공개",
    ]);
  });

  it("defaults omitted visibility to public and rejects unknown values", () => {
    expect(normalizePostVisibility(undefined)).toBe("public");
    expect(normalizePostVisibility("friends")).toBe("friends");
    expect(() => normalizePostVisibility("followers")).toThrow(
      "공개 범위가 올바르지 않습니다.",
    );
  });

  it("shows restricted posts only to the owner until visitor identities exist", () => {
    expect(canViewPost("public", false)).toBe(true);
    expect(canViewPost("friends", false)).toBe(false);
    expect(canViewPost("close_friends", false)).toBe(false);
    expect(canViewPost("private", false)).toBe(false);

    for (const visibility of POST_VISIBILITIES) {
      expect(canViewPost(visibility, true)).toBe(true);
    }
  });
});
