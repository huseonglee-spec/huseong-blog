import { getCollection } from "astro:content";

import { sortPostsNewest } from "./posts";

export async function getPublishedPosts() {
  const posts = await getCollection("posts", ({ data }) => !data.draft);
  return sortPostsNewest(posts);
}
