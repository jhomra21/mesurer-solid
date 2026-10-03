import type {
  MesurerPluginHost,
  ToolContribution,
} from "@jhomra21/mesurer-solid-core";
import type { MesurerModel } from "../model/create-mesurer-model";
import type { MesurerBuiltinPluginId } from "../plugins/builtins";
import type { MesurerBuiltinController } from "./builtin-actions";

export type ToolInvocationSource =
  | string
  | { source: string; builtin: MesurerBuiltinPluginId };

type SuspendedSelectModeState = {
  toolMode: "none" | "select" | "text-inspector" | "guides" | null;
  xrayVisible: boolean;
  rulersVisible: boolean;
  pluginToolIds: string[];
};

type ToolbarModeCoordinatorOptions = {
  host: MesurerPluginHost;
  getBuiltinController(): MesurerBuiltinController | null;
  getModel(): MesurerModel | null;
  arrangeActive(): boolean;
  isBuiltinPluginId(value: string): value is MesurerBuiltinPluginId;
  onPluginError?(cause: unknown, pluginId: string): void;
};

export const createToolbarModeCoordinator = ({
  host,
  getBuiltinController,
  getModel,
  arrangeActive,
  isBuiltinPluginId,
  onPluginError,
}: ToolbarModeCoordinatorOptions) => {
  const editModeTool = () => host.tools().find(
    (tool) => tool.modeSwitch === true && tool.toolbarMode === "edit",
  );

  let suspendedSelectModeState: SuspendedSelectModeState | null = null;

  const restoreSelectModeTools = async () => {
    const snapshot = suspendedSelectModeState;

    suspendedSelectModeState = null;

    if (!snapshot) return;

    const controller = getBuiltinController();
    const model = getModel();

    if (controller && model) {
      if (snapshot.toolMode === "none" && model.current.toolMode === "select") {
        controller.deactivate("select");
      } else if (
        snapshot.toolMode
        && snapshot.toolMode !== "none"
        && model.current.toolMode !== snapshot.toolMode
      ) {
        await controller.run(snapshot.toolMode);
      }

      if (snapshot.xrayVisible && !model.current.xrayVisible) await controller.run("xray");

      if (snapshot.rulersVisible && !model.current.rulersVisible) await controller.run("rulers");
    }

    for (const id of snapshot.pluginToolIds) {
      const tool = host.tools().find((candidate) => candidate.id === id);

      if (!tool || tool.toolbarMode !== "select" || (tool.active?.() ?? false)) continue;
      await host.command.execute(tool.command, undefined, {
        source: "select-mode-restore",
        toolId: tool.id,
      });
    }
  };

  const leaveEditMode = async (source: string) => {
    const edit = editModeTool();

    if (!edit?.active?.()) return;
    await host.command.execute(edit.command, undefined, { source, toolId: edit.id });
    await restoreSelectModeTools();
  };

  const suspendSelectModeTools = async () => {
    const controller = getBuiltinController();
    const model = getModel();

    const pluginToolIds = host.tools()
      .filter((tool) =>
        tool.modeSwitch !== true
        && tool.toolbarMode === "select"
        && !(tool.builtin && isBuiltinPluginId(tool.builtin))
        && !isBuiltinPluginId(tool.id)
        && (tool.active?.() ?? false))
      .map((tool) => tool.id);

    const toolMode = model?.current.toolMode;

    const savedToolMode = toolMode === "none"
      || toolMode === "select"
      || toolMode === "text-inspector"
      || toolMode === "guides"
      ? toolMode
      : null;

    suspendedSelectModeState = {
      toolMode: savedToolMode,
      xrayVisible: model?.current.xrayVisible ?? false,
      rulersVisible: model?.current.rulersVisible ?? false,
      pluginToolIds,
    };

    if (controller && model) {
      if (model.current.xrayVisible) controller.deactivate("xray");

      if (model.current.colorPickerActive) controller.deactivate("color-picker");

      if (model.current.toolMode === "text-inspector") controller.deactivate("text-inspector");
    }

    for (const id of pluginToolIds) {
      const selectTool = host.tools().find((tool) => tool.id === id);

      if (!selectTool || !(selectTool.active?.() ?? false)) continue;
      await host.command.execute(selectTool.command, undefined, {
        source: "edit-mode-suspend",
        toolId: selectTool.id,
      });
    }
  };

  const executeTool = async (
    tool: ToolContribution,
    source: ToolInvocationSource = "toolbar",
  ) => {
    if (tool.disabled?.()) return;

    try {
      const enteringEdit = tool.modeSwitch === true
        && tool.toolbarMode === "edit"
        && !(tool.active?.() ?? false);

      const leavingEdit = tool.modeSwitch === true
        && tool.toolbarMode === "edit"
        && (tool.active?.() ?? false);

      if (enteringEdit) await suspendSelectModeTools();

      if (tool.toolbarMode === "select" && arrangeActive()) {
        await leaveEditMode("select-mode-tool");
      }

      await host.command.execute(tool.command, undefined, { source, toolId: tool.id });

      if (leavingEdit && !arrangeActive()) await restoreSelectModeTools();
    } catch (error) {
      onPluginError?.(error, tool.id);
      throw error;
    }
  };

  const runTool = (
    tool: ToolContribution,
    source: ToolInvocationSource = "toolbar",
  ) => {
    void executeTool(tool, source).catch(() => undefined);
  };

  return {
    editModeTool,
    executeTool,
    leaveEditMode,
    runTool,
  };
};
