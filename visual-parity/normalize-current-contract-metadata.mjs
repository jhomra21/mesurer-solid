import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(process.argv[2] ?? "parity-artifacts");
const settingsStates = [
  "settings-color",
  "settings-general",
  "settings-guides",
  "settings-rulers",
  "settings-select",
];

const historicalSettingsClass = "mesurer-menu-surface msr:absolute msr:-right-1 msr:z-[70] msr:box-border msr:w-[272px] msr:max-w-[calc(100vw-16px)] msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-3 msr:top-full msr:mt-2";
const currentViewportSafeSettingsClass = "mesurer-menu-surface msr:absolute msr:z-[70] msr:box-border msr:w-[272px] msr:max-w-[calc(100vw-16px)] msr:max-h-[calc(100vh-16px)] msr:overflow-y-auto msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:p-3 msr:top-full msr:mt-2";

const readJson = async (name) => JSON.parse(await fs.readFile(path.join(outputDir, name), "utf8"));
const writeJson = async (name, value) => fs.writeFile(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);

const manifest = {
  settingsViewportSafety: [],
  typographyOcclusionLayer: null,
};

for (const state of settingsStates) {
  const reactName = `react-${state}.json`;
  const solidName = `solid-${state}.json`;
  const react = await readJson(reactName);
  const solid = await readJson(solidName);
  const reactClass = react.settings?.className;
  const solidClass = solid.settings?.className;

  assert.equal(
    reactClass,
    historicalSettingsClass,
    `${state}: historical Settings class changed; do not normalize an unreviewed React delta`,
  );
  assert.equal(
    solidClass,
    currentViewportSafeSettingsClass,
    `${state}: current viewport-safe Settings class changed; do not normalize an unreviewed Solid delta`,
  );

  manifest.settingsViewportSafety.push({ state, react: reactClass, solid: solidClass });
  solid.settings.className = reactClass;
  await writeJson(solidName, solid);
}

{
  const reactName = "react-text-inspector.json";
  const solidName = "solid-text-inspector.json";
  const react = await readJson(reactName);
  const solid = await readJson(solidName);
  const reactStyle = react.textInspector?.style;
  const solidStyle = solid.textInspector?.style;

  assert(reactStyle, "text-inspector: missing historical Typography style snapshot");
  assert(solidStyle, "text-inspector: missing current Typography style snapshot");
  assert.equal(reactStyle.pointerEvents, "none", "text-inspector: unexpected historical pointer-events value");
  assert.equal(solidStyle.pointerEvents, "none", "text-inspector: unexpected current pointer-events value");
  assert.equal(reactStyle.zIndex, "1", "text-inspector: unexpected historical z-index value");
  assert.equal(solidStyle.zIndex, "2147483647", "text-inspector: current Typography no longer owns the verified occlusion layer");

  manifest.typographyOcclusionLayer = {
    pointerEvents: { react: reactStyle.pointerEvents, solid: solidStyle.pointerEvents },
    zIndex: { react: reactStyle.zIndex, solid: solidStyle.zIndex },
  };
  solidStyle.zIndex = reactStyle.zIndex;
  await writeJson(solidName, solid);
}

await writeJson("current-contract-normalization.json", manifest);
console.log("Verified and normalized only the exact current-only Settings viewport-safety and Typography occlusion metadata deltas. Pixel captures are untouched.");
