import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const url = process.env.RECORDING_REGION_URL ?? "http://127.0.0.1:4176/recording-region-contract.html";

const outputDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  process.env.RECORDING_REGION_OUTPUT ?? "../../test-results/recording-region",
);

mkdirSync(outputDir, { recursive: true });

const FULL_VIEWPORT = { width: 1000, height: 700 };

// Must match REGION in the fixture.
const REGION_SIZE = { width: 260, height: 150 };

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--auto-accept-this-tab-capture",
    "--use-fake-ui-for-media-stream",
  ],
});

const errors = [];

const failures = [];

const report = {};

const check = (condition, message, detail) => {
  if (!condition) failures.push(detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`);
};

const openPage = async (deviceScaleFactor = 1) => {
  const context = await browser.newContext({ viewport: FULL_VIEWPORT, deviceScaleFactor });
  const page = await context.newPage();

  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${message.text()} ${message.location().url}`);
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__MESURER_REGION_TEST__));

  return page;
};

const startRecording = async (page, { region, probe } = {}) => {
  await page.evaluate(async ({ region, probe }) => {
    const harness = window.__MESURER_REGION_TEST__;

    if (probe) harness.installCropProbe(probe);
    await harness.service.start(region ?? { ...harness.region });
  }, { region, probe });
  await page.waitForFunction(() =>
    window.__MESURER_REGION_TEST__.service.snapshot().status === "recording");
};

const stopAndDecode = async (page, name) => {
  const { pictures, ...result } = await page.evaluate(async () => {
    const harness = window.__MESURER_REGION_TEST__;
    const asset = await harness.service.stop();
    const decoded = await harness.decodeFrames(asset.blob);

    return {
      asset: { duration: asset.duration, width: asset.width, height: asset.height },
      ...decoded,
    };
  });

  pictures.forEach((picture, index) => {
    writeFileSync(
      resolve(outputDir, `${name}-frame-${index}-t${picture.timestamp.toFixed(3)}.png`),
      Buffer.from(picture.dataUrl.split(",")[1], "base64"),
    );
  });

  return result;
};

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);

  return sorted[Math.floor(sorted.length / 2)];
};

// The fixture puts a 40px red square 20px inside the region's top-left corner, so its
// centroid is (40, 40) in region pixels regardless of how the window is resized.
const EXPECTED_RED = { x: 40, y: 40, pixels: 40 * 40 };

// A stretched slice or an uncropped whole-tab frame changes the marker's position and footprint.
const checkFraming = (label, candidates, tolerance = 6, expected = EXPECTED_RED) => {
  const mismatches = [];

  for (const frame of candidates) {
    const actual = frame.red;

    if (
      !actual
      || Math.abs(actual.x - expected.x) > tolerance
      || Math.abs(actual.y - expected.y) > tolerance
      || Math.abs(actual.pixels / expected.pixels - 1) > 0.25
    ) {
      mismatches.push({ timestamp: frame.timestamp, actual });
    }
  }

  check(
    mismatches.length === 0,
    `${label}: red marker is off its region position in ${mismatches.length}/${candidates.length} frames`,
    { expected, firstMismatch: mismatches[0] },
  );
};

const resizeScenario = async (name, resizedViewport, { expectGreen, expectBlackRight }) => {
  const page = await openPage();

  try {
    await startRecording(page);
    await page.waitForTimeout(900);
    await page.setViewportSize(resizedViewport);
    await page.waitForTimeout(1500);

    const result = await stopAndDecode(page, name);
    const { frames } = result;

    await page.screenshot({ path: resolve(outputDir, `${name}-page.png`) });
    report[name] = {
      resizedViewport,
      asset: result.asset,
      frameCount: frames.length,
      first: frames[0],
      last: frames[frames.length - 1],
    };

    check(frames.length > 10, `${name}: too few decoded frames`, frames.length);
    check(
      frames.every((frame) => frame.width === REGION_SIZE.width && frame.height === REGION_SIZE.height),
      `${name}: every frame must keep the region size`,
      [...new Set(frames.map((frame) => `${frame.width}x${frame.height}`))],
    );

    const early = frames.filter((frame) => frame.timestamp >= 0.2 && frame.timestamp <= 0.7);
    const late = frames.filter((frame) => frame.timestamp >= result.duration - 0.6);

    check(early.length > 3 && late.length > 3, `${name}: could not sample early and late frames`, {
      early: early.length,
      late: late.length,
    });

    if (!early.length || !late.length) return;

    checkFraming(`${name} before resize`, early);
    checkFraming(`${name} after resize`, late);

    const lateGreen = late.filter((frame) => frame.green).length;

    check(
      expectGreen ? lateGreen > late.length * 0.8 : lateGreen === 0,
      `${name}: green marker visibility after resize`,
      { lateGreen, late: late.length },
    );

    const lateBlack = median(late.map((frame) => frame.blackRight));

    check(
      expectBlackRight ? lateBlack > 0.9 : lateBlack < 0.1,
      `${name}: clipped area must stay black, not stretched content`,
      { lateBlack },
    );

    const sweepEarly = new Set(early.map((frame) => Math.round(frame.blue?.x ?? -1)));

    check(sweepEarly.size > 3, `${name}: moving content did not change across frames`, [...sweepEarly]);
  } finally {
    await page.context().close();
  }
};

