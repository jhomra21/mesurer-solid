import { defineMesurerPlugin } from "@jhomra21/mesurer-solid-core";
import { mountMesurer } from "../../../packages/mesurer/src/index";

const threadMenu = defineMesurerPlugin({
  id: "contract.thread-menu",
  setup(ctx) {
    ctx.command.register("contract.thread-menu.run", () => undefined);
    ctx.tool.register({
      id: "thread-menu",
      label: "Queue to Codex",
      command: "contract.thread-menu.run",
      menu: {
        label: "Codex destination",
        items: Array.from({ length: 10 }, (_, index) => ({
          id: `thread-${index + 1}`,
          label: index === 0
            ? "Current · Test Mesurer inject-script in Codex (2)"
            : `Recent Codex thread ${index + 1}`,
          checked: index === 0 ? () => true : undefined,
          run: () => undefined,
        })),
      },
    });
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("Plugin menu bounds fixture root is missing.");

mountMesurer({
  target: root,
  persistKey: "mesurer-plugin-menu-bounds-contract",
  isolate: false,
  topLayer: false,
  plugins: [threadMenu],
  excludePlugins: [
    "select",
    "xray",
    "color-picker",
    "rulers",
    "text-inspector",
    "guides",
    "distance",
    "settings",
  ],
});
