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

for (const [name, path] of [
  ["mesurer-codex", "scripts/codex-bridge.mjs"],
  ["mesurer-codex-connect", "scripts/codex-connect.mjs"],
]) {
  if (packageJson.bin?.[name] !== path) {
    throw new Error(`Expected ${name} bin path ${path}, got ${packageJson.bin?.[name] ?? "<missing>"}.`);
  }
}

if (packageJson.private === true) throw new Error("The public Mesurer package workspace cannot be private.");

const runtimeDependencies = packageJson.dependencies ?? {};

if (
  Object.keys(runtimeDependencies).length !== 1
  || runtimeDependencies.mediabunny !== "1.59.0"
) {
  throw new Error("The public Mesurer package must publish only exact mediabunny@1.59.0 as a runtime dependency.");
}

for (const requiredExport of [".", "./plugins", "./core", "./inject", "./inject-script", "./mediabunny-vendor", "./electron", "./plugins/codex/bridge", "./plugins/codex/preload", "./plugins/recording/bridge", "./plugins/recording/preload"]) {
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
  "mediabunny-vendor.js",
  "screenshot.d.ts",
  "recording.d.ts",
  "mediabunny-runtime.js",
  "mediabunny-vendor.js",
  "mediabunny-LICENSE.txt",
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

for (const exportName of [
  "MESURER_EDIT_ACTIVE_STATE_ID",
  "MESURER_EDIT_PLUGIN_ID",
  "MESURER_EDIT_SERVICE_ID",
  "MESURER_EDIT_SETTINGS_STATE_ID",
  "MESURER_EDIT_STATE_ID",
]) {
  if (!Object.hasOwn(publishedPlugins, exportName)) {
    throw new Error(`Published plugins entry is missing canonical Edit export ${exportName}.`);
  }
}

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
  "edit",
  "arrange",
  "layoutGuides",
  "recording",
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

const recordingDeclarations = readFileSync(new URL("recording.d.ts", dist), "utf8");

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
  throw new Error("Published MesurerAgentCapabilities must advertise Edit movement availability through the arrange compatibility key.");
}

if (!/\btextEdit:\s*boolean\b/.test(rootDeclarations)) {
  throw new Error("Published MesurerAgentCapabilities must advertise text edit intent availability.");
}

for (const methodName of ["arrangements", "arrange", "showArrange", "arrangeCapturePlan", "reviewArrange"]) {
  if (!new RegExp(`\\b${methodName}\\s*\\(`).test(rootDeclarations)) {
    throw new Error(`Published Mesurer agent declarations are missing ${methodName}().`);
  }
}

for (const contractName of [
  "MesurerEditHarness",
  "EditCapturePlan",
  "EditIntent",
  "EditOffset",
  "EditPresentation",
  "EditRect",
  "EditReview",
  "EditReviewTarget",
  "EditTarget",
  "MesurerEditService",
]) {
  if (!new RegExp(`\\b${contractName}\\b`).test(rootDeclarations)) {
    throw new Error(`Published root declarations are missing canonical Edit contract ${contractName}.`);
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
  "recordingPlugin",
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
  "EditElementFingerprint",
  "EditIntent",
  "EditReview",
  "EditCapturePlan",
  "MesurerEditService",
  "MesurerEditSettings",
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
  "MesurerRecordingAsset",
  "MesurerRecordingExportResult",
  "MesurerRecordingService",
  "MesurerRecordingSnapshot",
  "MesurerScreenshotService",
]) {
  if (!new RegExp(`\\b${contractName}\\b`).test(pluginDeclarations)) {
    throw new Error(`Published plugins entry is missing ${contractName}.`);
  }
}

for (const member of [
  "snapshot()",
  "subscribe(",
  "formats()",
  "start(",
  "stop()",
  "cancel()",
  "discard()",
  "export(",
]) {
  if (!recordingDeclarations.includes(member)) {
    throw new Error(`Published MesurerRecordingService is missing ${member}.`);
  }
}

for (const leakedMediaBunnyType of [
  "CanvasSource",
  "Conversion",
  "Input",
  "Output",
  "VideoCodec",
  "mediabunny",
]) {
  if (recordingDeclarations.includes(leakedMediaBunnyType)) {
    throw new Error(`Published Recording API leaked MediaBunny implementation detail: ${leakedMediaBunnyType}.`);
  }
}

