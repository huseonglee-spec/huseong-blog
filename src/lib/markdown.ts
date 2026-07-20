import { toText } from "hast-util-to-text";
import type { Schema } from "hast-util-sanitize";
import { toString as mdastToString } from "mdast-util-to-string";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkBreaks from "remark-breaks";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export interface PostHeading {
  depth: number;
  slug: string;
  text: string;
}

interface RenderedMarkdown {
  html: string;
  headings: PostHeading[];
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function mediaDirectives() {
  return (tree: unknown) => {
    visit(tree as Parameters<typeof visit>[0], ["leafDirective", "containerDirective"], (node: any) => {
      const title = mdastToString(node).trim();
      const attributes = node.attributes ?? {};

      if (node.name === "youtube") {
        const id = String(attributes.id ?? "").trim();
        if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return;

        const label = title || "YouTube 동영상";
        node.type = "html";
        node.value = `<div class="media-embed media-embed--youtube"><iframe src="https://www.youtube-nocookie.com/embed/${escapeAttribute(id)}" title="${escapeAttribute(label)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
        delete node.name;
        delete node.attributes;
        delete node.children;
        return;
      }

      if (node.name === "video") {
        const src = String(attributes.src ?? "").trim();
        if (!src) return;

        const poster = attributes.poster
          ? ` poster="${escapeAttribute(String(attributes.poster))}"`
          : "";
        const label = title ? ` title="${escapeAttribute(title)}"` : "";
        const caption = title
          ? `<figcaption>${escapeAttribute(title)}</figcaption>`
          : "";
        node.type = "html";
        node.value = `<figure class="media-embed"><video src="${escapeAttribute(src)}"${poster}${label} controls preload="metadata">이 브라우저에서는 동영상을 재생할 수 없습니다.</video>${caption}</figure>`;
        delete node.name;
        delete node.attributes;
        delete node.children;
      }
    });
  };
}

function collectHeadings(headings: PostHeading[]) {
  return (tree: unknown) => {
    visit(tree as Parameters<typeof visit>[0], "element", (node: any) => {
      if (!/^h[1-3]$/.test(node.tagName)) return;
      const slug = String(node.properties?.id ?? "");
      if (!slug) return;
      headings.push({
        depth: Number(node.tagName.slice(1)),
        slug,
        text: toText(node),
      });
    });
  };
}

const schema: Schema = {
  ...defaultSchema,
  clobberPrefix: "",
  attributes: {
    ...defaultSchema.attributes,
    div: [...(defaultSchema.attributes?.div ?? []), "className"],
    figure: [...(defaultSchema.attributes?.figure ?? []), "className"],
    iframe: [
      "src",
      "title",
      "loading",
      "referrerPolicy",
      "allow",
      "allowFullScreen",
    ],
    video: ["src", "poster", "title", "controls", "preload"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "figure",
    "figcaption",
    "iframe",
    "video",
  ],
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), "http", "https"],
  },
};

export async function renderPostMarkdown(
  markdown: string,
): Promise<RenderedMarkdown> {
  const headings: PostHeading[] = [];
  const file = await unified()
    .use(remarkParse)
    .use(remarkBreaks)
    .use(remarkDirective)
    .use(mediaDirectives)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeSanitize, schema)
    .use(collectHeadings, headings)
    .use(rehypeStringify)
    .process(markdown);

  return { html: String(file), headings };
}
