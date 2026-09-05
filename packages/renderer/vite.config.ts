import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";

const webStorageDisableFlag = process.allowedNodeEnvironmentFlags.has("--no-webstorage")
  ? "--no-webstorage"
  : process.allowedNodeEnvironmentFlags.has("--no-experimental-webstorage")
    ? "--no-experimental-webstorage"
    : undefined;

const solidDomRuntime = fileURLToPath(new URL("./src/solid-dom.ts", import.meta.url));

export default defineConfig({
  plugins: [
    solid({
      solid: {
        generate: "universal",
        moduleName: "@mesurer/solid-dom",
      },
    }),
  ],
  resolve: {
    alias: {
      "@mesurer/solid-dom": solidDomRuntime,
    },
  },
  test: {
    // Node 25+ enables process-wide Web Storage by default. Disable it in
    // Vitest workers so jsdom remains the owner of window.localStorage.
    execArgv: webStorageDisableFlag ? [webStorageDisableFlag] : [],
    // jsdom does not currently expose HTMLElement.isContentEditable. Model
    // the browser's inherited contenteditable semantics so direct-edit tests
    // exercise the same native boundary as the Chromium contract.
    setupFiles: ["./test/setup.ts"],
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
