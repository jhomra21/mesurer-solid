import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const INK_100 = "#f1f5f9";
const INK_200 = "#e2e8f0";
const INK_500 = "#64748b";
const INK_900 = "#0f172a";
const ACCENT = "#0d99ff";

type InspectorRow = {
  label: HTMLElement;
  value: HTMLElement;
};

const rowMap = (grid: HTMLElement) => {
  const rows = new Map<string, InspectorRow>();
  const children = Array.from(grid.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  for (let index = 0; index + 1 < children.length; index += 2) {
    const label = children[index];
    const value = children[index + 1];
    const name = label.textContent?.trim();
    if (name) rows.set(name, { label, value });
  }
  return rows;
};

const variableName = (value: HTMLElement) => Array.from(value.querySelectorAll("span"))
  .map((element) => element.textContent?.trim() ?? "")
  .find((text) => text.startsWith("--")) ?? null;

export function installUnifiedTextInspector(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  const realm = ownerWindow as Window & typeof globalThis;
  const runtimeMounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = runtimeMounts.item(runtimeMounts.length - 1);
  if (!runtimeMount) return;

  let disposed = false;
  let refining = false;

  const styleSelect = (select: HTMLSelectElement) => {
    Object.assign(select.style, {
      width: "100%",
      minWidth: "0",
      height: "28px",
      border: `1px solid ${INK_200}`,
      borderRadius: "7px",
      background: "#ffffff",
      color: INK_900,
      font: "500 11px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      padding: "0 7px",
      outline: "none",
    });
  };

  const styleInput = (input: HTMLInputElement) => {
    Object.assign(input.style, {
      width: "100%",
      minWidth: "0",
      height: "28px",
      boxSizing: "border-box",
      border: `1px solid ${INK_200}`,
      borderRadius: "7px",
      background: "#ffffff",
      color: INK_900,
      font: "500 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace",
      padding: "0 7px",
      outline: "none",
    });
  };

  const styleFormatButton = (button: HTMLButtonElement) => {
    const active = button.getAttribute("aria-pressed") === "true";
    Object.assign(button.style, {
      width: "28px",
      height: "28px",
      border: `1px solid ${active ? ACCENT : INK_200}`,
      borderRadius: "7px",
      background: active ? "rgba(13, 153, 255, 0.10)" : "#ffffff",
      color: INK_900,
      padding: "0",
      fontSize: "12px",
      cursor: "pointer",
    });
  };

  const styleSwatches = (swatches: HTMLElement) => {
    Object.assign(swatches.style, {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "5px",
      margin: "0",
      padding: "0",
      border: "0",
    });
    const colors = Array.from(swatches.querySelectorAll<HTMLButtonElement>("[data-mesurer-text-color]"));
    for (const [index, swatch] of colors.entries()) {
      Object.assign(swatch.style, {
        display: index < 7 ? "block" : "none",
        width: "20px",
        height: "20px",
        padding: "0",
      });
    }
    const custom = swatches.querySelector<HTMLInputElement>("[data-mesurer-text-custom-color='true']");
    if (custom) {
      Object.assign(custom.style, {
        display: "block",
        width: "28px",
        height: "28px",
        border: `1px solid ${INK_200}`,
        borderRadius: "7px",
        background: "#ffffff",
        padding: "3px",
      });
    }
  };

  const stylePresetButton = (button: HTMLButtonElement) => {
    Object.assign(button.style, {
      width: "100%",
      minWidth: "0",
      height: "28px",
      border: `1px solid ${INK_200}`,
      borderRadius: "7px",
      background: "#ffffff",
      color: INK_900,
      padding: "0 8px",
      font: "500 11px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    });
  };

  const makeValue = (control: HTMLElement, variable: string | null) => {
    const wrapper = ownerDocument.createElement("div");
    Object.assign(wrapper.style, {
      display: "flex",
      alignItems: "center",
      gap: "7px",
      minWidth: "0",
    });
    control.style.flex = "1 1 auto";
    wrapper.append(control);
    if (variable) {
      const token = ownerDocument.createElement("span");
      token.textContent = variable;
      token.title = variable;
      Object.assign(token.style, {
        flex: "0 1 auto",
        minWidth: "0",
        maxWidth: "104px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        color: "#0369a1",
        font: "500 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace",
      });
      wrapper.append(token);
    }
    return wrapper;
  };

  const installRowControl = (
    rows: Map<string, InspectorRow>,
    label: string,
    control: HTMLElement | null,
  ) => {
    if (!control) return;
    const row = rows.get(label);
    if (!row) return;
    const variable = variableName(row.value);
    row.value.replaceChildren(makeValue(control, variable));
    Object.assign(row.value.style, {
      overflow: "visible",
      textOverflow: "clip",
      whiteSpace: "normal",
      fontFamily: "inherit",
    });
  };

  const appendRow = (grid: HTMLElement, labelText: string, control: HTMLElement | null) => {
    if (!control) return;
    const label = ownerDocument.createElement("span");
    label.textContent = labelText;
    Object.assign(label.style, {
      color: INK_500,
      fontSize: "11px",
      alignSelf: "center",
    });
    const value = ownerDocument.createElement("div");
    value.append(control);
    Object.assign(value.style, {
      minWidth: "0",
      display: "flex",
      alignItems: "center",
    });
    grid.append(label, value);
  };

  const refine = () => {
    if (disposed || refining) return;
    refining = true;
    try {
      const editor = runtimeMount.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
      const toolbar = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-style-toolbar='true']");
      const menu = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-style-menu='true']");
      const card = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-inspector-info='true']");
      if (!editor || !toolbar || !menu || !card) return;

      const grid = card.children.item(1);
      if (!(grid instanceof realm.HTMLElement)) return;
      const rows = rowMap(grid);

      card.dataset.mesurerTextInspectorUnified = "true";
      card.setAttribute("aria-label", "Typography editor");
      card.removeAttribute("aria-hidden");
      card.style.removeProperty("visibility");
      Object.assign(card.style, {
        pointerEvents: "auto",
        width: "min(360px, calc(100vw - 16px))",
        minWidth: "0",
        maxWidth: "calc(100vw - 16px)",
        maxHeight: "calc(100vh - 16px)",
        overflowY: "auto",
        padding: "11px 12px 12px",
        whiteSpace: "normal",
      });
      Object.assign(grid.style, {
        gridTemplateColumns: "72px minmax(0, 1fr)",
        columnGap: "10px",
        rowGap: "7px",
        alignItems: "center",
      });

      const font = toolbar.querySelector<HTMLSelectElement>("[data-mesurer-text-style-select='font']");
      const size = toolbar.querySelector<HTMLSelectElement>("[data-mesurer-text-style-select='size']");
      const weight = toolbar.querySelector<HTMLSelectElement>("[data-mesurer-text-style-select='weight']");
      const line = toolbar.querySelector<HTMLInputElement>("[data-mesurer-text-style-input='line']");
      const tracking = toolbar.querySelector<HTMLInputElement>("[data-mesurer-text-style-input='tracking']");
      for (const select of [font, size, weight]) if (select) styleSelect(select);
      for (const input of [line, tracking]) if (input) styleInput(input);
      installRowControl(rows, "Family", font);
      installRowControl(rows, "Size", size);
      installRowControl(rows, "Weight", weight);
      installRowControl(rows, "Line", line);
      installRowControl(rows, "Tracking", tracking);

      const format = ownerDocument.createElement("div");
      format.dataset.mesurerUnifiedTextFormat = "true";
      Object.assign(format.style, {
        display: "flex",
        alignItems: "center",
        gap: "5px",
      });
      for (const button of Array.from(toolbar.querySelectorAll<HTMLButtonElement>("[data-mesurer-text-style-button]"))) {
        styleFormatButton(button);
        format.append(button);
      }
      appendRow(grid, "Format", format.childElementCount ? format : null);

      const swatches = toolbar.querySelector<HTMLElement>("[data-mesurer-text-color-swatches='true']");
      if (swatches) styleSwatches(swatches);
      appendRow(grid, "Color", swatches);

      const presetButton = toolbar.querySelector<HTMLButtonElement>("[data-mesurer-text-style-menu-button='true']");
      if (presetButton) stylePresetButton(presetButton);
      appendRow(grid, "Style", presetButton);

      const presetOpen = presetButton?.getAttribute("aria-expanded") === "true";
      if (presetOpen) {
        const panel = ownerDocument.createElement("div");
        panel.dataset.mesurerUnifiedTextPresets = "true";
        Object.assign(panel.style, {
          display: "grid",
          gap: "3px",
          marginTop: "9px",
          paddingTop: "8px",
          borderTop: `1px solid ${INK_100}`,
        });
        for (const button of Array.from(menu.querySelectorAll<HTMLButtonElement>("[data-mesurer-text-style-preset]"))) {
          button.style.width = "100%";
          button.style.minHeight = "34px";
          panel.append(button);
        }
        if (panel.childElementCount) card.append(panel);
      }

      toolbar.style.display = "none";
      toolbar.setAttribute("aria-hidden", "true");
      menu.style.display = "none";
      menu.setAttribute("aria-hidden", "true");
    } finally {
      refining = false;
    }
  };

  const observer = new realm.MutationObserver(refine);
  observer.observe(runtimeMount, { childList: true, subtree: true });
  refine();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
  });
}
