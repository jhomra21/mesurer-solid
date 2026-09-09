import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const INK_50 = "#f8fafc";
const INK_100 = "#f1f5f9";
const INK_200 = "#e2e8f0";
const INK_500 = "#64748b";
const INK_700 = "#334155";
const INK_900 = "#0f172a";
const ACCENT = "#0d99ff";
const MENU_GAP = 4;
const MENU_PADDING = 4;
const MENU_MAX_HEIGHT = 220;
const MENU_MIN_HEIGHT = 60;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

type MenuOption = {
  key: string;
  label: string;
  shortcut: string | null;
  selected: boolean;
  disabled: boolean;
  activate: () => void;
};

type OpenMenu = {
  popup: HTMLDivElement;
  trigger: HTMLButtonElement;
  chevron: HTMLElement | null;
  shell: HTMLElement;
  card: HTMLElement;
};

/**
 * Let an open custom Typography menu consume Escape before the text-edit core.
 * The core deliberately owns Escape at window-capture level so it can cancel a
 * direct edit from anywhere in the editing surface; an open dropdown is the
 * one exception and owns the first Escape.
 */
export function installUnifiedTextSelectEscapeGuard(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow } = runtime;
  // SAFETY: ownerWindow owns ownerDocument and supplies the matching DOM constructors/events.
  const realm = ownerWindow as Window & typeof globalThis;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    const popup = event.composedPath().find((candidate) =>
      candidate instanceof realm.HTMLElement
      && candidate.dataset.mesurerUnifiedSelectPopup === "true")
      ?? ownerDocument.querySelector<HTMLElement>("[data-mesurer-unified-select-popup='true']");
    if (!(popup instanceof realm.HTMLElement)) return;

    const kind = popup.dataset.mesurerUnifiedSelectKind;
    if (!kind) return;
    const card = popup.closest<HTMLElement>("[data-mesurer-text-inspector-info='true']");
    const trigger = Array.from(
      card?.querySelectorAll<HTMLButtonElement>("[data-mesurer-unified-select-trigger]") ?? [],
    ).find((candidate) => candidate.dataset.mesurerUnifiedSelectTrigger === kind);
    if (!trigger) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    trigger.click();
  };

  ownerWindow.addEventListener("keydown", onKeyDown, true);
  ctx.lifecycle.onDispose(() => {
    ownerWindow.removeEventListener("keydown", onKeyDown, true);
  });
}