const firstFrameScenario = async () => {
  const page = await openPage();

  try {
    await startRecording(page);
    await page.waitForTimeout(900);

    const { frames } = await stopAndDecode(page, "first-frame");
    const [first, second] = frames;

    report.firstFrame = { first, second };
    check(first && second, "first-frame: needs two frames", frames.length);

    if (!first || !second) return;
    check(
      first.width === REGION_SIZE.width && first.height === REGION_SIZE.height,
      "first-frame: first frame must have the exact region size",
      { width: first.width, height: first.height },
    );
    checkFraming("first-frame", [first, second]);
  } finally {
    await page.context().close();
  }
};

const colorPickerScenario = async () => {
  const page = await openPage();

  try {
    await startRecording(page);
    await page.waitForTimeout(500);

    const statuses = [];

    const sampleStatus = async () =>
      statuses.push(await page.evaluate(() => window.__MESURER_REGION_TEST__.service.snapshot().status));

    const picker = page.getByRole("button", { name: "Color picker (P)" });

    await picker.waitFor({ state: "visible" });
    await picker.click();
    await page.waitForTimeout(400);
    await sampleStatus();
    // Sample a color, then dismiss the picker again.
    await page.mouse.click(200, 200);
    await page.waitForTimeout(600);
    await sampleStatus();
    await picker.click();
    await page.waitForTimeout(400);
    await sampleStatus();
    await picker.click();
    await page.waitForTimeout(500);
    await sampleStatus();

    // Same flow through the P shortcut.
    await page.keyboard.press("p");
    await page.waitForTimeout(400);
    await sampleStatus();
    await page.mouse.click(200, 200);
    await page.waitForTimeout(600);
    await sampleStatus();
    await page.keyboard.press("p");
    await page.waitForTimeout(400);
    await sampleStatus();

    report.colorPicker = { statuses };
    check(
      statuses.every((status) => status === "recording"),
      "color-picker: Recording must stay active while Color Picker opens and closes",
      statuses,
    );

    if (statuses.at(-1) !== "recording") return;

    const result = await stopAndDecode(page, "color-picker");

    report.colorPicker = { statuses, asset: result.asset, frameCount: result.frames.length };
    check(result.asset.duration >= 2.0, "color-picker: export must cover the whole span", result.asset);
    check(
      result.frames.every((frame) => frame.width === REGION_SIZE.width && frame.height === REGION_SIZE.height),
      "color-picker: frames must keep the region size",
    );
  } finally {
    await page.context().close();
  }
};

const decodeExport = (page, options) =>
  page.evaluate(async (exportOptions) => {
    const harness = window.__MESURER_REGION_TEST__;
    const exported = await harness.service.export(exportOptions);
    const decoded = await harness.decodeFrames(exported.blob);

    return { reportedDuration: exported.duration, duration: decoded.duration, frames: decoded.frames };
  }, options);

