import { fileURLToPath } from "node:url";
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const entry = fileURLToPath(new URL("./showcase/hope-ui-overlay.tsx", import.meta.url));
const outDir = fileURLToPath(new URL("../../showcase/hope-ui/dist", import.meta.url));
const coreEntry = fileURLToPath(new URL("../mesurer-core/src/index.ts", import.meta.url));
const domEntry = fileURLToPath(new URL("../mesurer-dom/src/index.ts", import.meta.url));

export default defineConfig({
  root: repoRoot,
  plugins: [solid()],
  resolve: {
    alias: [
      { find: /^@jhomra21\/mesurer-solid-core$/, replacement: coreEntry },
      { find: /^@jhomra21\/mesurer-solid-dom$/, replacement: domEntry },
    ],
  },
  build: {
    outDir,
    emptyOutDir: true,
    lib: {
      entry,
      formats: ["es"],
      fileName: () => "mesurer-overlay.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
