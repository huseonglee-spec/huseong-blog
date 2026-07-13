import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const posts = defineCollection({
  loader: glob({
    base: "./src/content/posts",
    pattern: "**/*.{md,mdx}",
  }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    publishedAt: z.coerce.date(),
    thumbnail: z.string().optional(),
    thumbnailAlt: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
