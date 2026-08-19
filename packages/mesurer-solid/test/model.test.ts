import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { createMeasurerModel } from "../src/model/create-measurer-model";

describe("createMeasurerModel", () => {
  it("does not depend on synchronous reads after a Solid 2 write", () => {
    const model = createMeasurerModel({ initialEnabled: true });

    const next = model.toggleEnabled();

    // The action returns the value it calculated instead of reading the store
    // after the write. Solid 2 publishes the store change at the batch flush.
    expect(next).toBe(false);
    expect(model.state.enabled).toBe(true);

    flush();
    expect(model.state.enabled).toBe(false);
  });
});
