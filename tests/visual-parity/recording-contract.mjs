import { chromium } from "playwright";

const url = process.env.RECORDING_URL ?? "http://127.0.0.1:4175/recording-contract.html";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const colorsDiffer = (left, right) =>
  left.slice(0, 3).some((value, index) => Math.abs(value - right[index]) >= 8);

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__MESURER_RECORDING_TEST__));

  const island = page.locator("[data-mesurer-island='true']");
  const recordButton = island.locator("[data-mesurer-tool-id='recording'] button").first();

  const defaultFrameRate = await page.evaluate(() =>
    window.__MESURER_RECORDING_TEST__?.service.settings().frameRate);

  if (defaultFrameRate !== 60) {
    throw new Error(`Recording must default to 60 fps, got ${defaultFrameRate}`);
  }

  await recordButton.waitFor({ state: "visible" });

  if ((await recordButton.getAttribute("aria-label")) !== "Record (Shift+R)") {
    throw new Error(`Recording plugin mounted with an unexpected shortcut label: ${await recordButton.getAttribute("aria-label")}`);
  }

  await recordButton.click();

  await page.waitForFunction(() => window.__MESURER_RECORDING_TEST__?.service.snapshot().status === "selecting");

  const toolbarVisibility = await island.locator("[data-mesurer-toolbar='true']")
    .evaluate((element) => getComputedStyle(element).visibility);

  if (toolbarVisibility !== "hidden") {
    throw new Error(`Recording selection must hide the toolbar, got ${toolbarVisibility}`);
  }

  const overlay = island.locator("[data-mesurer-recording-select='true']");

  await overlay.waitFor({ state: "visible" });
  await page.mouse.move(220, 200);
  await page.mouse.down();
  await page.mouse.move(540, 380, { steps: 8 });
  await page.mouse.up();

  await page.waitForFunction(() => {
    const snapshot = window.__MESURER_RECORDING_TEST__?.service.snapshot();

    return snapshot?.status === "selecting"
      && snapshot.rect?.width === 320
      && snapshot.rect?.height === 180;
  });

  const regionPanel = island.locator("[data-mesurer-recording-region='true']");
  const startRecording = island.locator("[data-mesurer-recording-start='true']");

  await regionPanel.waitFor({ state: "visible" });
  await startRecording.waitFor({ state: "visible" });

  const selectionSnapshot = await page.evaluate(() =>
    window.__MESURER_RECORDING_TEST__?.service.snapshot());

  if (selectionSnapshot?.status !== "selecting") {
    throw new Error(`Dragging a Recording region must not start capture immediately: ${JSON.stringify(selectionSnapshot)}`);
  }

  await startRecording.click();
  await page.waitForFunction(() => window.__MESURER_RECORDING_TEST__?.service.snapshot().status === "recording");

  const toolbarDuringRecording = await island.locator("[data-mesurer-toolbar='true']")
    .evaluate((element) => getComputedStyle(element).visibility);

  if (toolbarDuringRecording !== "visible") {
    throw new Error(`Recording must restore the toolbar after region confirmation, got ${toolbarDuringRecording}`);
  }

  const recordingRootPointerEvents = await island.locator("[data-mesurer-recording='true']")
    .evaluate((element) => getComputedStyle(element).pointerEvents);

  if (recordingRootPointerEvents !== "none") {
    throw new Error(`Recording root must not block host-page interaction, got pointer-events=${recordingRootPointerEvents}`);
  }

  const interactionTarget = page.locator("[data-testid='record-interaction']");
  await interactionTarget.click();

  if ((await interactionTarget.getAttribute("data-clicks")) !== "1") {
    throw new Error("Host-page button did not receive a click while Recording was active");
  }

  const recordingStatus = island.locator("[data-mesurer-recording-status='true']");
  const recordingStop = island.locator("[data-mesurer-recording-stop='true']");

  await recordingStatus.waitFor({ state: "visible" });
  await recordingStop.waitFor({ state: "visible" });

  const recordingChrome = await recordingStatus.evaluate((element) => {
    const statusRoot = element.closest("[data-mesurer-recording-status-root='true']");

    const toolbar = element.getRootNode() instanceof ShadowRoot
      ? element.getRootNode().querySelector("[data-mesurer-toolbar='true']")
      : null;

    if (!(statusRoot instanceof HTMLElement) || !(toolbar instanceof HTMLElement)) {
      throw new Error("Recording status layering contract could not resolve its roots");
    }

    const statusRect = element.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();

    return {
      statusRootZ: Number(getComputedStyle(statusRoot).zIndex),
      toolbarZ: Number(getComputedStyle(toolbar).zIndex),
      opacity: getComputedStyle(element).opacity,
      overlapsToolbar:
        statusRect.left < toolbarRect.right
        && statusRect.right > toolbarRect.left
        && statusRect.top < toolbarRect.bottom
        && statusRect.bottom > toolbarRect.top,
    };
  });

  if (
    !(recordingChrome.statusRootZ > recordingChrome.toolbarZ)
    || recordingChrome.opacity !== "1"
    || recordingChrome.overlapsToolbar
  ) {
    throw new Error(`Recording status must stay undimmed and above/clear of the toolbar: ${JSON.stringify(recordingChrome)}`);
  }

  await page.waitForTimeout(850);
  await recordingStop.click();
  await page.waitForFunction(() => window.__MESURER_RECORDING_TEST__?.service.snapshot().status === "ready", null, {
    timeout: 15000,
  });

  const snapshot = await page.evaluate(() => window.__MESURER_RECORDING_TEST__?.service.snapshot());

  if (!snapshot) throw new Error("Recording snapshot unavailable after stop");

  if (snapshot.width !== 320 || snapshot.height !== 180) {
    throw new Error(`Expected selected recording dimensions 320x180, got ${snapshot.width}x${snapshot.height}`);
  }

  if (!snapshot.duration || snapshot.duration <= 0.2) {
    throw new Error(`Recorded clip duration was unexpectedly short: ${snapshot.duration}`);
  }

  const preview = island.locator("[data-mesurer-recording-preview='true']");

  await preview.waitFor({ state: "visible" });

  const previewBox = await preview.boundingBox();

  if (!previewBox || Math.abs(previewBox.width - 352) > 1) {
    throw new Error(`Recording editor must use upstream's 352px collapsed width: ${JSON.stringify(previewBox)}`);
  }

  const collapsedCenter = previewBox.x + previewBox.width / 2;

  const settingsButton = island.locator("[data-mesurer-builtin='settings'] button").first();
  const settingsDialog = island.getByRole("dialog", { name: "Settings" });

  await settingsButton.click();
  await settingsDialog.waitFor({ state: "visible" });

  const generalTab = settingsDialog.getByRole("tab", { name: "General" });

  if ((await generalTab.getAttribute("aria-selected")) !== "true") await generalTab.click();

  const appearance = settingsDialog.getByRole("combobox", { name: "Appearance" });
  const previousTheme = await appearance.inputValue();

  const readRecordingTheme = async (theme) => {
    await appearance.selectOption(theme);
    await page.waitForFunction((expected) => {
      const island = document.querySelector("[data-mesurer-island='true']");
      const preview = island?.shadowRoot?.querySelector("[data-mesurer-recording-preview='true']");
      const themedRoot = preview?.closest("[data-theme]");

      return themedRoot?.getAttribute("data-theme") === expected;
    }, theme);

    return preview.evaluate((element) => {
      const timeline = element.querySelector("[data-mesurer-recording-timeline-rail='true']");
      const themedRoot = element.closest("[data-theme]");

      if (!(timeline instanceof HTMLElement) || !(themedRoot instanceof HTMLElement)) {
        throw new Error("Recording theme contract could not resolve themed editor surfaces");
      }

      const previewStyle = getComputedStyle(element);
      const timelineStyle = getComputedStyle(timeline);

      return {
        theme: themedRoot.getAttribute("data-theme"),
        background: previewStyle.backgroundColor,
        color: previewStyle.color,
        timeline: timelineStyle.backgroundColor,
      };
    });
  };

  const themeStates = {
    light: await readRecordingTheme("light"),
    dark: await readRecordingTheme("dark"),
  };

  await appearance.selectOption(previousTheme);
  await settingsButton.click();
  await settingsDialog.waitFor({ state: "hidden" });

  if (
    themeStates.light.theme !== "light"
    || themeStates.dark.theme !== "dark"
    || themeStates.light.background === themeStates.dark.background
    || themeStates.light.color === themeStates.dark.color
    || themeStates.light.timeline === themeStates.dark.timeline
  ) {
    throw new Error(`Recording editor did not follow Settings Appearance across Light/Dark: ${JSON.stringify(themeStates)}`);
  }

  const timeline = island.locator("[data-mesurer-recording-timeline='true']");
  const trimStartHandle = island.locator("[data-mesurer-recording-trim-handle='start']");
  const trimEndHandle = island.locator("[data-mesurer-recording-trim-handle='end']");
  const exportOptions = island.locator("[data-mesurer-recording-export-options='true']");
  const exportMenu = island.locator("[data-mesurer-recording-export-menu='true']");
  const download = island.locator("[data-mesurer-recording-export='true']");
  const expand = island.locator("[data-mesurer-recording-expand='true']");
  const play = island.locator("[data-mesurer-recording-play='true']");

  await timeline.waitFor({ state: "visible" });
  await trimStartHandle.waitFor({ state: "visible" });
  await trimEndHandle.waitFor({ state: "visible" });

  if ((await trimStartHandle.getAttribute("role")) !== "slider" || (await trimEndHandle.getAttribute("role")) !== "slider") {
    throw new Error("Recording timeline trim handles must expose slider semantics");
  }

  await exportOptions.click();
  await exportMenu.waitFor({ state: "visible" });

  const exportMenuText = await exportMenu.textContent();

  if (!exportMenuText?.includes("Format") || !exportMenuText.includes("Size")) {
    throw new Error(`Recording export menu is missing upstream sections: ${exportMenuText}`);
  }

  await island.locator("[data-mesurer-recording-scale='2']").click();

  if ((await exportOptions.textContent())?.trim() !== "2×") {
    throw new Error(`Recording export size control did not switch to 2×: ${await exportOptions.textContent()}`);
  }

  await exportOptions.click();

  const trimBefore = Number(await trimStartHandle.getAttribute("aria-valuenow"));
  const timelineBox = await timeline.boundingBox();
  const trimStartBox = await trimStartHandle.boundingBox();

  if (!timelineBox || !trimStartBox) {
    throw new Error("Recording timeline/trim-start handle has no rendered geometry");
  }

  await page.mouse.move(
    trimStartBox.x + trimStartBox.width / 2,
    trimStartBox.y + trimStartBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    timelineBox.x + timelineBox.width * 0.28,
    timelineBox.y + timelineBox.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();

  const trimAfter = Number(await trimStartHandle.getAttribute("aria-valuenow"));

  if (!(trimAfter > trimBefore)) {
    throw new Error(`Recording trim-start handle did not move forward: ${JSON.stringify({ trimBefore, trimAfter })}`);
  }

  await expand.click();
  await page.waitForFunction(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const preview = island?.shadowRoot?.querySelector("[data-mesurer-recording-preview='true']");

    return preview instanceof HTMLElement && preview.getBoundingClientRect().width >= 560;
  });

  const expandedBox = await preview.boundingBox();

  if (!expandedBox || expandedBox.width < 560) {
    throw new Error(`Recording editor did not expand to upstream's 576px card: ${JSON.stringify(expandedBox)}`);
  }

  const expandedCenter = expandedBox.x + expandedBox.width / 2;

  if (Math.abs(expandedCenter - collapsedCenter) > 1.5) {
    throw new Error(`Recording editor expansion shifted horizontally: ${JSON.stringify({
      collapsedCenter,
      expandedCenter,
      previewBox,
      expandedBox,
    })}`);
  }

  if ((await expand.getAttribute("aria-label")) !== "Shrink preview") {
    throw new Error("Recording editor expand control did not switch to Shrink preview");
  }

  await expand.click();
  await page.waitForFunction(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const preview = island?.shadowRoot?.querySelector("[data-mesurer-recording-preview='true']");

    return preview instanceof HTMLElement && preview.getBoundingClientRect().width <= 353;
  });

  const collapsedAgainBox = await preview.boundingBox();

  if (
    !collapsedAgainBox
    || Math.abs(collapsedAgainBox.x + collapsedAgainBox.width / 2 - collapsedCenter) > 1.5
  ) {
    throw new Error(`Recording editor shrink shifted horizontally: ${JSON.stringify({
      collapsedCenter,
      collapsedAgainBox,
    })}`);
  }

  if ((await play.getAttribute("aria-label")) !== "Play") {
    throw new Error("Recording editor play control did not start in the Play state");
  }

  await play.click();
  await page.waitForFunction(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const button = island?.shadowRoot?.querySelector("[data-mesurer-recording-play='true']");

    return button?.getAttribute("aria-label") === "Pause";
  });
  await play.click();

  if ((await download.getAttribute("aria-label")) !== "Download") {
    throw new Error("Recording editor must expose upstream's compact Download control");
  }

  const formats = await page.evaluate(() => window.__MESURER_RECORDING_TEST__?.service.formats());

  if (!formats?.includes("webm")) {
    throw new Error(`MediaBunny WebM export must be available in Chromium: ${JSON.stringify(formats)}`);
  }

  const webmExport = await page.evaluate(async () => {
    const service = window.__MESURER_RECORDING_TEST__?.service;

    if (!service) throw new Error("Recording service unavailable");
    const current = service.snapshot();

    const duration = current.duration ?? 0;

    const result = await service.export({
      format: "webm",
      startTime: 0,
      endTime: Math.max(0.1, duration * 0.6),
      scale: 2,
    });

    return {
      type: result.blob.type,
      bytes: result.blob.size,
      duration: result.duration,
      width: result.width,
      height: result.height,
      filename: result.filename,
    };
  });

  if (
    webmExport.type !== "video/webm"
    || webmExport.bytes <= 0
    || webmExport.width !== 640
    || webmExport.height !== 360
  ) {
    throw new Error(`Unexpected MediaBunny WebM export: ${JSON.stringify(webmExport)}`);
  }

  if (webmExport.duration >= snapshot.duration) {
    throw new Error(`Trimmed MediaBunny export did not shorten the clip: ${JSON.stringify({ snapshot, webmExport })}`);
  }

  if (!webmExport.filename.endsWith(".webm")) {
    throw new Error(`WebM export used an unexpected filename: ${webmExport.filename}`);
  }

  let mp4Export = null;

  if (formats.includes("mp4")) {
    mp4Export = await page.evaluate(async () => {
      const service = window.__MESURER_RECORDING_TEST__?.service;

      if (!service) throw new Error("Recording service unavailable");
      const result = await service.export({ format: "mp4", scale: 1 });

      return {
        type: result.blob.type,
        bytes: result.blob.size,
        width: result.width,
        height: result.height,
        filename: result.filename,
      };
    });

    if (mp4Export.type !== "video/mp4" || mp4Export.bytes <= 0 || !mp4Export.filename.endsWith(".mp4")) {
      throw new Error(`Unexpected MediaBunny MP4 export: ${JSON.stringify(mp4Export)}`);
    }
  }

  const browserCounters = await page.evaluate(() =>
    window.__MESURER_RECORDING_TEST__?.counters());

  if (
    !browserCounters
    || browserCounters.displayMediaRequests !== 1
    || browserCounters.extensionMediaRequests !== 0
  ) {
    throw new Error(`Initial Recording did not use the browser picker path exactly once: ${JSON.stringify(browserCounters)}`);
  }

  await page.evaluate(() => {
    window.__MESURER_RECORDING_TEST__?.setExtensionBridge(true);
  });

  const movingFrames = await page.evaluate(() =>
    window.__MESURER_RECORDING_TEST__?.record(
      { left: 120, top: 110, width: 240, height: 140 },
      1000,
    ));

  if (!movingFrames) throw new Error("Programmatic recording result unavailable");

  if (movingFrames.asset.width !== 240 || movingFrames.asset.height !== 140 || movingFrames.asset.bytes <= 0) {
    throw new Error(`Programmatic recording dimensions/bytes are invalid: ${JSON.stringify(movingFrames.asset)}`);
  }

  if (!colorsDiffer(movingFrames.samples.first, movingFrames.samples.second)) {
    throw new Error(`Decoded recording frames did not change over time: ${JSON.stringify(movingFrames.samples)}`);
  }

  if (movingFrames.samples.width !== 240 || movingFrames.samples.height !== 140) {
    throw new Error(`Decoded recording dimensions changed: ${JSON.stringify(movingFrames.samples)}`);
  }

  const extensionCounters = await page.evaluate(() =>
    window.__MESURER_RECORDING_TEST__?.counters());

  if (
    !extensionCounters
    || extensionCounters.displayMediaRequests !== browserCounters.displayMediaRequests
    || extensionCounters.extensionMediaRequests !== 1
  ) {
    throw new Error(`Extension bridge did not replace the browser picker: ${JSON.stringify({ browserCounters, extensionCounters })}`);
  }

  await page.evaluate(async () => {
    window.__MESURER_RECORDING_TEST__?.setExtensionBridge(false);
    const service = window.__MESURER_RECORDING_TEST__?.service;

    if (!service) throw new Error("Recording service unavailable");
    await service.start();
  });

  await overlay.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__MESURER_RECORDING_TEST__?.service.snapshot().status === "idle");

  if (await overlay.isVisible()) throw new Error("Escape did not cancel Recording selection");

  if (errors.length) throw new Error(`Recording browser errors:\n${errors.join("\n")}`);

  console.log("MediaBunny recording browser contract: PASS");
  console.log(JSON.stringify({
    snapshot,
    defaultFrameRate,
    formats,
    webmExport,
    mp4Export,
    browserCounters,
    extensionCounters,
    movingFrames,
  }, null, 2));
} finally {
  await page.close();
  await browser.close();
}
