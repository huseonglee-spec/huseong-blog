import { neon } from "@neondatabase/serverless";
import { getSecret } from "astro:env/server";

let cachedDatabase: ReturnType<typeof neon> | undefined;

export function database(): ReturnType<typeof neon> {
  if (cachedDatabase) return cachedDatabase;
  const url = getSecret("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL is not configured");
  cachedDatabase = neon(url);
  return cachedDatabase;
}
