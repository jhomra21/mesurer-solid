import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { MESURER_ARRANGE_ACTIVE_STATE_ID } from "../plugins/arrange";

const ARRANGE_TOGGLE_COMMAND = "arrange.toggle";

/**
 * Arrange owns a temporary layout presentation that only makes sense while
 * Select is the active page-targeting tool. Keep that dependency symmetric:
 * Arrange may activate Select, and leaving Select must deactivate Arrange.
 */
export function installArrangeSelectGuard(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const workspace = runtime.createWorkspaceRuntime();
  let disposed = false;
  let frame = 0;
  let deactivating = false;

  const sync = () => {
    if (disposed || frame) return;
    frame = runtime.ownerWindow.requestAnimationFrame(() => {
      frame = 0;
      if (disposed || deactivating || runtime.currentToolMode() === "select") return;
      if (!(ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false)) return;

      deactivating = true;
      void ctx.command.execute(
        ARRANGE_TOGGLE_COMMAND,
        undefined,
        { source: "select-deactivated" },
      ).catch(() => undefined).finally(() => {
        deactivating = false;
      });
    });
  };

  const unsubscribeWorkspace = workspace.subscribe(sync);
  ctx.state.subscribe(sync);
  sync();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    if (frame) runtime.ownerWindow.cancelAnimationFrame(frame);
    frame = 0;
    unsubscribeWorkspace();
    workspace.dispose();
  });
}
