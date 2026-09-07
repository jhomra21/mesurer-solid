import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const INK_50 = "#f8fafc";
const INK_100 = "#f1f5f9";
const INK_200 = "#e2e8f0";
const INK_500 = "#64748b";
const INK_700 = "#334155";
const INK_900 = "#0f172a";
const ACCENT = "#0d99ff";
const VIEWPORT_PADDING = 8;
const SURFACE_GAP = 8;

type InspectorRow = {
  label: HTMLElement;
  value: HTMLElement;
};

const rowMap = (
  grid: HTMLElement,
  realm: Window & typeof globalThis,
) => {
  const rows = new Map<string, InspectorRow>();
  const children = Array.from(grid.children)
    .filter((child): child is HTMLElement => child instanceof realm.HTMLElement);
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
  // SAFETY: ownerWindow owns portalTarget and supplies the DOM constructors for this runtime realm.
  const realm = ownerWindow as Window & typeof globalThis;
  const runtimeMounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = runtimeMounts.item(runtimeMounts.length - 1);
  if (!runtimeMount) return;

  let disposed = false;
  let refining = false;
  let positionFrame = 0;
  let positionTimer = 0;
  let placementShell: HTMLDivElement | null = null;

  const focusEditor = () => {
    if (disposed) return;
    const editor = runtimeMount.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
    if (!editor?.isConnected) return;
    editor.focus({ preventScroll: true });
  };

  const focusEditorSoon = () => {
    ownerWindow.setTimeout(focusEditor, 0);
  };

  const ensurePlacementShell = (card: HTMLElement) => {
    if (placementShell?.isConnected && placementShell.contains(card)) return placementShell;
    placementShell?.remove();

    const shell = ownerDocument.createElement("div");
    shell.dataset.mesurerTextInspectorPlacementShell = "true";
    shell.dataset.mesurerInspectorUi = "true";
    Object.assign(shell.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      zIndex: "2147483647",
      width: "max-content",
      maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
      overflow: "visible",
      pointerEvents: "auto",
    });
    card.before(shell);
    shell.append(card);
    Object.assign(card.style, {
      position: "static",
      left: "auto",
      top: "auto",
      transform: "none",
      zIndex: "auto",
    });
    placementShell = shell;
    return shell;
  };

  const removePlacementShell = () => {
    placementShell?.remove();
    placementShell = null;
  };

  const positionCard = () => {
    if (disposed) return;
    const card = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-inspector-info='true']");
    const rings = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-ring='true']");
    const ring = rings.item(rings.length - 1);
    if (!card?.isConnected || !ring?.isConnected) return;

    const shell = ensurePlacementShell(card);
    Object.assign(card.style, {
      position: "static",
      left: "auto",
      top: "auto",
      transform: "none",
      boxSizing: "border-box",
      maxHeight: `calc(100vh - ${VIEWPORT_PADDING * 2}px)`,
      overflowY: "auto",
    });

    const host = ring.getBoundingClientRect();
    const measured = card.getBoundingClientRect();
    if (measured.width <= 0 || measured.height <= 0) return;

    const width = measured.width;
    const height = measured.height;
    const viewportRight = ownerWindow.innerWidth - VIEWPORT_PADDING;
    const viewportBottom = ownerWindow.innerHeight - VIEWPORT_PADDING;
    const maxLeft = Math.max(VIEWPORT_PADDING, viewportRight - width);
    const maxTop = Math.max(VIEWPORT_PADDING, viewportBottom - height);
    const centeredLeft = Math.min(
      Math.max(host.left + host.width / 2 - width / 2, VIEWPORT_PADDING),
      maxLeft,
    );
    const centeredTop = Math.min(
      Math.max(host.top + host.height / 2 - height / 2, VIEWPORT_PADDING),
      maxTop,
    );

    const candidates = [
      { left: centeredLeft, top: host.top - SURFACE_GAP - height, placement: "above" },
      { left: centeredLeft, top: host.bottom + SURFACE_GAP, placement: "below" },
      { left: host.right + SURFACE_GAP, top: centeredTop, placement: "side" },
      { left: host.left - SURFACE_GAP - width, top: centeredTop, placement: "side" },
    ];

    const fits = (left: number, top: number) => left >= VIEWPORT_PADDING
      && top >= VIEWPORT_PADDING
      && left + width <= viewportRight
      && top + height <= viewportBottom;
    const overlapsHost = (left: number, top: number) => {
      const overlapWidth = Math.max(0, Math.min(left + width, host.right) - Math.max(left, host.left));
      const overlapHeight = Math.max(0, Math.min(top + height, host.bottom) - Math.max(top, host.top));
      return overlapWidth > 0 && overlapHeight > 0;
    };

    const full = candidates.find((candidate) => fits(candidate.left, candidate.top)
      && !overlapsHost(candidate.left, candidate.top));
    if (full) {
      shell.style.left = `${full.left}px`;
      shell.style.top = `${full.top}px`;
      card.dataset.mesurerTextInspectorPlacement = full.placement;
      return;
    }

    const lanes = [
      {
        name: "above",
        top: VIEWPORT_PADDING,
        height: Math.max(0, host.top - SURFACE_GAP - VIEWPORT_PADDING),
      },
      {
        name: "below",
        top: host.bottom + SURFACE_GAP,
        height: Math.max(0, viewportBottom - host.bottom - SURFACE_GAP),
      },
    ].sort((leftLane, rightLane) => rightLane.height - leftLane.height);
    const lane = lanes[0];
    if (lane && lane.height > 0) {
      card.style.maxHeight = `${lane.height}px`;
      shell.style.left = `${centeredLeft}px`;
      shell.style.top = `${lane.top}px`;
      card.dataset.mesurerTextInspectorPlacement = lane.name;
      return;
    }

    shell.style.left = `${centeredLeft}px`;
    shell.style.top = `${VIEWPORT_PADDING}px`;
    card.dataset.mesurerTextInspectorPlacement = "viewport";
  };

  const schedulePosition = () => {
    if (disposed || positionFrame) return;
    positionFrame = ownerWindow.requestAnimationFrame(() => {
      positionFrame = 0;
      positionCard();
    });
  };

  const settlePosition = () => {
    positionCard();
    schedulePosition();
    if (positionTimer) ownerWindow.clearTimeout(positionTimer);
    positionTimer = ownerWindow.setTimeout(() => {
      positionTimer = 0;
      positionCard();
      schedulePosition();
    }, 0);
  };

  const styleInteractiveShell = (element: HTMLElement) => {
    Object.assign(element.style, {
      boxSizing: "border-box",
      border: "1px solid transparent",
      borderRadius: "5px",
      background: INK_50,
      color: INK_700,
      outline: "none",
      transition: "border-color 120ms ease, box-shadow 120ms ease, background 120ms ease",
    });
    element.addEventListener("mouseenter", () => {
      element.style.borderColor = INK_200;
    });
    element.addEventListener("mouseleave", () => {
      if (ownerDocument.activeElement !== element) element.style.borderColor = "transparent";
    });
    element.addEventListener("focus", () => {
      element.style.borderColor = "transparent";
      element.style.boxShadow = `inset 0 0 0 1px ${ACCENT}`;
    });
    element.addEventListener("blur", () => {
      element.style.boxShadow = "none";
      element.style.borderColor = "transparent";
    });
  };

  const makeSelectShell = (select: HTMLSelectElement) => {
    const shell = ownerDocument.createElement("div");
    shell.dataset.mesurerUnifiedSelectShell = "true";
    Object.assign(shell.style, {
      position: "relative",
      width: "100%",
      minWidth: "0",
      height: "28px",
      border: "1px solid transparent",
      borderRadius: "5px",
      background: INK_50,
      transition: "border-color 120ms ease, box-shadow 120ms ease, background 120ms ease",
    });

    Object.assign(select.style, {
      appearance: "none",
      WebkitAppearance: "none",
      width: "100%",
      minWidth: "0",
      height: "100%",
      boxSizing: "border-box",
      border: "0",
      borderRadius: "5px",
      background: "transparent",
      color: INK_700,
      font: "500 11px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      padding: "0 27px 0 8px",
      outline: "none",
      cursor: "pointer",
    });

    const chevron = ownerDocument.createElement("span");
    chevron.dataset.mesurerUnifiedSelectChevron = "true";
    chevron.setAttribute("aria-hidden", "true");
    Object.assign(chevron.style, {
      position: "absolute",
      right: "9px",
      top: "8px",
      width: "7px",
      height: "7px",
      borderRight: `1.5px solid ${INK_500}`,
      borderBottom: `1.5px solid ${INK_500}`,
      transform: "rotate(45deg)",
      transformOrigin: "center",
      pointerEvents: "none",
    });

    shell.addEventListener("mouseenter", () => {
      shell.style.borderColor = INK_200;
    });
    shell.addEventListener("mouseleave", () => {
      if (ownerDocument.activeElement !== select) shell.style.borderColor = "transparent";
    });
    select.addEventListener("focus", () => {
      shell.style.borderColor = "transparent";
      shell.style.boxShadow = `inset 0 0 0 1px ${ACCENT}`;
    });
    select.addEventListener("blur", () => {
      shell.style.boxShadow = "none";
      shell.style.borderColor = "transparent";
    });

    shell.append(select, chevron);
    return shell;
  };

  const styleInput = (input: HTMLInputElement) => {
    Object.assign(input.style, {
      width: "100%",
      minWidth: "0",
      height: "28px",
      font: "500 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace",
      padding: "0 8px",
    });
    styleInteractiveShell(input);
  };

  const styleFormatButton = (button: HTMLButtonElement) => {
    const active = button.getAttribute("aria-pressed") === "true";
    Object.assign(button.style, {
      width: "28px",
      height: "28px",
      border: `1px solid ${active ? ACCENT : "transparent"}`,
      borderRadius: "5px",
      background: active ? "rgba(13, 153, 255, 0.10)" : INK_50,
      color: INK_900,
      padding: "0",
      fontSize: "12px",
      cursor: "pointer",
      transition: "border-color 120ms ease, background 120ms ease",
    });
    button.addEventListener("mouseenter", () => {
      if (!active) button.style.borderColor = INK_200;
    });
    button.addEventListener("mouseleave", () => {
      button.style.borderColor = active ? ACCENT : "transparent";
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
        border: "1px solid transparent",
        borderRadius: "5px",
        background: INK_50,
        padding: "3px",
      });
      custom.addEventListener("mouseenter", () => { custom.style.borderColor = INK_200; });
      custom.addEventListener("mouseleave", () => { custom.style.borderColor = "transparent"; });
    }
  };

  const stylePresetButton = (button: HTMLButtonElement) => {
    Object.assign(button.style, {
      width: "100%",
      minWidth: "0",
      height: "28px",
      border: "1px solid transparent",
      borderRadius: "5px",
      background: INK_50,
      color: INK_700,
      padding: "0 8px",
      font: "500 11px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      transition: "border-color 120ms ease, box-shadow 120ms ease, background 120ms ease",
    });
    button.addEventListener("mouseenter", () => { button.style.borderColor = INK_200; });
    button.addEventListener("mouseleave", () => { button.style.borderColor = "transparent"; });
    button.addEventListener("focus", () => { button.style.boxShadow = `inset 0 0 0 1px ${ACCENT}`; });
    button.addEventListener("blur", () => { button.style.boxShadow = "none"; });
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
    label.dataset.mesurerUnifiedTextRow = "true";
    Object.assign(label.style, {
      color: INK_500,
      fontSize: "11px",
      alignSelf: "center",
    });
    const value = ownerDocument.createElement("div");
    value.dataset.mesurerUnifiedTextRow = "true";
    value.append(control);
    Object.assign(value.style, {
      minWidth: "0",
      display: "flex",
      alignItems: "center",
    });
    grid.append(label, value);
  };

  const onInspectorClick = (event: MouseEvent) => {
    const target = event.target instanceof realm.HTMLElement ? event.target : null;
    if (!target || !runtimeMount.contains(target)) return;

    const presetToggle = target.closest<HTMLButtonElement>("[data-mesurer-text-style-menu-button='true']");
    if (presetToggle) {
      if (presetToggle.getAttribute("aria-expanded") === "true") focusEditor();
      ownerWindow.setTimeout(() => {
        if (disposed) return;
        const current = runtimeMount.querySelector<HTMLButtonElement>("[data-mesurer-text-style-menu-button='true']");
        if (current?.getAttribute("aria-expanded") === "false") focusEditor();
      }, 0);
      return;
    }

    if (target.closest(
      "[data-mesurer-text-style-button], [data-mesurer-text-color], [data-mesurer-text-style-preset]",
    )) {
      focusEditor();
      focusEditorSoon();
    }
  };

  const onInspectorChange = (event: Event) => {
    const target = event.target instanceof realm.HTMLElement ? event.target : null;
    if (!target || !runtimeMount.contains(target)) return;
    if (target.matches(
      "[data-mesurer-text-style-select], [data-mesurer-text-custom-color='true']",
    )) {
      focusEditor();
      focusEditorSoon();
    }
  };

  const onInspectorKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    const target = event.target instanceof realm.HTMLElement ? event.target : null;
    if (!target || !runtimeMount.contains(target)) return;
    if (target.matches("[data-mesurer-text-style-input]")) {
      focusEditor();
      focusEditorSoon();
    }
  };

  const refine = () => {
    if (disposed || refining) return;
    refining = true;
    try {
      const editor = runtimeMount.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
      const toolbar = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-style-toolbar='true']");
      const menu = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-style-menu='true']");
      const card = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-inspector-info='true']");
      if (!card) {
        removePlacementShell();
        return;
      }
      if (!editor || !toolbar || !menu) return;

      const grid = card.children.item(1);
      if (!(grid instanceof realm.HTMLElement)) return;
      const freshControls = Boolean(toolbar.querySelector("[data-mesurer-text-style-menu-button='true']"));
      if (freshControls) {
        for (const element of card.querySelectorAll<HTMLElement>(
          "[data-mesurer-unified-text-row='true'], [data-mesurer-unified-text-presets='true']",
        )) element.remove();
      }
      const rows = rowMap(grid, realm);

      card.dataset.mesurerTextInspectorUnified = "true";
      card.setAttribute("aria-label", "Typography editor");
      card.removeAttribute("aria-hidden");
      card.style.removeProperty("visibility");
      Object.assign(card.style, {
        pointerEvents: "auto",
        position: "static",
        left: "auto",
        top: "auto",
        transform: "none",
        zIndex: "auto",
        boxSizing: "border-box",
        width: "min(360px, calc(100vw - 16px))",
        minWidth: "0",
        maxWidth: "calc(100vw - 16px)",
        maxHeight: "calc(100vh - 16px)",
        overflowY: "auto",
        padding: "11px 12px 12px",
        whiteSpace: "normal",
      });
      ensurePlacementShell(card);
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
      const fontShell = font ? makeSelectShell(font) : null;
      const sizeShell = size ? makeSelectShell(size) : null;
      const weightShell = weight ? makeSelectShell(weight) : null;
      for (const input of [line, tracking]) if (input) styleInput(input);
      installRowControl(rows, "Family", fontShell);
      installRowControl(rows, "Size", sizeShell);
      installRowControl(rows, "Weight", weightShell);
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
      settlePosition();
    } finally {
      refining = false;
    }
  };

  runtimeMount.addEventListener("click", onInspectorClick, true);
  runtimeMount.addEventListener("change", onInspectorChange, true);
  runtimeMount.addEventListener("keydown", onInspectorKeyDown, true);
  ownerWindow.addEventListener("resize", schedulePosition);
  ownerWindow.addEventListener("scroll", schedulePosition, true);

  const observer = new realm.MutationObserver(refine);
  observer.observe(runtimeMount, { childList: true, subtree: true });
  refine();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    if (positionFrame) ownerWindow.cancelAnimationFrame(positionFrame);
    if (positionTimer) ownerWindow.clearTimeout(positionTimer);
    runtimeMount.removeEventListener("click", onInspectorClick, true);
    runtimeMount.removeEventListener("change", onInspectorChange, true);
    runtimeMount.removeEventListener("keydown", onInspectorKeyDown, true);
    ownerWindow.removeEventListener("resize", schedulePosition);
    ownerWindow.removeEventListener("scroll", schedulePosition, true);
    removePlacementShell();
  });
}