const speedScenario = async () => {
  const page = await openPage();

  try {
    await startRecording(page);
    await page.waitForTimeout(2600);
    await page.evaluate(() => window.__MESURER_REGION_TEST__.service.stop());

    const asset = await page.evaluate(() => {
      const { duration, width, height } = window.__MESURER_REGION_TEST__.service.snapshot();

      return { duration, width, height };
    });

    const trim = { startTime: 0.5, endTime: 2.0 };
    const trimmed = trim.endTime - trim.startTime;
    const exports = {};

    const mp4 = await page.evaluate(
      ({ width, height }) => window.__MESURER_REGION_TEST__.canEncodeMp4(width, height),
      asset,
    );

    if (!mp4) console.log("Skipping MP4 speed coverage: this Chromium cannot encode AVC video.");
    report.mp4SpeedSkipped = !mp4;

    const variants = [1, 2, 0.5, 1.5].map((speed) => ({ format: "webm", speed }));

    if (mp4) variants.push({ format: "mp4", speed: 1 }, { format: "mp4", speed: 1.5 });

    for (const { format, speed } of variants) {
      const key = format === "webm" ? speed : `${format}-${speed}`;
      const result = await decodeExport(page, { format, ...trim, speed });
      const times = result.frames.map((frame) => frame.timestamp);
      const expected = trimmed / speed;

      exports[key] = { expected, duration: result.duration, frameCount: times.length, first: times[0], last: times.at(-1) };
      check(
        Math.abs(result.duration - expected) <= 0.2,
        `speed ${format} ${speed}x: duration must be trimmed duration / speed`,
        exports[key],
      );
      check(
        times.length > 5 && times.every((time, index) => index === 0 || time > times[index - 1]),
        `speed ${format} ${speed}x: frame timestamps must be strictly increasing`,
        { frames: times.length },
      );
      check(
        result.frames.every((frame) => frame.width === asset.width && frame.height === asset.height),
        `speed ${format} ${speed}x: export must keep the recorded size`,
      );
    }

    // Only an omitted speed means 1x; anything else outside the offered set must fail loudly.
    for (const speed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 3, "2", null]) {
      const outcome = await page.evaluate(async (value) => {
        const harness = window.__MESURER_REGION_TEST__;
        const describe = (cause) => (cause instanceof Error ? cause.message : String(cause));

        const attempt = async (run) => {
          try {
            await run();

            return "accepted";
          } catch (cause) {
            return describe(cause);
          }
        };

        return {
          service: await attempt(() => harness.service.export({ format: "webm", speed: value })),
          command: await attempt(() => window.__MESURER__.command("recording.export", { speed: value })),
        };
      }, speed);

      for (const [boundary, message] of Object.entries(outcome)) {
        check(
          message !== "accepted" && /speed/i.test(message),
          `speed: ${String(speed)} must be rejected with a speed error at the ${boundary} boundary`,
          message,
        );
      }
    }

    // The default must stay 1x so existing callers keep their duration.
    const implicit = await decodeExport(page, { format: "webm", ...trim });

    check(
      Math.abs(implicit.duration - exports[1].duration) <= 0.05,
      "speed: omitting speed must match 1x",
      { implicit: implicit.duration, explicit: exports[1].duration },
    );

    // The editor's Speed choice must reach the exporter through a real download.
    const island = page.locator("[data-mesurer-island='true']");

    await island.locator("[data-mesurer-recording-preview='true']").waitFor({ state: "visible" });
    await island.locator("[data-mesurer-recording-export-options='true']").click();

    const menuText = await island.locator("[data-mesurer-recording-export-menu='true']").textContent();

    check(menuText?.includes("Speed"), "speed: export menu must list a Speed section", menuText);

    const labels = await island.locator("[data-mesurer-recording-speed]").evaluateAll((rows) =>
      rows.map((row) => `${row.getAttribute("data-mesurer-recording-speed")}:${row.getAttribute("aria-checked")}`));

    const offered = JSON.stringify(labels) === JSON.stringify(["0.5:false", "1:true", "1.5:false", "2:false"]);

    check(offered, "speed: editor must offer 0.5x/1x/1.5x/2x with 1x selected by default", labels);

    if (!offered) {
      report.speed = { asset, exports };

      return;
    }

    await island.locator("[data-mesurer-recording-speed='2']").click();
    check(
      (await island.locator("[data-mesurer-recording-speed='2']").getAttribute("aria-checked")) === "true",
      "speed: choosing 2x must mark it selected",
    );
    await island.locator("[data-mesurer-recording-export-options='true']").click();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      island.locator("[data-mesurer-recording-export='true']").click(),
    ]);

    const bytes = readFileSync(await download.path());

    writeFileSync(resolve(outputDir, "speed-editor-2x.webm"), bytes);

    const downloaded = await page.evaluate(async (base64) => {
      const raw = atob(base64);
      const data = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      const decoded = await window.__MESURER_REGION_TEST__.decodeFrames(new Blob([data]));

      return { duration: decoded.duration };
    }, bytes.toString("base64"));

    exports.editor2x = { expected: asset.duration / 2, duration: downloaded.duration };
    check(
      Math.abs(downloaded.duration - asset.duration / 2) <= 0.25,
      "speed: editor download at 2x must be half the clip duration",
      exports.editor2x,
    );
    report.speed = { asset, exports };
  } finally {
    await page.context().close();
  }
};

