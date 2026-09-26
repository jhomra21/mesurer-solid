import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOLBAR_POSITION,
  MACOS_ELECTRON_TOOLBAR_POSITION,
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
  it("clears the macOS traffic-light area in Electron", () => {
    const ownerWindow = fakeWindow({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150.0.0.0 Electron/43.1.1 Safari/537.36",
    });

    expect(getDefaultToolbarPosition(ownerWindow)).toEqual(MACOS_ELECTRON_TOOLBAR_POSITION);
    expect(MACOS_ELECTRON_TOOLBAR_POSITION.x).toBeGreaterThan(DEFAULT_TOOLBAR_POSITION.x);
    expect(MACOS_ELECTRON_TOOLBAR_POSITION.y).toBe(DEFAULT_TOOLBAR_POSITION.y);
  });

  it("also detects macOS Electron through renderer process metadata", () => {
    const ownerWindow = fakeWindow({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
      electronVersion: "43.1.1",
    });

    expect(getDefaultToolbarPosition(ownerWindow)).toEqual(MACOS_ELECTRON_TOOLBAR_POSITION);
  });

  it("preserves a saved position on macOS Electron", () => {
    const ownerWindow = fakeWindow({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150.0.0.0 Electron/43.1.1 Safari/537.36",
    });

    expect(resolveInitialToolbarPosition(ownerWindow, { x: 24, y: 72 })).toEqual({ x: 24, y: 72 });
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
