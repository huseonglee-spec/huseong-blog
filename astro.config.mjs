import vercel from "@astrojs/vercel";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://huseong.com",
  trailingSlash: "always",
  output: "server",
  security: {
    checkOrigin: true,
  },
  adapter: vercel(),
});
