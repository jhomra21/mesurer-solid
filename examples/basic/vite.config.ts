import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

const packageSource = new URL("../../packages/mesurer-solid/src/", import.meta.url);

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: [
      {
        find: /^@jhomra21\/mesurer-solid\/styles\.css$/,
        replacement: new URL("styles.generated.css", packageSource).pathname,
      },
      {
        find: /^@jhomra21\/mesurer-solid$/,
        replacement: new URL("index.ts", packageSource).pathname,
      },
    ],
  },
  server: { port: 3000 },
});
