import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const privatePackagePattern = /@jhomra21\/mesurer-solid-(?:core|dom|renderer)/;

const removedDeliveryPattern = /\b(?:sendContext|toAcpContentBlocks|MesurerContextSender|MesurerContextDelivery|MesurerEvidenceProvider|MesurerEvidenceImage|MesurerAcpContentBlock|AcpTextContentBlock|AcpImageContentBlock)\b/;

const contextReturningSelectPattern = /\bselect\s*\(\s*selectors:\s*string\s*\|\s*readonly\s+string\[\]\s*\)\s*:\s*Promise<MesurerContextV1>/;

const skillBinPath = "scripts/install-skill.mjs";

if (packageJson.name !== "@jhomra21/mesurer-solid") {
  throw new Error(`Expected internal workspace package name @jhomra21/mesurer-solid, got ${packageJson.name}.`);
}

if (packageJson.bin?.["mesurer-skill"] !== skillBinPath) {
  throw new Error(`Expected mesurer-skill bin path ${skillBinPath}, got ${packageJson.bin?.["mesurer-skill"] ?? "<missing>"}.`);
}

if (packageJson.private === true) throw new Error("The public Mesurer package workspace cannot be private.");

if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) {
  throw new Error("The public Mesurer package must not publish runtime workspace dependencies.");
}

for (const requiredExport of [".", "./plugins", "./core", "./inject", "./inject-script", "./plugins/codex/bridge"]) {
  if (!packageJson.exports?.[requiredExport]) throw new Error(`Missing public export: ${requiredExport}`);
}

for (const removedExport of ["./arrange", "./codex", "./screenshot"]) {
  if (packageJson.exports?.[removedExport]) {
    throw new Error(`Obsolete first-party plugin subpath must not remain public: ${removedExport}`);
  }
}

if (packageJson.publishConfig?.access !== "public") throw new Error("publishConfig.access must be public.");

if (packageJson.publishConfig?.registry !== "https://registry.npmjs.org/") {
  throw new Error("publishConfig.registry must be the public npm registry.");
}

const dist = new URL("../dist/", import.meta.url);

const distFiles = readdirSync(dist);

for (const file of distFiles) {
  if (!file.endsWith(".js") && !file.endsWith(".d.ts")) continue;
  const source = readFileSync(new URL(file, dist), "utf8");

  if (privatePackagePattern.test(source)) {
    throw new Error(`${file} leaks a private workspace package name into the published artifact.`);
  }

  if (removedDeliveryPattern.test(source)) {
    throw new Error(`${file} exposes a removed generic agent-delivery API. Optional Codex delivery must stay in the explicit Codex plugin.`);
  }
}

for (const file of [
  "index.js",
  "index.d.ts",
  "plugins.js",
  "plugins.d.ts",
  "core.js",
  "core.d.ts",
  "inject.js",
  "inject.d.ts",
  "inject-script.js",
  "screenshot.d.ts",
]) {
  if (!distFiles.includes(file)) throw new Error(`Missing publish artifact: dist/${file}`);
}

const publishedRoot = await import(new URL("../dist/index.js", import.meta.url));

if (publishedRoot.MESURER_VERSION !== packageJson.version) {
  throw new Error(`Published MESURER_VERSION ${publishedRoot.MESURER_VERSION ?? "<missing>"} does not match package version ${packageJson.version}.`);
}

if (!Object.hasOwn(publishedRoot, "mountMesurer")) {
  throw new Error("Published root must expose canonical mountMesurer().");
}

if (publishedRoot.mountMeasurer !== publishedRoot.mountMesurer) {
  throw new Error("Deprecated mountMeasurer() must remain an alias of mountMesurer() for 0.1.1 compatibility.");
}

const publishedPlugins = await import(new URL("../dist/plugins.js", import.meta.url));

const publishedCore = await import(new URL("../dist/core.js", import.meta.url));

let runtimeCleanupCount = 0;

let runtimeFailure;

try {
  await publishedCore.createMesurerRuntime({
    plugins: [
      publishedCore.defineMesurerPlugin({
        id: "package-check.runtime-owner",
        setup(ctx) {
          ctx.lifecycle.onDispose(() => { runtimeCleanupCount += 1; });
        },
      }),
      publishedCore.defineMesurerPlugin({
        id: "package-check.runtime-failure",
        setup() {
          throw new Error("package-check runtime startup failure");
        },
      }),
    ],
  });
} catch (error) {
  runtimeFailure = error;
}

if (!(runtimeFailure instanceof Error) || runtimeFailure.message !== "package-check runtime startup failure") {
  throw new Error("Published createMesurerRuntime() did not preserve its startup failure.");
}