export function installUnifiedTextSelectMenus(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns portalTarget and supplies the matching DOM constructors/events.
  const realm = ownerWindow as Window & typeof globalThis;
  const runtimeMounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = runtimeMounts.item(runtimeMounts.length - 1);
  if (!runtimeMount) return;

  let disposed = false;
  let transforming = false;
  let openMenu: OpenMenu | null = null;

  const closeMenu = (restoreFocus = false) => {
    const current = openMenu;
    if (!current) return;
    current.popup.remove();
    current.trigger.setAttribute("aria-expanded", "false");
    current.chevron?.style.setProperty("transform", "rotate(45deg)");
    const controlShell = current.trigger.closest<HTMLElement>(
      "[data-mesurer-unified-select-shell='true'], [data-mesurer-unified-style-shell='true']",
    );
    if (controlShell) {
      controlShell.style.boxShadow = "none";
      controlShell.style.borderColor = "transparent";
    }
    openMenu = null;
    if (restoreFocus && current.trigger.isConnected) current.trigger.focus({ preventScroll: true });
  };

  const positionMenu = () => {
    const current = openMenu;
    if (!current?.trigger.isConnected || !current.popup.isConnected
      || !current.shell.isConnected || !current.card.isConnected) {
      closeMenu();
      return;
    }

    const triggerRect = current.trigger.getBoundingClientRect();
    const shellRect = current.shell.getBoundingClientRect();
    const cardRect = current.card.getBoundingClientRect();
    if (
      triggerRect.width <= 0
      || triggerRect.height <= 0
      || shellRect.width <= 0
      || shellRect.height <= 0
      || cardRect.width <= 0
      || cardRect.height <= 0
    ) return;

    const usableWidth = Math.max(1, cardRect.width - MENU_PADDING * 2);
    const width = Math.min(Math.max(triggerRect.width, 120), usableWidth);
    current.popup.style.width = `${width}px`;
    current.popup.style.maxWidth = `${usableWidth}px`;

    const cardMaxHeight = Math.max(1, cardRect.height - MENU_PADDING * 2);
    const naturalHeight = Math.min(
      MENU_MAX_HEIGHT,
      Math.max(MENU_MIN_HEIGHT, current.popup.scrollHeight),
    );
    const height = Math.min(naturalHeight, cardMaxHeight);
    current.popup.style.maxHeight = `${height}px`;

    const cardLeft = cardRect.left - shellRect.left;
    const cardTop = cardRect.top - shellRect.top;
    const triggerLeft = triggerRect.left - shellRect.left;
    const triggerTop = triggerRect.top - shellRect.top;
    const triggerBottom = triggerRect.bottom - shellRect.top;
    const cardBottom = cardRect.bottom - shellRect.top;
    const spaceAbove = Math.max(0, triggerTop - cardTop - MENU_GAP - MENU_PADDING);
    const spaceBelow = Math.max(0, cardBottom - triggerBottom - MENU_GAP - MENU_PADDING);
    const openBelow = spaceBelow >= height || spaceBelow >= spaceAbove;
    const desiredTop = openBelow
      ? triggerBottom + MENU_GAP
      : triggerTop - MENU_GAP - height;

    const minLeft = cardLeft + MENU_PADDING;
    const maxLeft = Math.max(minLeft, cardLeft + cardRect.width - MENU_PADDING - width);
    const minTop = cardTop + MENU_PADDING;
    const maxTop = Math.max(minTop, cardTop + cardRect.height - MENU_PADDING - height);
    current.popup.style.left = `${clamp(triggerLeft, minLeft, maxLeft)}px`;
    current.popup.style.top = `${clamp(desiredTop, minTop, maxTop)}px`;
  };

  const makeOptionButton = (option: MenuOption) => {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.dataset.mesurerUnifiedSelectOption = option.key;
    button.setAttribute("role", "option");
    button.setAttribute("aria-label", option.label);
    button.setAttribute("aria-selected", option.selected ? "true" : "false");
    button.disabled = option.disabled;
    Object.assign(button.style, {
      width: "100%",
      minHeight: "30px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      boxSizing: "border-box",
      border: "0",
      borderRadius: "5px",
      background: option.selected ? INK_100 : "transparent",
      color: option.disabled ? INK_500 : INK_900,
      padding: "0 9px",
      textAlign: "left",
      font: `${option.selected ? "600" : "500"} 11px/1.2 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`,
      cursor: option.disabled ? "default" : "pointer",
      opacity: option.disabled ? "0.55" : "1",
      pointerEvents: "auto",
    });

    const label = ownerDocument.createElement("span");
    label.textContent = option.label;
    Object.assign(label.style, {
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    button.append(label);

    if (option.shortcut) {
      const shortcut = ownerDocument.createElement("span");
      shortcut.textContent = option.shortcut;
      Object.assign(shortcut.style, {
        flex: "0 0 auto",
        color: INK_500,
        font: "500 10px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        whiteSpace: "nowrap",
      });
      button.append(shortcut);
    }

    button.addEventListener("mouseenter", () => {
      if (!option.disabled) button.style.background = option.selected ? INK_100 : INK_50;
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = option.selected ? INK_100 : "transparent";
    });
    button.addEventListener("click", () => {
      if (option.disabled) return;
      option.activate();
      closeMenu();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const popup = button.closest<HTMLElement>("[data-mesurer-unified-select-popup='true']");
      if (!popup) return;
      const options = Array.from(popup.querySelectorAll<HTMLButtonElement>("[data-mesurer-unified-select-option]"))
        .filter((candidate) => !candidate.disabled);
      const index = options.indexOf(button);
      if (index < 0 || options.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      options[(index + delta + options.length) % options.length]?.focus({ preventScroll: true });
    });

    return button;
  };

  const openOptions = (
    trigger: HTMLButtonElement,
    chevron: HTMLElement | null,
    options: MenuOption[],
  ) => {
    if (openMenu?.trigger === trigger) {
      closeMenu(true);
      return;
    }
    closeMenu();

    const card = trigger.closest<HTMLElement>(
      "[data-mesurer-text-inspector-info='true'][data-mesurer-text-inspector-unified='true']",
    );
    const shell = card?.parentElement?.dataset.mesurerTextInspectorPlacementShell === "true"
      ? card.parentElement
      : null;
    if (!card || !shell) return;

    const popup = ownerDocument.createElement("div");
    popup.dataset.mesurerUnifiedSelectPopup = "true";
    popup.dataset.mesurerUnifiedSelectKind = trigger.dataset.mesurerUnifiedSelectTrigger ?? "select";
    popup.dataset.mesurerInspectorUi = "true";
    popup.setAttribute("role", "listbox");
    Object.assign(popup.style, {
      position: "absolute",
      inset: "auto",
      margin: "0",
      zIndex: "2147483647",
      minWidth: "120px",
      maxHeight: `${MENU_MAX_HEIGHT}px`,
      overflowY: "auto",
      boxSizing: "border-box",
      border: `1px solid ${INK_200}`,
      borderRadius: "8px",
      background: "#ffffff",
      padding: `${MENU_PADDING}px`,
      boxShadow: "0 8px 24px rgba(15, 23, 42, 0.14), 0 2px 6px rgba(15, 23, 42, 0.08)",
      pointerEvents: "auto",
    });

    for (const option of options) popup.append(makeOptionButton(option));
    card.append(popup);
    trigger.setAttribute("aria-expanded", "true");
    chevron?.style.setProperty("transform", "rotate(225deg)");
    const controlShell = trigger.closest<HTMLElement>(
      "[data-mesurer-unified-select-shell='true'], [data-mesurer-unified-style-shell='true']",
    );
    if (controlShell) {
      controlShell.style.borderColor = "transparent";
      controlShell.style.boxShadow = `inset 0 0 0 1px ${ACCENT}`;
    }
    openMenu = { popup, trigger, chevron, shell, card };
    positionMenu();

    const selected = popup.querySelector<HTMLButtonElement>("[aria-selected='true']:not(:disabled)")
      ?? popup.querySelector<HTMLButtonElement>("[data-mesurer-unified-select-option]:not(:disabled)");
    selected?.focus({ preventScroll: true });
  };

  const styleTrigger = (
    trigger: HTMLButtonElement,
    shell: HTMLElement,
  ) => {
    Object.assign(trigger.style, {
      position: "absolute",
      inset: "0",
      zIndex: "1",
      width: "100%",
      height: "100%",
      boxSizing: "border-box",
      border: "0",
      borderRadius: "5px",
      background: "transparent",
      color: INK_700,
      padding: "0 28px 0 8px",
      textAlign: "left",
      font: "500 11px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      cursor: "pointer",
      outline: "none",
    });
    trigger.addEventListener("focus", () => {
      shell.style.borderColor = "transparent";
      shell.style.boxShadow = `inset 0 0 0 1px ${ACCENT}`;
    });
    trigger.addEventListener("blur", () => {
      if (openMenu?.trigger !== trigger) shell.style.boxShadow = "none";
    });
  };

  const enhanceNativeSelect = (select: HTMLSelectElement) => {
    const shell = select.closest<HTMLElement>("[data-mesurer-unified-select-shell='true']");
    if (!shell || shell.dataset.mesurerUnifiedCustomSelect === "true") return;
    shell.dataset.mesurerUnifiedCustomSelect = "true";
    Object.assign(select.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      opacity: "0",
      pointerEvents: "none",
    });
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    const kind = select.dataset.mesurerTextStyleSelect ?? select.getAttribute("aria-label") ?? "select";
    const trigger = ownerDocument.createElement("button");
    trigger.type = "button";
    trigger.dataset.mesurerUnifiedSelectTrigger = kind;
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", select.getAttribute("aria-label") ?? kind);
    const chevron = shell.querySelector<HTMLElement>("[data-mesurer-unified-select-chevron='true']");
    if (chevron) chevron.style.zIndex = "2";
    styleTrigger(trigger, shell);

    const syncLabel = () => {
      const option = select.selectedOptions.item(0);
      trigger.textContent = option?.textContent?.trim() || select.value;
    };
    syncLabel();
    select.addEventListener("change", syncLabel);

    const options = () => Array.from(select.options).map((option) => ({
      key: option.value,
      label: option.textContent?.trim() || option.value,
      shortcut: null,
      selected: option.selected,
      disabled: option.disabled,
      activate: () => {
        if (select.value === option.value) {
          closeMenu();
          return;
        }
        select.value = option.value;
        select.dispatchEvent(new realm.Event("input", { bubbles: true }));
        select.dispatchEvent(new realm.Event("change", { bubbles: true }));
        syncLabel();
      },
    }));

    trigger.addEventListener("click", () => openOptions(trigger, chevron, options()));
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu(true);
        return;
      }
      if (!["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      openOptions(trigger, chevron, options());
    });
    if (chevron) shell.insertBefore(trigger, chevron);
    else shell.append(trigger);
  };

  const enhanceStylePreset = (card: HTMLElement) => {
    const original = card.querySelector<HTMLButtonElement>(
      "[data-mesurer-text-style-menu-button='true']:not([data-mesurer-unified-select-trigger='style'])",
    );
    if (!original || original.dataset.mesurerUnifiedCustomStyle === "true") return;
    original.dataset.mesurerUnifiedCustomStyle = "true";
    delete original.dataset.mesurerTextStyleMenuButton;
    original.style.display = "none";
    original.tabIndex = -1;
    original.setAttribute("aria-hidden", "true");
    for (const panel of card.querySelectorAll("[data-mesurer-unified-text-presets='true']")) panel.remove();

    const parent = original.parentElement;
    if (!parent) return;
    const shell = ownerDocument.createElement("div");
    shell.dataset.mesurerUnifiedStyleShell = "true";
    Object.assign(shell.style, {
      position: "relative",
      width: "100%",
      minWidth: "0",
      height: "28px",
      boxSizing: "border-box",
      border: "1px solid transparent",
      borderRadius: "5px",
      background: INK_50,
      transition: "border-color 120ms ease, box-shadow 120ms ease, background 120ms ease",
    });

    const trigger = ownerDocument.createElement("button");
    trigger.type = "button";
    trigger.dataset.mesurerUnifiedSelectTrigger = "style";
    trigger.dataset.mesurerTextStyleMenuButton = "true";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "Text style");
    styleTrigger(trigger, shell);
    shell.addEventListener("mouseenter", () => { shell.style.borderColor = INK_200; });
    shell.addEventListener("mouseleave", () => {
      if (openMenu?.trigger !== trigger && ownerDocument.activeElement !== trigger) shell.style.borderColor = "transparent";
    });

    const chevron = ownerDocument.createElement("span");
    chevron.dataset.mesurerUnifiedSelectChevron = "true";
    chevron.setAttribute("aria-hidden", "true");
    Object.assign(chevron.style, {
      position: "absolute",
      zIndex: "2",
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

    const sourceMenu = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-style-menu='true']");
    const sourceButtons = () => sourceMenu
      ? Array.from(sourceMenu.querySelectorAll<HTMLButtonElement>("[data-mesurer-text-style-preset]"))
      : [];
    const syncLabel = () => {
      const buttons = sourceButtons();
      const active = buttons.find((button) => button.getAttribute("aria-current") === "true") ?? buttons[0];
      trigger.textContent = active?.getAttribute("aria-label") ?? "Text";
    };
    syncLabel();

    const options = () => sourceButtons().map((button) => ({
      key: button.dataset.mesurerTextStylePreset ?? button.getAttribute("aria-label") ?? "preset",
      label: button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "Text",
      shortcut: button.lastElementChild?.textContent?.trim() || null,
      selected: button.getAttribute("aria-current") === "true",
      disabled: button.disabled,
      activate: () => {
        button.click();
        syncLabel();
      },
    }));

    trigger.addEventListener("click", () => openOptions(trigger, chevron, options()));
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu(true);
        return;
      }
      if (!["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      openOptions(trigger, chevron, options());
    });

    shell.append(trigger, chevron);
    parent.append(shell);
  };

  const transform = () => {
    if (disposed || transforming) return;
    transforming = true;
    try {
      const card = runtimeMount.querySelector<HTMLElement>(
        "[data-mesurer-text-inspector-info='true'][data-mesurer-text-inspector-unified='true']",
      );
      if (!card) {
        closeMenu();
        return;
      }
      for (const select of Array.from(card.querySelectorAll<HTMLSelectElement>("[data-mesurer-text-style-select]"))) {
        enhanceNativeSelect(select);
      }
      enhanceStylePreset(card);
    } finally {
      transforming = false;
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!openMenu) return;
    const path = event.composedPath();
    if (path.includes(openMenu.popup) || path.includes(openMenu.trigger)) return;
    closeMenu();
  };

  ownerWindow.addEventListener("pointerdown", onPointerDown, true);
  ownerWindow.addEventListener("resize", positionMenu);

  const observer = new realm.MutationObserver(transform);
  observer.observe(runtimeMount, { childList: true, subtree: true });
  transform();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    closeMenu();
    ownerWindow.removeEventListener("pointerdown", onPointerDown, true);
    ownerWindow.removeEventListener("resize", positionMenu);
  });
}
