import { fileURLToPath } from "node:url";
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

const packageSource = new URL("../../packages/mesurer-solid/src/", import.meta.url);

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: [
      {
        find: /^@jhomra21\/mesurer-solid\/styles\.css$/,
        replacement: fileURLToPath(new URL("styles.generated.css", packageSource)),
      },
      {
        find: /^@jhomra21\/mesurer-solid$/,
        replacement: fileURLToPath(new URL("index.ts", packageSource)),
      },
    ],
  },
  server: { port: 3000 },
});
