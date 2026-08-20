import { describe, expect, it } from "vitest";
import { isElectronRenderer } from "../src";

describe("Electron renderer host detection", () => {
  it("accepts Electron renderer process metadata without importing Electron", () => {
    expect(isElectronRenderer({ process: { type: "renderer", versions: { electron: "40.0.0" } } })).toBe(true);
    expect(isElectronRenderer({ process: { versions: { electron: "40.0.0" } } })).toBe(true);
    expect(isElectronRenderer({ process: { type: "browser", versions: {} } })).toBe(false);
  });
});
