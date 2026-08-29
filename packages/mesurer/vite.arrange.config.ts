import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid()],
  build: {
    target: "esnext",
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/arrange.ts",
      formats: ["es"],
      fileName: "arrange",
    },
    rollupOptions: {
      external: [],
      output: {
        codeSplitting: false,
      },
    },
  },
});