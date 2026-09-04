import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const TOOLBAR_BLUE = "#0d99ff";
const TOOLBAR_MUTED = "#8a8a8a";
const PRESET_MENU_WIDTH = 288;

type TypographyButtonSnapshot = {
  ariaPressed: string | null;
  background: string;
  color: string;
};

type InspectorSurfaceSnapshot = {
  element: HTMLElement;
  display: string;
  displayPriority: string;
  ariaHidden: string | null;
};

/**
 * Keeps the field-local direct editor aligned with Mesurer's established
 * toolbar language without coupling Typography's hover/pin runtime to the
 * editing lifecycle. The text-edit core owns targeting, intent, and history;
 * this adapter owns only the transient control arrangement and contextual
 * Typography presentation.
 */
export function installTextEditingPresentation(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns portalTarget and therefore supplies the matching DOM constructors.
  const realm = ownerWindow as Window & typeof globalThis;
  const runtimeMounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = runtimeMounts.item(runtimeMounts.length - 1);
  if (!runtimeMount) return;

  const root = runtimeMount.closest<HTMLElement>("[data-mesurer-root='true']");
  let typographyButtonSnapshot: TypographyButtonSnapshot | null = null;
  const suppressedInspectorSurfaces = new Map<HTMLElement, InspectorSurfaceSnapshot>();
  let typographyContextActive = false;
  let disposed = false;
  let refining = false;

  const typographyButton = () => root?.querySelector<HTMLButtonElement>(
    "button[data-mesurer-builtin='text-inspector']",
  ) ?? null;

  const suppressTypographyInspectorSurfaces = () => {
    for (const element of portalTarget.querySelectorAll<HTMLElement>(".mesurer-ti-card, .mesurer-ti-box")) {
      if (runtimeMount.contains(element) || suppressedInspectorSurfaces.has(element)) continue;
      suppressedInspectorSurfaces.set(element, {
        element,
        display: element.style.getPropertyValue("display"),
        displayPriority: element.style.getPropertyPriority("display"),
        ariaHidden: element.getAttribute("aria-hidden"),
      });
      element.style.setProperty("display", "none", "important");
      element.setAttribute("aria-hidden", "true");
    }
  };

  const restoreTypographyInspectorSurfaces = () => {
    for (const snapshot of suppressedInspectorSurfaces.values()) {
      const { element } = snapshot;
      if (!element.isConnected) continue;
      if (snapshot.display || snapshot.displayPriority) {
        element.style.setProperty("display", snapshot.display, snapshot.displayPriority);
      } else {
        element.style.removeProperty("display");
      }
      if (snapshot.ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", snapshot.ariaHidden);
    }
    suppressedInspectorSurfaces.clear();
  };

  const setTypographyContext = (active: boolean) => {
    if (!root || typographyContextActive === active) return;
    const button = typographyButton();
    typographyContextActive = active;

    if (active) {
      root.dataset.mesurerTypographyContextActive = "true";
      if (!button) return;
      typographyButtonSnapshot = {
        ariaPressed: button.getAttribute("aria-pressed"),
        background: button.style.backgroundColor,
        color: button.style.color,
      };
      button.setAttribute("aria-pressed", "true");
      button.style.backgroundColor = TOOLBAR_BLUE;
      button.style.color = "#ffffff";
      return;
    }

    delete root.dataset.mesurerTypographyContextActive;
    if (!button || !typographyButtonSnapshot) {
      typographyButtonSnapshot = null;
      return;
    }
    const modelRenderedActive = button.classList.contains("msr:bg-[#0d99ff]");
    if (modelRenderedActive) button.setAttribute("aria-pressed", "true");
    else if (typographyButtonSnapshot.ariaPressed === null) button.removeAttribute("aria-pressed");
    else button.setAttribute("aria-pressed", typographyButtonSnapshot.ariaPressed);
    button.style.backgroundColor = typographyButtonSnapshot.background;
    button.style.color = typographyButtonSnapshot.color;
    typographyButtonSnapshot = null;
  };

  const styleDirectSelect = (select: HTMLSelectElement) => {
    const kind = select.dataset.mesurerTextStyleSelect ?? "";
    Object.assign(select.style, {
      width: "auto",
      height: "32px",
      maxWidth: kind === "font" ? "128px" : "72px",
      minWidth: kind === "font" ? "92px" : "56px",
      border: "0",
      borderRadius: "8px",
      background: "transparent",
      color: "#0f172a",
      font: "500 12px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      padding: "0 8px",
      cursor: "pointer",
      outline: "none",
    });
  };

  const styleColorControls = (swatches: HTMLElement) => {
    Object.assign(swatches.style, {
      display: "flex",
      alignItems: "center",
      flexWrap: "nowrap",
      gap: "4px",
      marginLeft: "2px",
      paddingLeft: "8px",
      borderLeft: "1px solid rgba(0, 0, 0, 0.10)",
    });
    const pageColors = Array.from(swatches.querySelectorAll<HTMLButtonElement>("[data-mesurer-text-color]"));
    for (const [index, swatch] of pageColors.entries()) {
      Object.assign(swatch.style, {
        display: index < 6 ? "block" : "none",
        width: "18px",
        height: "18px",
        borderRadius: "50%",
        padding: "0",
      });
    }
    const custom = swatches.querySelector<HTMLInputElement>("[data-mesurer-text-custom-color='true']");
    if (custom) {
      Object.assign(custom.style, {
        width: "32px",
        height: "32px",
        border: "0",
        borderRadius: "8px",
        background: "transparent",
        padding: "5px",
        cursor: "pointer",
      });
    }
  };

  const refinePresetButton = (button: HTMLButtonElement) => {
    button.setAttribute("aria-label", "Text preset");
    button.style.marginLeft = "0";
    const spans = button.querySelectorAll<HTMLSpanElement>(":scope > span");
    const chevron = spans.item(spans.length - 1);
    if (!chevron) return;
    if (chevron.textContent) chevron.textContent = "";
    chevron.dataset.mesurerTextStyleChevron = "true";
    Object.assign(chevron.style, {
      width: "7px",
      height: "7px",
      flex: "0 0 7px",
      boxSizing: "border-box",
      borderRight: `1.5px solid ${TOOLBAR_MUTED}`,
      borderBottom: `1.5px solid ${TOOLBAR_MUTED}`,
      color: "transparent",
      fontSize: "0",
      lineHeight: "0",
      transform: button.getAttribute("aria-expanded") === "true" ? "rotate(225deg)" : "rotate(45deg)",
      transformOrigin: "50% 50%",
    });
  };

  const positionRefinedSurfaces = (
    toolbar: HTMLElement,
    menu: HTMLElement,
    inspectorCard: HTMLElement | null,
  ) => {
    const toolbarRect = toolbar.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, toolbarRect.left),
      Math.max(8, ownerWindow.innerWidth - toolbarRect.width - 8),
    );
    toolbar.style.left = `${left}px`;

    if (menu.style.display !== "none" && !menu.hidden) {
      const menuRect = menu.getBoundingClientRect();
      const menuLeft = Math.min(
        Math.max(8, left + toolbarRect.width - menuRect.width),
        Math.max(8, ownerWindow.innerWidth - menuRect.width - 8),
      );
      menu.style.left = `${menuLeft}px`;
    }

    if (inspectorCard) {
      const cardRect = inspectorCard.getBoundingClientRect();
      const half = Math.max(320, cardRect.width) / 2;
      const center = Math.min(
        Math.max(left + toolbarRect.width / 2, 8 + half),
        ownerWindow.innerWidth - 8 - half,
      );
      inspectorCard.style.left = `${center}px`;
    }
  };

  const refine = () => {
    if (disposed || refining) return;
    refining = true;
    try {
      const editor = runtimeMount.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
      const toolbar = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-style-toolbar='true']");
      const menu = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-style-menu='true']");
      const inspectorCard = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-inspector-info='true']");

      if (!editor || !toolbar || !menu) {
        restoreTypographyInspectorSurfaces();
        setTypographyContext(false);
        return;
      }

      setTypographyContext(true);
      suppressTypographyInspectorSurfaces();
      if (inspectorCard) inspectorCard.setAttribute("aria-label", "Typography details");

      const presetButton = toolbar.querySelector<HTMLButtonElement>("[data-mesurer-text-style-menu-button='true']");
      if (!presetButton) return;

      const directSelects = Array.from(menu.querySelectorAll<HTMLSelectElement>("[data-mesurer-text-style-select]"));
      for (const select of directSelects) {
        const wrapper = select.parentElement;
        styleDirectSelect(select);
        toolbar.insertBefore(select, presetButton);
        if (wrapper?.isConnected && wrapper !== toolbar) wrapper.remove();
      }

      const swatches = menu.querySelector<HTMLElement>("[data-mesurer-text-color-swatches='true']");
      if (swatches) {
        const section = swatches.parentElement;
        styleColorControls(swatches);
        toolbar.insertBefore(swatches, presetButton);
        if (section?.isConnected && section !== toolbar) section.remove();
      }

      for (const child of Array.from(menu.children)) {
        if (child instanceof realm.HTMLButtonElement && child.hasAttribute("data-mesurer-text-style-preset")) continue;
        child.remove();
      }
      Object.assign(menu.style, {
        width: `${PRESET_MENU_WIDTH}px`,
        maxHeight: "min(260px, calc(100vh - 16px))",
        overflowY: "auto",
      });
      menu.setAttribute("aria-label", "Text presets");

      let separator = toolbar.querySelector<HTMLElement>("[data-mesurer-text-preset-separator='true']");
      if (!separator) {
        separator = ownerDocument.createElement("span");
        separator.dataset.mesurerTextPresetSeparator = "true";
        separator.setAttribute("aria-hidden", "true");
        Object.assign(separator.style, {
          width: "1px",
          height: "20px",
          flex: "0 0 1px",
          margin: "0 2px",
          background: "rgba(0, 0, 0, 0.10)",
        });
        toolbar.insertBefore(separator, presetButton);
      } else if (separator.nextSibling !== presetButton) {
        toolbar.insertBefore(separator, presetButton);
      }
      if (toolbar.lastElementChild !== presetButton) toolbar.append(presetButton);
      refinePresetButton(presetButton);
      positionRefinedSurfaces(toolbar, menu, inspectorCard);
    } finally {
      refining = false;
    }
  };

  const observer = new realm.MutationObserver(() => refine());
  observer.observe(runtimeMount, { childList: true, subtree: true });
  refine();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    restoreTypographyInspectorSurfaces();
    setTypographyContext(false);
  });
}