if (runtimeCleanupCount !== 1) {
  throw new Error(`Published createMesurerRuntime() left partial plugin ownership alive after startup failure: ${runtimeCleanupCount}.`);
}

for (const factory of [
  "context",
  "codex",
  "arrange",
  "layoutGuides",
  "screenshot",
  "select",
  "xray",
  "colorPicker",
  "rulers",
  "typography",
  "guides",
  "distance",
  "settings",
  "defaults",
  "compose",
]) {
  if (!(publishedPlugins[factory] instanceof Function)) {
    throw new Error(`Published plugins entry must expose ${factory}().`);
  }
}

const rootDeclarations = readFileSync(new URL("index.d.ts", dist), "utf8");

const pluginDeclarations = readFileSync(new URL("plugins.d.ts", dist), "utf8");

const codexDeclarationUrl = new URL("plugins/codex/index.d.ts", dist);

if (!existsSync(codexDeclarationUrl)) {
  throw new Error("Missing publish artifact: dist/plugins/codex/index.d.ts");
}

const codexDeclarations = readFileSync(codexDeclarationUrl, "utf8");

const screenshotDeclarations = readFileSync(new URL("screenshot.d.ts", dist), "utf8");

for (const leakedScreenshotExport of [
  "captureScreenshotPng",
  "createElectronScreenshotCaptureProvider",
  "ElectronScreenshotCapture",
  "ElectronScreenshotCaptureSource",
]) {
  if (pluginDeclarations.includes(leakedScreenshotExport)) {
    throw new Error(`Published Screenshot API leaked internal host detail: ${leakedScreenshotExport}.`);
  }
}

if (/\bpreviewDurationMs\??\s*:/.test(screenshotDeclarations)) {
  throw new Error("Published Screenshot options leaked the renderer-only preview timing control.");
}

if (/\bcapture\??\s*:\s*ScreenshotCaptureProvider\b/.test(screenshotDeclarations)) {
  throw new Error("Published Screenshot options must not expose the private capture-provider seam.");
}

if (/type\s+MesurerScreenshotPluginOptions\s*=\s*Partial<MesurerScreenshotSettings>/.test(screenshotDeclarations)) {
  throw new Error("Published Screenshot options must stay explicit instead of inheriting persisted settings.");
}

if (!/\bcaptureVisibleTab\??\s*:/.test(screenshotDeclarations)) {
  throw new Error("Published Screenshot options must retain the deprecated captureVisibleTab compatibility hook.");
}

const publishedDeclarations = distFiles
  .filter((file) => file.endsWith(".d.ts"))
  .map((file) => readFileSync(new URL(file, dist), "utf8"))
  .join("\n");

if (!contextReturningSelectPattern.test(rootDeclarations)) {
  throw new Error("Published declarations must expose select(string | readonly string[]) returning Promise<MesurerContextV1>.");
}

if (!/\bselect:\s*boolean\b/.test(rootDeclarations)) {
  throw new Error("Published MesurerAgentCapabilities must advertise the direct select capability.");
}

if (!/\barrange:\s*boolean\b/.test(rootDeclarations)) {
  throw new Error("Published MesurerAgentCapabilities must advertise Arrange availability.");
}

if (!/\btextEdit:\s*boolean\b/.test(rootDeclarations)) {
  throw new Error("Published MesurerAgentCapabilities must advertise text edit intent availability.");
}

for (const methodName of ["arrangements", "arrange", "showArrange", "arrangeCapturePlan", "reviewArrange"]) {
  if (!new RegExp(`\\b${methodName}\\s*\\(`).test(rootDeclarations)) {
    throw new Error(`Published Mesurer agent declarations are missing ${methodName}().`);
  }
}

for (const methodName of ["textEdits", "textEdit"]) {
  if (!new RegExp(`\\b${methodName}\\s*\\(`).test(rootDeclarations)) {
    throw new Error(`Published Mesurer agent declarations are missing ${methodName}().`);
  }
}

for (const contractName of ["MesurerTextEditIntent", "MesurerTextStyleChange", "MesurerTextStyleProperty"]) {
  if (!new RegExp(`\\b${contractName}\\b`).test(rootDeclarations)) {
    throw new Error(`Published root declarations are missing text edit contract ${contractName}.`);
  }
}

for (const property of [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-transform",
  "color",
  "text-decoration-line",
]) {
  if (!new RegExp(`["']${property}["']`).test(publishedDeclarations)) {
    throw new Error(`Published MesurerTextStyleProperty is missing runtime style property: ${property}.`);
  }
}

for (const canonicalName of ["mountMesurer", "MountMesurerOptions", "MountedMesurer"]) {
  if (!new RegExp(`\\b${canonicalName}\\b`).test(rootDeclarations)) {
    throw new Error(`Published declarations are missing canonical Mesurer API name: ${canonicalName}.`);
  }
}

