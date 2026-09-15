import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "esnext",
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/codex-plugin.ts",
      formats: ["es"],
      fileName: "codex",
    },
    rollupOptions: {
      external: [],
      output: {
        codeSplitting: false,
      },
    },
  },
});
