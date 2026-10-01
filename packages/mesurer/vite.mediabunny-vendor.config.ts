import { defineConfig } from "vite";

const MEDIABUNNY_NOTICE =
  "/*! MediaBunny 1.59.0 | Mozilla Public License 2.0 | Source: https://github.com/Vanilagy/mediabunny/tree/v1.59.0 */";

export default defineConfig({
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/mediabunny-vendor.ts",
      formats: ["iife"],
      name: "__MESURER_MEDIABUNNY__",
      fileName: () => "mediabunny-vendor.js",
    },
    rollupOptions: {
      output: {
        banner: MEDIABUNNY_NOTICE,
      },
    },
  },
});
