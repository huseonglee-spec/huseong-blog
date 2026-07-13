import vercel from "@astrojs/vercel";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://huseong.com",
  trailingSlash: "always",
  output: "server",
  adapter: vercel(),
});
