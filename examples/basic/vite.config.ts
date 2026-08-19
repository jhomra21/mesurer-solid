import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      "@jhomra21/mesurer-solid": new URL(
        "../../packages/mesurer-solid/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  server: { port: 3000 },
});
