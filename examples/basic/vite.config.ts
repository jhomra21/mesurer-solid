import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: [
      {
        find: /^@jhomra21\/mesurer-solid$/,
        replacement: new URL(
          "../../packages/mesurer-solid/src/index.ts",
          import.meta.url,
        ).pathname,
      },
    ],
  },
  server: { port: 3000 },
});
