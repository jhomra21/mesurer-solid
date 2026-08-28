import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid()],
  build: {
    target: "esnext",
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/inject.ts",
      formats: ["es"],
      fileName: "inject",
    },
    rollupOptions: {
      external: [],
      output: {
        codeSplitting: false,
      },
    },
  },
});