for (const legacyName of ["mountMeasurer", "MountMeasurerOptions", "MountedMeasurer"]) {
  if (!new RegExp(`\\b${legacyName}\\b`).test(rootDeclarations)) {
    throw new Error(`Published declarations must retain deprecated compatibility alias: ${legacyName}.`);
  }
}

for (const obsoleteFactory of [
  "contextPlugin",
  "codexPlugin",
  "arrangePlugin",
  "screenshotPlugin",
  "selectPlugin",
  "xrayPlugin",
  "colorPickerPlugin",
  "rulersPlugin",
  "textInspectorPlugin",
  "guidesPlugin",
  "layoutGuidesPlugin",
  "distancePlugin",
  "settingsPlugin",
  "defaultMesurerPlugins",
  "composeMesurerPlugins",
]) {
  if (new RegExp(`\\b${obsoleteFactory}\\b`).test(rootDeclarations) || new RegExp(`\\b${obsoleteFactory}\\b`).test(pluginDeclarations)) {
    throw new Error(`Published API still exposes obsolete plugin factory name ${obsoleteFactory}.`);
  }
}

for (const contractName of [
  "ArrangeElementFingerprint",
  "ArrangeIntent",
  "ArrangeReview",
  "ArrangeCapturePlan",
  "MesurerArrangeService",
  "MesurerCodexHealth",
  "MesurerCodexDelivery",
  "MesurerCodexDeliveryStatus",
  "MesurerCodexThread",
  "MesurerCodexThreadList",
  "MesurerCodexThreadListOptions",
  "MesurerCodexService",
  "MesurerCodexQueueRequest",
  "MesurerCodexQueueResult",
  "MesurerCodexSendRequest",
  "MesurerCodexSendResult",
  "MesurerContextService",
  "LayoutGuide",
  "LayoutGuideInput",
  "MesurerLayoutGuidesService",
  "MesurerScreenshotService",
]) {
  if (!new RegExp(`\\b${contractName}\\b`).test(pluginDeclarations)) {
    throw new Error(`Published plugins entry is missing ${contractName}.`);
  }
}

for (const codexMember of ["queue(", "send(", "delivery(", "listThreads", "useThread", "thread?: string", "threads: string[]", 'delivery: "queued"', "deliveryId", "annotationIds"]) {
  if (!codexDeclarations.includes(codexMember)) {
    throw new Error(`Published Codex plugin declarations are missing thread-routing contract: ${codexMember}.`);
  }
}