if (/\bMesurerCodexRuntime\b/.test(pluginDeclarations)) {
  throw new Error("Published codex:v1 declarations must not expose CLI/Desktop runtime selection.");
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

if (/\b(?:contextPlugin|codexPlugin|arrangePlugin|layoutGuidesPlugin|recordingPlugin|screenshotPlugin)\b/.test(packageReadme)) {
  throw new Error("The npm README must document canonical plugin factory names from mesurer-solid/plugins.");
}

const skillSource = new URL("../skills/mesurer-ui/SKILL.md", import.meta.url);

if (!existsSync(skillSource)) throw new Error("Missing packaged Agent Skill: skills/mesurer-ui/SKILL.md");

const repositorySkill = new URL("../../../.agents/skills/mesurer-ui/SKILL.md", import.meta.url);

const portablePluginSkill = new URL("../../../skills/mesurer-ui/SKILL.md", import.meta.url);

if (!existsSync(repositorySkill)) throw new Error("Missing repository Agent Skill: .agents/skills/mesurer-ui/SKILL.md");

if (!existsSync(portablePluginSkill)) throw new Error("Missing portable plugin Agent Skill: skills/mesurer-ui/SKILL.md");

const packagedSkillSource = readFileSync(skillSource, "utf8");

const repositorySkillSource = readFileSync(repositorySkill, "utf8");

const portablePluginSkillSource = readFileSync(portablePluginSkill, "utf8");

if (repositorySkillSource !== packagedSkillSource || portablePluginSkillSource !== packagedSkillSource) {
  throw new Error("Repository, portable-plugin, and packaged Mesurer Agent Skills must remain byte-identical.");
}

const codexBridgeScript = new URL("../src/plugins/codex/bridge.mjs", import.meta.url);

const codexBridgeTypes = new URL("../src/plugins/codex/bridge.d.ts", import.meta.url);

const codexDesktopScript = new URL("../src/plugins/codex/desktop.mjs", import.meta.url);

const codexPreloadScript = new URL("../src/plugins/codex/preload.mjs", import.meta.url);

const codexPreloadCjs = new URL("../src/plugins/codex/preload.cjs", import.meta.url);

const codexPreloadTypes = new URL("../src/plugins/codex/preload.d.ts", import.meta.url);

const recordingBridgeScript = new URL("../src/plugins/recording/bridge.mjs", import.meta.url);

const _recordingBridgeTypes = new URL("../src/plugins/recording/bridge.d.ts", import.meta.url);

const recordingPreloadScript = new URL("../src/plugins/recording/preload.mjs", import.meta.url);

const recordingPreloadCjs = new URL("../src/plugins/recording/preload.cjs", import.meta.url);

const _recordingPreloadTypes = new URL("../src/plugins/recording/preload.d.ts", import.meta.url);

const recordingElectronEsm = new URL("../src/plugins/recording/electron.mjs", import.meta.url);

const recordingElectronCjs = new URL("../src/plugins/recording/electron.cjs", import.meta.url);

const recordingElectronTypes = new URL("../src/plugins/recording/electron.d.ts", import.meta.url);

const recordingAutoPreload = new URL("../src/plugins/recording/auto-preload.cjs", import.meta.url);

if (
  !existsSync(codexBridgeScript)
  || !existsSync(codexBridgeTypes)
  || !existsSync(codexDesktopScript)
  || !existsSync(codexPreloadScript)
  || !existsSync(codexPreloadCjs)
  || !existsSync(codexPreloadTypes)
) {
  throw new Error("Missing packaged Codex Bridge plugin helper.");
}

const codexBridgeSource = readFileSync(codexBridgeScript, "utf8");

const codexDesktopSource = readFileSync(codexDesktopScript, "utf8");

const codexPreloadSource = readFileSync(codexPreloadScript, "utf8");

const codexPreloadCjsSource = readFileSync(codexPreloadCjs, "utf8");

const recordingBridgeSource = readFileSync(recordingBridgeScript, "utf8");

const recordingPreloadSource = readFileSync(recordingPreloadScript, "utf8");

const recordingPreloadCjsSource = readFileSync(recordingPreloadCjs, "utf8");

if (
  !existsSync(recordingElectronEsm)
  || !existsSync(recordingElectronCjs)
  || !existsSync(recordingElectronTypes)
  || !existsSync(recordingAutoPreload)
) {
  throw new Error("Missing package-owned Electron Recording bootstrap.");
}

const recordingElectronSource = readFileSync(recordingElectronCjs, "utf8");

const recordingAutoPreloadSource = readFileSync(recordingAutoPreload, "utf8");

for (const contract of [
  "export async function codexBridge",
  "export function installMesurerCodexHost",
  "\"activate\"",
  "\"deactivate\"",
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
  "desktopSessionFromEnvironment",
  "queueDesktopThread",
  "openDesktopThread",
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

for (const preloadSource of [codexPreloadSource, codexPreloadCjsSource]) {
  for (const contract of [
    "mesurer:codex-bridge",
    "createMesurerCodexPreloadBridge",
    "ipcRenderer",
  ]) {
    if (!preloadSource.includes(contract)) {
      throw new Error(`Packaged Codex preload helper is missing contract: ${contract}.`);
    }
  }

  for (const forbidden of ["node:child_process", "node:fs", "node:net", "codexBridge("]) {
    if (preloadSource.includes(forbidden)) {
      throw new Error(`Codex preload helper crosses the native bridge boundary: ${forbidden}.`);
    }
  }
}

for (const contract of [
  "installMesurerRecordingHost",
  "mesurer:recording-source",
  "getMediaSourceId",
  "validateSender",
]) {
  if (!recordingBridgeSource.includes(contract)) {
    throw new Error(`Packaged Recording host is missing contract: ${contract}.`);
  }
}

for (const preloadSource of [recordingPreloadSource, recordingPreloadCjsSource]) {
  for (const contract of [
    "mesurer:recording-source",
    "createMesurerRecordingPreloadBridge",
    "ipcRenderer",
  ]) {
    if (!preloadSource.includes(contract)) {
      throw new Error(`Packaged Recording preload helper is missing contract: ${contract}.`);
    }
  }

  for (const forbidden of ["desktopCapturer", "session.", "MediaRecorder"]) {
    if (preloadSource.includes(forbidden)) {
      throw new Error(`Recording preload helper crosses the capture boundary: ${forbidden}.`);
    }
  }
}

for (const contract of [
  "mesurer:electron-recording-source",
  "registerPreloadScript",
  "getMediaSourceId",
  "session-created",
  "installMesurerElectron",
  "Symbol.for",
]) {
  if (!recordingElectronSource.includes(contract)) {
    throw new Error(`Package-owned Electron bootstrap is missing contract: ${contract}.`);
  }
}

for (const contract of [
  "__MESURER_RECORDING_HOST__",
  "mesurer:electron-recording-source",
  "contextBridge",
  "ipcRenderer",
  "process.isMainFrame",
]) {
  if (!recordingAutoPreloadSource.includes(contract)) {
    throw new Error(`Automatic Electron Recording preload is missing contract: ${contract}.`);
  }
}

for (const forbidden of ["desktopCapturer", "MediaRecorder", "node:child_process"]) {
  if (recordingElectronSource.includes(forbidden) || recordingAutoPreloadSource.includes(forbidden)) {
    throw new Error(`Automatic Electron Recording path crossed a forbidden boundary: ${forbidden}.`);
  }
}

for (const contract of [
  "CODEX_THREAD_ID",
  "CODEX_APP_TOOLS_PIPE_PATH",
  "queue",
  "codex://threads/",
  "MESURER_CODEX_DESKTOP_OPEN_BIN",
]) {
  if (!codexDesktopSource.includes(contract)) {
    throw new Error(`Packaged Codex Desktop adapter is missing contract: ${contract}.`);
  }
}

for (const forbiddenDesktopPattern of [
  "createConnection(",
  "createServer(",
  "127.0.0.1:47365",
  "app-server daemon",
  "stdio-to-uds",
]) {
  if (codexDesktopSource.includes(forbiddenDesktopPattern)) {
    throw new Error(`Codex Desktop adapter crosses a forbidden transport boundary: ${forbiddenDesktopPattern}.`);
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

for (const [name, path] of [
  ["mesurer-codex", "scripts/codex-bridge.mjs"],
  ["mesurer-codex-connect", "scripts/codex-connect.mjs"],
]) {
  if (stagedPackageJson.bin?.[name] !== path) {
    throw new Error(`Expected staged ${name} bin path ${path}, got ${stagedPackageJson.bin?.[name] ?? "<missing>"}.`);
  }

  if (!existsSync(new URL(`../.publish/${path}`, import.meta.url))) {
    throw new Error(`Staged npm package is missing Codex companion executable: ${path}.`);
  }
}

for (const name of ["codex-bridge.mjs", "codex-connect.mjs", "codex-lifecycle.mjs"]) {
  if (!existsSync(new URL(`../.publish/codex/${name}`, import.meta.url))) {
    throw new Error(`Staged npm package is missing canonical Codex companion source: codex/${name}.`);
  }
}

const stagedMediaBunnyLicense = new URL("../.publish/dist/mediabunny-LICENSE.txt", import.meta.url);

if (!existsSync(stagedMediaBunnyLicense)) {
  throw new Error("Staged npm package is missing dist/mediabunny-LICENSE.txt.");
}

if (!/Mozilla Public License(?: Version)? 2\.0/i.test(readFileSync(stagedMediaBunnyLicense, "utf8"))) {
  throw new Error("Staged MediaBunny license artifact is not MPL-2.0.");
}

if (stagedPackageJson.dependencies && Object.keys(stagedPackageJson.dependencies).length > 0) {
  throw new Error("Staged npm package must not install MediaBunny or any other runtime dependency.");
}

if (!stagedPackageJson.exports?.["./plugins"]) {
  throw new Error("Staged npm package is missing the ./plugins export.");
}

if (!stagedPackageJson.exports?.["./mediabunny-vendor"]) {
  throw new Error("Staged npm package is missing the ./mediabunny-vendor export.");
}

if (!stagedPackageJson.exports?.["./plugins/codex/bridge"]) {
  throw new Error("Staged npm package is missing the ./plugins/codex/bridge export.");
}

if (!stagedPackageJson.exports?.["./plugins/codex/preload"]) {
  throw new Error("Staged npm package is missing the ./plugins/codex/preload export.");
}

if (!stagedPackageJson.exports?.["./plugins/recording/bridge"]) {
  throw new Error("Staged npm package is missing the ./plugins/recording/bridge export.");
}

if (!stagedPackageJson.exports?.["./plugins/recording/preload"]) {
  throw new Error("Staged npm package is missing the ./plugins/recording/preload export.");
}

if (!stagedPackageJson.exports?.["./electron"]) {
  throw new Error("Staged npm package is missing the ./electron export.");
}

for (const path of [
  "../.publish/plugins/recording/electron.mjs",
  "../.publish/plugins/recording/electron.cjs",
  "../.publish/plugins/recording/electron.d.ts",
  "../.publish/plugins/recording/auto-preload.cjs",
]) {
  if (!existsSync(new URL(path, import.meta.url))) {
    throw new Error(`Staged npm package is missing Electron bootstrap artifact: ${path}.`);
  }
}

for (const removedExport of ["./arrange", "./codex", "./screenshot"]) {
  if (stagedPackageJson.exports?.[removedExport]) {
    throw new Error(`Staged npm package retained obsolete plugin subpath ${removedExport}.`);
  }
}

for (const path of [
  "../.publish/plugins/codex/bridge.mjs",
  "../.publish/plugins/codex/bridge.d.ts",
  "../.publish/plugins/codex/desktop.mjs",
  "../.publish/plugins/codex/preload.mjs",
  "../.publish/plugins/codex/preload.cjs",
  "../.publish/plugins/codex/preload.d.ts",
  "../.publish/plugins/recording/bridge.mjs",
  "../.publish/plugins/recording/bridge.d.ts",
  "../.publish/plugins/recording/preload.mjs",
  "../.publish/plugins/recording/preload.cjs",
  "../.publish/plugins/recording/preload.d.ts",
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
  const installedMediaBunny = join(installRoot, ".agents/skills/mesurer-ui/assets/mediabunny-vendor.js");
  const installedCodexBridge = join(installRoot, ".agents/skills/mesurer-ui/assets/codex-bridge.mjs");
  const installedCodexConnect = join(installRoot, ".agents/skills/mesurer-ui/assets/codex-connect.mjs");
  const installedCodexLifecycle = join(installRoot, ".agents/skills/mesurer-ui/assets/codex-lifecycle.mjs");

  if (!existsSync(installedSkill)) throw new Error("mesurer-skill install did not create SKILL.md.");

  if (!existsSync(installedInjector)) throw new Error("mesurer-skill install did not create assets/inject-script.js.");

  if (!existsSync(installedMediaBunny)) throw new Error("mesurer-skill install did not create assets/mediabunny-vendor.js.");

  for (const path of [installedCodexBridge, installedCodexConnect, installedCodexLifecycle]) {
    if (!existsSync(path)) throw new Error(`mesurer-skill install did not create ${path.split("/").pop()}.`);
  }

  const sourceSkill = readFileSync(skillSource, "utf8");
  const copiedSkill = readFileSync(installedSkill, "utf8");

  if (copiedSkill !== sourceSkill) {
    throw new Error("Installed Agent Skill does not match the packaged canonical SKILL.md.");
  }

  const sourceInjector = readFileSync(new URL("../dist/inject-script.js", import.meta.url), "utf8");
  const copiedInjector = readFileSync(installedInjector, "utf8");
  const sourceMediaBunny = readFileSync(new URL("../dist/mediabunny-vendor.js", import.meta.url), "utf8");
  const copiedMediaBunny = readFileSync(installedMediaBunny, "utf8");

  if (!sourceInjector || copiedInjector !== sourceInjector) {
    throw new Error("Installed Agent Skill injector does not match the packaged inject-script artifact.");
  }

  if (!sourceMediaBunny || copiedMediaBunny !== sourceMediaBunny) {
    throw new Error("Installed Agent Skill MediaBunny vendor does not match the packaged vendor artifact.");
  }

} finally {
  rmSync(installRoot, { recursive: true, force: true });
}

console.log(`mesurer-solid@${packageJson.version} staged canonical Mesurer API, unified plugins entry, native and browser Codex transports, agent context, Edit movement, text edit intents, screenshot and MediaBunny recording tooling, and Agent Skill installer are self-contained.`);
