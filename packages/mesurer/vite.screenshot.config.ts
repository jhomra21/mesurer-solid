import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid()],
  build: {
    target: "esnext",
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/screenshot.ts",
      formats: ["es"],
      fileName: "screenshot",
    },
    rollupOptions: {
      external: [],
      output: {
        codeSplitting: false,
      },
    },
  },
});