for (const [member, pattern] of [
  ["list()", /\blist\s*\(\s*\)\s*:\s*LayoutGuide\[\]/],
  ["add()", /\badd\s*\(/],
  ["update()", /\bupdate\s*\(/],
  ["remove()", /\bremove\s*\(/],
  ["clear()", /\bclear\s*\(\s*\)/],
  ["subscribe()", /\bsubscribe\s*\(/],
]) {
  if (!pattern.test(publishedDeclarations)) {
    throw new Error(`Published MesurerLayoutGuidesService is missing ${member}.`);
  }
}

if (!rootDeclarations.includes("service<T>(id: string): Promise<T>")) {
  throw new Error("Published MountedMesurer declarations are missing typed service<T>(id).");
}

const packageReadme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

if (/\bmountMeasurer\b/.test(packageReadme)) {
  throw new Error("The npm README must document canonical mountMesurer(), not the deprecated mountMeasurer() spelling.");
}

if (/\b(?:contextPlugin|codexPlugin|arrangePlugin|layoutGuidesPlugin|screenshotPlugin)\b/.test(packageReadme)) {
  throw new Error("The npm README must document canonical plugin factory names from mesurer-solid/plugins.");
}

const skillSource = new URL("../skills/mesurer-ui/SKILL.md", import.meta.url);

if (!existsSync(skillSource)) throw new Error("Missing packaged Agent Skill: skills/mesurer-ui/SKILL.md");

const repositorySkill = new URL("../../../.agents/skills/mesurer-ui/SKILL.md", import.meta.url);

if (!existsSync(repositorySkill)) throw new Error("Missing repository Agent Skill: .agents/skills/mesurer-ui/SKILL.md");

if (readFileSync(repositorySkill, "utf8") !== readFileSync(skillSource, "utf8")) {
  throw new Error("Repository and packaged Mesurer Agent Skills must remain byte-identical.");
}

const codexBridgeScript = new URL("../src/plugins/codex/bridge.mjs", import.meta.url);

const codexBridgeTypes = new URL("../src/plugins/codex/bridge.d.ts", import.meta.url);

if (!existsSync(codexBridgeScript) || !existsSync(codexBridgeTypes)) {
  throw new Error("Missing packaged Codex Bridge plugin helper.");
}

const codexBridgeSource = readFileSync(codexBridgeScript, "utf8");

for (const contract of [
  "export async function codexBridge",
  "thread/loaded/list",
  "thread/queue/add",
  "createConnection",
  "packagedCodexBins",
  "desktopBundledCodex",
  "installedDesktopCodexBins",
  "bootstrapRuntime",
  "inspectRuntime",
  "\"desktop-private-transport\"",
  "\"packages\", \"app-server-daemon\"",
  "\"packages\", \"standalone\"",
]) {
  if (!codexBridgeSource.includes(contract)) {
    throw new Error(`Packaged Codex Bridge is missing contract: ${contract}.`);
  }
}

for (const removedPattern of [
  "createServer(",
  "127.0.0.1:47365",
  "process.execPath",
  "import.meta.url",
  "ELECTRON_RUN_AS_NODE",
  "stdio-to-uds",
]) {
  if (codexBridgeSource.includes(removedPattern)) {
    throw new Error(`Packaged Codex Bridge retained removed companion-process behavior: ${removedPattern}.`);
  }
}

const stageScript = fileURLToPath(new URL("./stage-package.mjs", import.meta.url));

execFileSync(process.execPath, [stageScript], { stdio: "pipe" });

const stagedPackageJson = JSON.parse(readFileSync(new URL("../.publish/package.json", import.meta.url), "utf8"));

if (stagedPackageJson.name !== "mesurer-solid") {
  throw new Error(`Expected staged npm package name mesurer-solid, got ${stagedPackageJson.name}.`);
}

if (stagedPackageJson.bin?.["mesurer-skill"] !== skillBinPath) {
  throw new Error(`Expected staged mesurer-skill bin path ${skillBinPath}, got ${stagedPackageJson.bin?.["mesurer-skill"] ?? "<missing>"}.`);
}

if (!stagedPackageJson.exports?.["./plugins"]) {
  throw new Error("Staged npm package is missing the ./plugins export.");
}

if (!stagedPackageJson.exports?.["./plugins/codex/bridge"]) {
  throw new Error("Staged npm package is missing the ./plugins/codex/bridge export.");
}

for (const removedExport of ["./arrange", "./codex", "./screenshot"]) {
  if (stagedPackageJson.exports?.[removedExport]) {
    throw new Error(`Staged npm package retained obsolete plugin subpath ${removedExport}.`);
  }
}

for (const path of [
  "../.publish/plugins/codex/bridge.mjs",
  "../.publish/plugins/codex/bridge.d.ts",
]) {
  if (!existsSync(new URL(path, import.meta.url))) {
    throw new Error(`Staged npm package is missing Codex Bridge plugin helper: ${path.replace("../.publish/", "")}.`);
  }
}

for (const privateName of ["@jhomra21/mesurer-solid-core", "@jhomra21/mesurer-solid-dom", "@jhomra21/mesurer-solid-renderer"]) {
  if (JSON.stringify(stagedPackageJson).includes(privateName)) {
    throw new Error(`Staged package metadata leaked private package name: ${privateName}`);
  }
}

const installRoot = mkdtempSync(join(tmpdir(), "mesurer-skill-smoke-"));

try {
  execFileSync(process.execPath, [fileURLToPath(new URL("./install-skill.mjs", import.meta.url)), "install"], {
    cwd: installRoot,
    stdio: "pipe",
  });
  const installedSkill = join(installRoot, ".agents/skills/mesurer-ui/SKILL.md");
  const installedInjector = join(installRoot, ".agents/skills/mesurer-ui/assets/inject-script.js");

  if (!existsSync(installedSkill)) throw new Error("mesurer-skill install did not create SKILL.md.");

  if (!existsSync(installedInjector)) throw new Error("mesurer-skill install did not create assets/inject-script.js.");

  const sourceSkill = readFileSync(skillSource, "utf8");
  const copiedSkill = readFileSync(installedSkill, "utf8");

  if (copiedSkill !== sourceSkill) {
    throw new Error("Installed Agent Skill does not match the packaged canonical SKILL.md.");
  }

  const sourceInjector = readFileSync(new URL("../dist/inject-script.js", import.meta.url), "utf8");
  const copiedInjector = readFileSync(installedInjector, "utf8");

  if (!sourceInjector || copiedInjector !== sourceInjector) {
    throw new Error("Installed Agent Skill injector does not match the packaged inject-script artifact.");
  }

} finally {
  rmSync(installRoot, { recursive: true, force: true });
}

console.log(`mesurer-solid@${packageJson.version} staged canonical Mesurer API, unified plugins entry, in-process Codex Bridge, agent context, Arrange, text edit intents, screenshot tooling, and Agent Skill installer are self-contained.`);
