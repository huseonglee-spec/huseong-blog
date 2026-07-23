import type { EditablePostFields } from "../edit-post";
import { database } from "./db";

interface SlugRow {
  slug: string;
}

export async function updatePublishedPost(
  slug: string,
  fields: EditablePostFields,
): Promise<boolean> {
  const sql = database();
  const updated = await sql`
    UPDATE posts
       SET title = ${fields.title},
           category_path = ${fields.category},
           visibility = ${fields.visibility},
           body_markdown = ${fields.bodyMarkdown},
           updated_at = now()
     WHERE slug = ${slug}
    RETURNING slug
  `;
  return Boolean((updated as SlugRow[])[0]?.slug);
}