const SCALED_REGION = { left: 480, top: 330, width: 500, height: 350 };

// The red marker sits 240px/140px inside SCALED_REGION; a whole-tab frame shrunk into it would move and shrink the marker.
const SCALED_RED = { x: 260, y: 160, pixels: 40 * 40 };

const cropScenario = async (name, {
  deviceScaleFactor = 1,
  region,
  probe,
  expectCalls,
  expectSize = REGION_SIZE,
  expectedRed = EXPECTED_RED,
  expectStream,
  expectStalled = false,
}) => {
  const page = await openPage(deviceScaleFactor);

  try {
    await startRecording(page, { region, probe });
    await page.waitForTimeout(900);

    const log = await page.evaluate(() => window.__MESURER_REGION_TEST__.readCropProbe());
    const result = await stopAndDecode(page, name);
    const { frames } = result;

    report[name] = { log, asset: result.asset, frameCount: frames.length, first: frames[0] };
    check(
      JSON.stringify(log.cropCalls) === JSON.stringify(expectCalls),
      `${name}: unexpected cropTo sequence`,
      { expected: expectCalls, actual: log.cropCalls },
    );

    if (expectStream) {
      check(
        log.streamSize?.width === expectStream.width && log.streamSize?.height === expectStream.height,
        `${name}: uncropped stream must be ${expectStream.width}x${expectStream.height}`,
        log.streamSize,
      );
    }

    if (expectStalled) {
      check(
        log.frameRequests > 0 && log.frameCancels === log.frameRequests,
        `${name}: every outstanding video-frame callback must be cancelled`,
        log,
      );
    }

    check(frames.length > 5, `${name}: too few decoded frames`, frames.length);
    check(
      frames.every((frame) => frame.width === expectSize.width && frame.height === expectSize.height),
      `${name}: every frame must be exactly the selection size`,
      [...new Set(frames.map((frame) => `${frame.width}x${frame.height}`))],
    );
    checkFraming(name, frames.filter((frame) => frame.timestamp <= 0.7), 8, expectedRed);
  } finally {
    await page.context().close();
  }
};

const cropScenarios = async () => {
  await cropScenario("crop-first-fails", {
    probe: { crop: "drop-first" },
    expectCalls: ["target", "target"],
  });
  await cropScenario("crop-repeated-failure", {
    probe: { crop: "drop-all" },
    expectCalls: ["target", "target", "null"],
  });
  await cropScenario("crop-no-presented-frames", {
    probe: { crop: "real", stallFrames: true },
    expectCalls: ["target", "target", "null"],
    expectStalled: true,
  });
  await cropScenario("crop-scaled-whole-tab", {
    deviceScaleFactor: 2,
    region: SCALED_REGION,
    probe: { crop: "drop-all", wholeTabSize: FULL_VIEWPORT },
    expectStream: FULL_VIEWPORT,
    expectCalls: ["target", "target", "null"],
    expectSize: { width: 500, height: 350 },
    expectedRed: SCALED_RED,
  });
  await cropScenario("crop-selection-fills-viewport", {
    region: { left: 0, top: 0, ...FULL_VIEWPORT },
    probe: { crop: "real" },
    expectCalls: [],
    expectSize: FULL_VIEWPORT,
    expectedRed: { x: 740, y: 490, pixels: 40 * 40 },
  });
};

try {
  await cropScenarios();
  await speedScenario();
  await resizeScenario("resize-region-visible", { width: 960, height: 660 }, {
    expectGreen: true,
    expectBlackRight: false,
  });
  await resizeScenario("resize-region-clipped", { width: 820, height: 700 }, {
    expectGreen: false,
    expectBlackRight: true,
  });
  await firstFrameScenario();
  await colorPickerScenario();
} finally {
  await browser.close();
}

if (errors.length) failures.push(`browser errors: ${errors.join(" | ")}`);

writeFileSync(
  resolve(outputDir, "recording-region-contract.json"),
  JSON.stringify({ failures, report }, null, 2),
);

if (failures.length) {
  console.error(`Recording region contract: FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Recording region contract: PASS");

console.log(JSON.stringify(report, null, 2));
