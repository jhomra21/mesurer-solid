import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { MESURER_ARRANGE_ACTIVE_STATE_ID } from "../plugins/arrange";

const ARRANGE_TOGGLE_COMMAND = "arrange.toggle";
const BUILTIN_SELECT_COMMAND = "builtin.select";

/**
 * Arrange owns a temporary layout presentation that only makes sense while
 * Select is the active page-targeting tool. Keep that dependency symmetric:
 * activating Arrange must satisfy the Select dependency automatically, while
 * explicitly leaving Select must deactivate an already-active Arrange session.
 */
export function installArrangeSelectGuard(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const workspace = runtime.createWorkspaceRuntime();
  let disposed = false;
  let frame = 0;
  let coordinating = false;
  let previousArrangeActive = ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;
  let previousToolMode = runtime.currentToolMode?.();

  const sync = () => {
    if (disposed || frame) return;
    frame = runtime.ownerWindow.requestAnimationFrame(() => {
      frame = 0;
      if (disposed || coordinating) return;

      const toolMode = runtime.currentToolMode?.();
      const arrangeActive = ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;
      const arrangeJustActivated = arrangeActive && !previousArrangeActive;
      const selectJustDeactivated = previousToolMode === "select" && toolMode !== "select";

      previousArrangeActive = arrangeActive;
      previousToolMode = toolMode;

      if (disposed || toolMode === undefined || !arrangeActive || toolMode === "select") return;

      coordinating = true;
      const command = arrangeJustActivated && !selectJustDeactivated
        ? BUILTIN_SELECT_COMMAND
        : ARRANGE_TOGGLE_COMMAND;
      const source = command === BUILTIN_SELECT_COMMAND
        ? "arrange-requires-select"
        : "select-deactivated";

      void ctx.command.execute(
        command,
        undefined,
        { source },
      ).catch(() => undefined).finally(() => {
        coordinating = false;
        sync();
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
