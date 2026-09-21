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

const preparedTargetByPage = new WeakMap<HTMLElement | ShadowRoot, PreparedTargetEntry>();

export const clearPreparedDirectTextTarget = (
  runtime: MesurerSolidRuntimeService,
) => {
  const entry = preparedTargetByPage.get(runtime.pageTarget);

  if (!entry) return;
  runtime.ownerWindow.clearTimeout(entry.clearTimer);
  preparedTargetByPage.delete(runtime.pageTarget);
};

export const prepareDirectTextTarget = (
  runtime: MesurerSolidRuntimeService,
  target: PreparedDirectTextTarget,
) => {
  clearPreparedDirectTextTarget(runtime);
  const pageTarget = runtime.pageTarget;
  const entry: PreparedTargetEntry = { target, clearTimer: 0 };
  preparedTargetByPage.set(pageTarget, entry);
  entry.clearTimer = runtime.ownerWindow.setTimeout(() => {
    if (preparedTargetByPage.get(pageTarget) === entry) {
      preparedTargetByPage.delete(pageTarget);
    }
  }, 0);
};

export const readPreparedDirectTextTarget = (
  runtime: MesurerSolidRuntimeService,
) => preparedTargetByPage.get(runtime.pageTarget)?.target ?? null;
