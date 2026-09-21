import type { MesurerSolidRuntimeService } from "../../ComposableMesurer";

export type PreparedDirectTextTarget = {
  element: HTMLElement;
  node: Text;
  nodeIndex: number;
};

type PreparedTargetEntry = {
  target: PreparedDirectTextTarget;
  clearTimer: number;
};

const preparedTargetByRuntime = new WeakMap<MesurerSolidRuntimeService, PreparedTargetEntry>();

export const clearPreparedDirectTextTarget = (
  runtime: MesurerSolidRuntimeService,
) => {
  const entry = preparedTargetByRuntime.get(runtime);

  if (!entry) return;
  runtime.ownerWindow.clearTimeout(entry.clearTimer);
  preparedTargetByRuntime.delete(runtime);
};

export const prepareDirectTextTarget = (
  runtime: MesurerSolidRuntimeService,
  target: PreparedDirectTextTarget,
) => {
  clearPreparedDirectTextTarget(runtime);
  const entry: PreparedTargetEntry = { target, clearTimer: 0 };
  preparedTargetByRuntime.set(runtime, entry);
  entry.clearTimer = runtime.ownerWindow.setTimeout(() => {
    if (preparedTargetByRuntime.get(runtime) === entry) {
      preparedTargetByRuntime.delete(runtime);
    }
  }, 0);
};

export const readPreparedDirectTextTarget = (
  runtime: MesurerSolidRuntimeService,
) => preparedTargetByRuntime.get(runtime)?.target ?? null;
