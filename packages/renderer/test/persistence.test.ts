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
      colorPickerFormats: ["hex", "bad", "oklch"],
      guideStyle: { opacity: 5, width: 0, pattern: "dotted" },
      selectionSpacingStyle: { enabled: false, color: "#ff00aa", opacity: -1, width: 9, pattern: "dashed", dashLength: 99, gap: -4 },
    });
    expect(settings.snapEnabled).toBe(false);
    expect(settings.colorPickerFormats).toEqual(["hex", "oklch"]);
    expect(settings.guideStyle?.opacity).toBe(1);
    expect(settings.guideStyle?.width).toBe(1);
    expect(settings.selectionSpacingStyle).toEqual({ enabled: false, color: "#ff00aa", opacity: 0, width: 4, pattern: "dashed", dashLength: 24, gap: 0 });
  });

  it("round-trips settings and workspace through localStorage", () => {
    const persistence = createLocalStoragePersistence(window, "workspace-test", "settings-test");
    persistence.saveSettings({ persistOnReload: true, highlightColor: "#123456", selectionSpacingStyle: { enabled: true, color: "#ff00aa", opacity: 0.8, width: 3, pattern: "dotted", dashLength: 5, gap: 2 } });
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
    expect(persistence.load()?.settings.selectionSpacingStyle?.pattern).toBe("dotted");
    expect(persistence.load()?.settings.selectionSpacingStyle?.width).toBe(3);
    expect(persistence.load()?.workspace?.guides[0]?.position).toBe(42);
    expect(MESURER_STORAGE_VERSION).toBe(2);
    window.localStorage.removeItem("workspace-test");
    window.localStorage.removeItem("settings-test");
  });

  it("rejects malformed workspace data", () => {
    expect(normalizeStoredWorkspace({ enabled: true })).toBeNull();
  });
});
