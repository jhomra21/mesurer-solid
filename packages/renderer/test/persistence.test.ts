import { describe, expect, it } from "vitest";
import {
  MESURER_STORAGE_VERSION,
  createLocalStoragePersistence,
  normalizeStoredSettings,
  normalizeStoredWorkspace,
} from "../src/core/persistence";

describe("persistence", () => {
  it("sanitizes user-controlled settings", () => {
    const settings = normalizeStoredSettings({
      snapEnabled: false,
      shortcutsEnabled: false,
      theme: "dark",
      colorPickerFormats: ["hex", "bad", "oklch"],
      guideStyle: { opacity: 5, width: 0, pattern: "dotted" },
      selectionSpacingStyle: { enabled: false, color: "#ff00aa", diagonals: true, opacity: -1, width: 9, pattern: "dashed", dashLength: 99, gap: -4 },
    });

    expect(settings.snapEnabled).toBe(false);
    expect(settings.shortcutsEnabled).toBe(false);
    expect(settings.theme).toBe("dark");
    expect(settings.colorPickerFormats).toEqual(["hex", "oklch"]);
    expect(settings.guideStyle?.opacity).toBe(1);
    expect(settings.guideStyle?.width).toBe(1);
    expect(settings.selectionSpacingStyle).toEqual({ enabled: false, color: "#ff00aa", diagonals: true, opacity: 0, width: 4, pattern: "dashed", dashLength: 24, gap: 0 });
  });

  it("rejects invalid stored themes", () => {
    expect(normalizeStoredSettings({ theme: "sepia" }).theme).toBeUndefined();
    expect(normalizeStoredSettings({ theme: "system" }).theme).toBe("system");
  });

  it("defaults diagonal spacing off when older stored settings omit it", () => {
    const settings = normalizeStoredSettings({
      selectionSpacingStyle: { enabled: true, color: "#2563eb", opacity: 1, width: 1, pattern: "dashed", dashLength: 4, gap: 3 },
    });

    expect(settings.selectionSpacingStyle?.diagonals).toBe(false);
  });

  it("round-trips settings and workspace through localStorage", () => {
    const persistence = createLocalStoragePersistence(window, "workspace-test", "settings-test");
    persistence.saveSettings({ persistOnReload: true, shortcutsEnabled: false, theme: "light", highlightColor: "#123456", selectionSpacingStyle: { enabled: true, color: "#ff00aa", diagonals: true, opacity: 0.8, width: 3, pattern: "dotted", dashLength: 5, gap: 2 } });
    persistence.saveWorkspace({
      enabled: true,
      xrayVisible: false,
      toolMode: "guides",
      rulersVisible: true,
      guideOrientation: "vertical",
      guides: [{ id: "g", orientation: "vertical", position: 42 }],
      selectedGuideIds: ["g"],
      measurements: [],
      activeMeasurement: null,
      heldDistances: [],
    });
    expect(persistence.load()?.settings.highlightColor).toBe("#123456");
    expect(persistence.load()?.settings.shortcutsEnabled).toBe(false);
    expect(persistence.load()?.settings.theme).toBe("light");
    expect(persistence.load()?.settings.selectionSpacingStyle?.pattern).toBe("dotted");
    expect(persistence.load()?.settings.selectionSpacingStyle?.width).toBe(3);
    expect(persistence.load()?.settings.selectionSpacingStyle?.diagonals).toBe(true);
    expect(persistence.load()?.workspace?.guides[0]?.position).toBe(42);
    expect(MESURER_STORAGE_VERSION).toBe(2);
    window.localStorage.removeItem("workspace-test");
    window.localStorage.removeItem("settings-test");
  });

  it("rejects malformed workspace data", () => {
    expect(normalizeStoredWorkspace({ enabled: true })).toBeNull();
  });

  it("keeps default workspace state isolated by page key", () => {
    const original = window.location.pathname + window.location.search + window.location.hash;
    const persistence = createLocalStoragePersistence(window, "workspace-pages", "settings-pages");

    window.history.replaceState({}, "", "/alpha?b=2&a=1");
    persistence.setPageKey?.("/alpha?a=1&b=2");
    persistence.saveWorkspace({
      enabled: true,
      xrayVisible: false,
      toolMode: "guides",
      rulersVisible: false,
      guideOrientation: "vertical",
      guides: [{ id: "alpha", orientation: "vertical", position: 32 }],
      selectedGuideIds: ["alpha"],
      measurements: [],
      activeMeasurement: null,
      heldDistances: [],
    });

    window.history.replaceState({}, "", "/beta");
    persistence.setPageKey?.("/beta");
    expect(persistence.load()?.workspace).toBeNull();
    persistence.saveWorkspace({
      enabled: true,
      xrayVisible: false,
      toolMode: "select",
      rulersVisible: false,
      guideOrientation: "horizontal",
      guides: [{ id: "beta", orientation: "horizontal", position: 64 }],
      selectedGuideIds: ["beta"],
      measurements: [],
      activeMeasurement: null,
      heldDistances: [],
    });

    persistence.setPageKey?.("/alpha?a=1&b=2");
    expect(persistence.load()?.workspace?.guides[0]?.id).toBe("alpha");
    persistence.setPageKey?.("/beta");
    expect(persistence.load()?.workspace?.guides[0]?.id).toBe("beta");

    window.history.replaceState({}, "", original || "/");
    window.localStorage.removeItem("workspace-pages");
    window.localStorage.removeItem("settings-pages");
  });
});