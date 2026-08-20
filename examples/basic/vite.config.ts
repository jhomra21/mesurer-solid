import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: [
      {
        find: /^@jhomra21\/mesurer-renderer$/,
        replacement: new URL(
          "../../packages/mesurer-solid/src/index.ts",
          import.meta.url,
        ).pathname,
      },
      {
        find: /^@jhomra21\/mesurer-core$/,
        replacement: new URL(
          "../../packages/mesurer-core/src/index.ts",
          import.meta.url,
        ).pathname,
      },
      {
        find: /^@jhomra21\/mesurer-dom$/,
        replacement: new URL(
          "../../packages/mesurer-dom/src/index.ts",
          import.meta.url,
        ).pathname,
      },
    ],
  },
  server: { port: 3000 },
});
