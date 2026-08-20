import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";

const webStorageDisableFlag = process.allowedNodeEnvironmentFlags.has("--no-webstorage")
  ? "--no-webstorage"
  : process.allowedNodeEnvironmentFlags.has("--no-experimental-webstorage")
    ? "--no-experimental-webstorage"
    : undefined;

export default defineConfig({
  plugins: [solid()],
  test: {
    // Node 25+ enables process-wide Web Storage by default. Disable it in
    // Vitest workers so jsdom remains the owner of window.localStorage.
    execArgv: webStorageDisableFlag ? [webStorageDisableFlag] : [],
  },
  build: {
    target: "esnext",
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["solid-js", "@solidjs/web"],
    },
  },
});
