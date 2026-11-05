import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(process.argv[2] ?? "parity-artifacts");

const currentSelectionChromeZIndex = "2147482800";

const readJson = async (name) => JSON.parse(await fs.readFile(path.join(outputDir, name), "utf8"));

const writeJson = async (name, value) => fs.writeFile(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);

const manifest = {
  typographyOcclusionLayer: null,
  selectionOcclusionLayer: null,
};

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

{
  const reactName = "react-selection.json";
  const solidName = "solid-selection.json";
  const react = await readJson(reactName);
  const solid = await readJson(solidName);
  const reactStyle = react.measureTag?.style;
  const solidStyle = solid.measureTag?.style;

  assert(reactStyle, "selection: missing historical measurement-label style snapshot");
  assert(solidStyle, "selection: missing current measurement-label style snapshot");
  assert.equal(reactStyle.zIndex, "auto", "selection: unexpected historical measurement-label z-index");
  assert.equal(
    solidStyle.zIndex,
    currentSelectionChromeZIndex,
    "selection: current measurement label no longer owns the reviewed page-chrome z-band",
  );

  manifest.selectionOcclusionLayer = {
    zIndex: { react: reactStyle.zIndex, solid: solidStyle.zIndex },
  };
  solidStyle.zIndex = reactStyle.zIndex;
  await writeJson(solidName, solid);
}

await writeJson("current-contract-normalization.json", manifest);

console.log("Verified the exact Typography occlusion and selection occlusion metadata deltas against the historical captures.");
