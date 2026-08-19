import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";

const packageSource = new URL(
  "../../packages/mesurer-solid/src/",
  import.meta.url,
).pathname;

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: [
      {
        find: "@jhomra21/mesurer-solid/styles.css",
        replacement: `${packageSource}styles.css`,
      },
      {
        find: "@jhomra21/mesurer-solid",
        replacement: `${packageSource}index.ts`,
      },
    ],
  },
  server: {
    port: 3000,
  },
});
