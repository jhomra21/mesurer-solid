import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "esnext",
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/core.ts",
      formats: ["es"],
      fileName: "core",
    },
    rollupOptions: {
      external: [],
      output: {
        codeSplitting: false,
      },
    },
  },
});
