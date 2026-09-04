import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { MESURER_ARRANGE_ACTIVE_STATE_ID } from "../plugins/arrange";

const ARRANGE_TOGGLE_COMMAND = "arrange.toggle";
const BUILTIN_SELECT_COMMAND = "builtin.select";

/**
 * Arrange owns a temporary layout presentation that only makes sense while
 * Select is the active page-targeting tool. Capture transition direction when
 * each source changes so model and plugin updates in the same frame cannot be
 * mistaken for one another: Arrange activation may satisfy Select, while an
 * explicit departure from Select retires an already-active Arrange session.
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
  let arrangeActivatedPending = false;
  let selectDeactivatedPending = false;

  const schedule = () => {
    if (disposed || frame) return;
    frame = runtime.ownerWindow.requestAnimationFrame(() => {
      frame = 0;
      if (disposed || coordinating) return;

      const toolMode = runtime.currentToolMode?.();
      const arrangeActive = ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;

      if (toolMode === undefined || !arrangeActive) {
        arrangeActivatedPending = false;
        selectDeactivatedPending = false;
        return;
      }
      if (toolMode === "select") {
        arrangeActivatedPending = false;
        selectDeactivatedPending = false;
        return;
      }

      coordinating = true;
      const command = selectDeactivatedPending
        ? ARRANGE_TOGGLE_COMMAND
        : arrangeActivatedPending
          ? BUILTIN_SELECT_COMMAND
          : ARRANGE_TOGGLE_COMMAND;
      const source = command === BUILTIN_SELECT_COMMAND
        ? "arrange-requires-select"
        : "select-deactivated";
      arrangeActivatedPending = false;
      selectDeactivatedPending = false;

      void ctx.command.execute(
        command,
        undefined,
        { source },
      ).catch(() => undefined).finally(() => {
        coordinating = false;
        schedule();
      });
    });
  };

  const onWorkspaceChange = () => {
    const toolMode = runtime.currentToolMode?.();
    if (previousToolMode === "select" && toolMode !== undefined && toolMode !== "select") {
      selectDeactivatedPending = true;
    }
    previousToolMode = toolMode;
    schedule();
  };

  const onPluginStateChange = () => {
    const arrangeActive = ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;
    if (arrangeActive && !previousArrangeActive) arrangeActivatedPending = true;
    previousArrangeActive = arrangeActive;
    schedule();
  };

  const unsubscribeWorkspace = workspace.subscribe(onWorkspaceChange);
  const stateSubscription = ctx.state.subscribe(onPluginStateChange);
  schedule();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    if (frame) runtime.ownerWindow.cancelAnimationFrame(frame);
    frame = 0;
    stateSubscription.dispose();
    unsubscribeWorkspace();
    workspace.dispose();
  });
}
