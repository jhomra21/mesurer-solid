import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      "@jhomra21/mesurer-solid": fileURLToPath(new URL("../../packages/mesurer-solid/src/index.ts", import.meta.url)),
    },
  },
  server: { port: 3000 },
});
