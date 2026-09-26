import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOLBAR_POSITION,
  MACOS_ELECTRON_TITLEBAR_SAFE_TOP,
  MACOS_ELECTRON_TOOLBAR_POSITION,
  constrainToolbarPosition,
  getDefaultToolbarPosition,
  resolveInitialToolbarPosition,
  type ToolbarHostEnvironment,
} from "../src/runtime/toolbar-position";

const fakeWindow = (options: {
  platform: string;
  userAgent: string;
  electronVersion?: string;
}) : ToolbarHostEnvironment => ({
  navigator: {
    platform: options.platform,
    userAgent: options.userAgent,
  },
  process: options.electronVersion
    ? { type: "renderer", versions: { electron: options.electronVersion } }
    : undefined,
});

describe("default toolbar position", () => {
  it("starts below the macOS titlebar area in Electron", () => {
    const ownerWindow = fakeWindow({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150.0.0.0 Electron/43.1.1 Safari/537.36",
    });

    expect(getDefaultToolbarPosition(ownerWindow)).toEqual(MACOS_ELECTRON_TOOLBAR_POSITION);
    expect(MACOS_ELECTRON_TOOLBAR_POSITION.x).toBeGreaterThan(DEFAULT_TOOLBAR_POSITION.x);
    expect(MACOS_ELECTRON_TOOLBAR_POSITION.y).toBe(MACOS_ELECTRON_TITLEBAR_SAFE_TOP);
  });

  it("also detects macOS Electron through renderer process metadata", () => {
    const ownerWindow = fakeWindow({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
      electronVersion: "43.1.1",
    });

    expect(getDefaultToolbarPosition(ownerWindow)).toEqual(MACOS_ELECTRON_TOOLBAR_POSITION);
  });

  it("preserves a saved position below the macOS titlebar area", () => {
    const ownerWindow = fakeWindow({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150.0.0.0 Electron/43.1.1 Safari/537.36",
    });

    expect(resolveInitialToolbarPosition(ownerWindow, { x: 24, y: 72 })).toEqual({ x: 24, y: 72 });
  });

  it("moves a saved position below the macOS titlebar area", () => {
    const ownerWindow = fakeWindow({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150.0.0.0 Electron/43.1.1 Safari/537.36",
    });

    expect(resolveInitialToolbarPosition(ownerWindow, { x: 16, y: 16 })).toEqual({
      x: 16,
      y: MACOS_ELECTRON_TITLEBAR_SAFE_TOP,
    });
  });

  it("prevents dragging into the macOS titlebar area anywhere across the window", () => {
    const ownerWindow = fakeWindow({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150.0.0.0 Electron/43.1.1 Safari/537.36",
    });

    expect(constrainToolbarPosition(
      ownerWindow,
      { x: 320, y: 8 },
      { width: 438, height: 40 },
      { width: 900, height: 700 },
    )).toEqual({
      x: 320,
      y: MACOS_ELECTRON_TITLEBAR_SAFE_TOP,
    });
  });

  it("allows the toolbar against the left edge below the macOS titlebar area", () => {
    const ownerWindow = fakeWindow({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150.0.0.0 Electron/43.1.1 Safari/537.36",
    });

    expect(constrainToolbarPosition(
      ownerWindow,
      { x: 8, y: 72 },
      { width: 438, height: 40 },
      { width: 900, height: 700 },
    )).toEqual({ x: 8, y: 72 });
  });

  it("does not apply the titlebar exclusion in a normal macOS browser", () => {
    const ownerWindow = fakeWindow({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    });

    expect(constrainToolbarPosition(
      ownerWindow,
      { x: 8, y: 8 },
      { width: 438, height: 40 },
      { width: 900, height: 700 },
    )).toEqual({ x: 8, y: 8 });
  });

  it("keeps the browser default on macOS outside Electron", () => {
    const ownerWindow = fakeWindow({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    });

    expect(getDefaultToolbarPosition(ownerWindow)).toEqual(DEFAULT_TOOLBAR_POSITION);
  });

  it("keeps the normal default for Electron on other platforms", () => {
    const ownerWindow = fakeWindow({
      platform: "Linux x86_64",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/150.0.0.0 Electron/43.1.1 Safari/537.36",
    });

    expect(getDefaultToolbarPosition(ownerWindow)).toEqual(DEFAULT_TOOLBAR_POSITION);
  });
});
