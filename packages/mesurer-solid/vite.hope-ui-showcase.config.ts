import { fileURLToPath } from "node:url";
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const entry = fileURLToPath(new URL("./showcase/hope-ui-overlay.tsx", import.meta.url));
const outDir = fileURLToPath(new URL("../../showcase/hope-ui/dist", import.meta.url));

export default defineConfig({
  root: repoRoot,
  plugins: [solid()],
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
