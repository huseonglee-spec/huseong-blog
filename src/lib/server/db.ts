import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getSecret } from "astro:env/server";

type Database = NeonQueryFunction<false, false>;

let cachedDatabase: Database | undefined;

export function database(): Database {
  if (cachedDatabase) return cachedDatabase;
  const url = getSecret("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL is not configured");
  cachedDatabase = neon(url);
  return cachedDatabase;
}
