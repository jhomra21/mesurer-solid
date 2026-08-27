import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "esnext",
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/delivery.ts",
      formats: ["es"],
      fileName: "delivery",
    },
    rollupOptions: {
      external: [],
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
