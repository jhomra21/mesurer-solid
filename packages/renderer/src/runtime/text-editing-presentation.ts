import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const TOOLBAR_BLUE = "#0d99ff";
const TOOLBAR_MUTED = "#8a8a8a";
const PRESET_MENU_WIDTH = 288;
const CARET_WIDTH = 1.5;
const SCROLL_IDLE_MS = 80;

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

type OccludedInspectorSnapshot = {
  element: HTMLElement;
  visibility: string;
  visibilityPriority: string;
  pointerEvents: string;
  pointerEventsPriority: string;
  ariaHidden: string | null;
};

type ActiveTextTarget = {
  element: HTMLElement;
  node: Text;
  leadingLength: number;
};


const sameRect = (left: DOMRect, right: DOMRect, tolerance = 2) => (
  Math.abs(left.left - right.left) <= tolerance
  && Math.abs(left.top - right.top) <= tolerance
  && Math.abs(left.width - right.width) <= tolerance
  && Math.abs(left.height - right.height) <= tolerance
);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Keeps the field-local direct editor aligned with Mesurer's established
 * toolbar language without coupling Typography's hover/pin runtime to the
 * editing lifecycle. The text-edit core owns targeting, geometry, intent,
 * and history; this adapter owns transient typography controls and interaction
 * feedback that must track the rendered host rather than the transparent input.
 */
export function installTextEditingPresentation(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, pageTarget, portalTarget } = runtime;
  // SAFETY: ownerWindow owns portalTarget and therefore supplies the matching DOM constructors.
  const realm = ownerWindow as Window & typeof globalThis;
  const runtimeMounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = runtimeMounts.item(runtimeMounts.length - 1);
  if (!runtimeMount) return;

  const root = runtimeMount.closest<HTMLElement>("[data-mesurer-root='true']");
  let typographyButtonSnapshot: TypographyButtonSnapshot | null = null;
  const suppressedInspectorSurfaces = new Map<HTMLElement, InspectorSurfaceSnapshot>();
  let occludedInspectorSnapshot: OccludedInspectorSnapshot | null = null;
  let typographyContextActive = false;
  let boundEditor: HTMLTextAreaElement | null = null;
  let activeTextTarget: ActiveTextTarget | null = null;
  let caret: HTMLDivElement | null = null;
  let feedbackFrame = 0;
  let scrollIdleTimer = 0;
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

  const restoreOccludedInspector = () => {
    const snapshot = occludedInspectorSnapshot;
    if (!snapshot) return;
    const { element } = snapshot;
    if (element.isConnected) {
      if (snapshot.visibility || snapshot.visibilityPriority) {
        element.style.setProperty("visibility", snapshot.visibility, snapshot.visibilityPriority);
      } else {
        element.style.removeProperty("visibility");
      }
      if (snapshot.pointerEvents || snapshot.pointerEventsPriority) {
        element.style.setProperty("pointer-events", snapshot.pointerEvents, snapshot.pointerEventsPriority);
      } else {
        element.style.removeProperty("pointer-events");
      }
      if (snapshot.ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", snapshot.ariaHidden);
      delete element.dataset.mesurerTextInspectorAutoHidden;
    }
    occludedInspectorSnapshot = null;
  };

  const setInspectorOccluded = (element: HTMLElement, occluded: boolean) => {
    if (!occluded) {
      if (occludedInspectorSnapshot?.element === element) restoreOccludedInspector();
      return;
    }
    if (occludedInspectorSnapshot?.element === element) return;
    restoreOccludedInspector();
    occludedInspectorSnapshot = {
      element,
      visibility: element.style.getPropertyValue("visibility"),
      visibilityPriority: element.style.getPropertyPriority("visibility"),
      pointerEvents: element.style.getPropertyValue("pointer-events"),
      pointerEventsPriority: element.style.getPropertyPriority("pointer-events"),
      ariaHidden: element.getAttribute("aria-hidden"),
    };
    element.dataset.mesurerTextInspectorAutoHidden = "true";
    element.style.setProperty("visibility", "hidden", "important");
    element.style.setProperty("pointer-events", "none", "important");
    element.setAttribute("aria-hidden", "true");
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
  };

  const removeCaret = () => {
    caret?.remove();
    caret = null;
  };

  const ensureCaret = () => {
    if (caret?.isConnected) return caret;
    caret = ownerDocument.createElement("div");
    caret.dataset.mesurerTextCaret = "true";
    caret.dataset.mesurerInspectorUi = "true";
    caret.setAttribute("aria-hidden", "true");
    Object.assign(caret.style, {
      position: "fixed",
      zIndex: "2147483647",
      width: `${CARET_WIDTH}px`,
      pointerEvents: "none",
      transform: `translateX(-${CARET_WIDTH / 2}px)`,
      transformOrigin: "center",
    });
    portalTarget.append(caret);
    caret.animate?.([
      { opacity: "1", offset: 0 },
      { opacity: "1", offset: 0.49 },
      { opacity: "0", offset: 0.5 },
      { opacity: "0", offset: 1 },
    ], {
      duration: 1000,
      iterations: Infinity,
    });
    return caret;
  };

  const textFrame = (node: Text, value: string) => {
    const raw = node.nodeValue ?? "";
    const index = raw.indexOf(value);
    if (index >= 0 && !raw.slice(0, index).trim() && !raw.slice(index + value.length).trim()) {
      return { leadingLength: index };
    }
    if (raw.trim() === value.trim()) {
      return { leadingLength: raw.length - raw.trimStart().length };
    }
    return null;
  };

  const resolveActiveTextTarget = (
    editor: HTMLTextAreaElement,
    ring: HTMLElement,
  ): ActiveTextTarget | null => {
    if (activeTextTarget?.node.isConnected && activeTextTarget.node.parentNode === activeTextTarget.element) {
      const frame = textFrame(activeTextTarget.node, editor.value);
      if (frame) {
        activeTextTarget.leadingLength = frame.leadingLength;
        return activeTextTarget;
      }
    }

    const ringRect = ring.getBoundingClientRect();
    const points = [
      [ringRect.left + ringRect.width / 2, ringRect.top + ringRect.height / 2],
      [ringRect.left + 2, ringRect.top + 2],
      [ringRect.right - 2, ringRect.bottom - 2],
    ] as const;
    const candidates: HTMLElement[] = [];
    for (const [x, y] of points) {
      for (const candidate of ownerDocument.elementsFromPoint(x, y)) {
        if (!(candidate instanceof realm.HTMLElement) || candidates.includes(candidate)) continue;
        if (!pageTarget.contains(candidate)) continue;
        if (candidate.closest("[data-mesurer-root='true'], [data-mesurer-inspector-ui='true']")) continue;
        candidates.push(candidate);
      }
    }

    for (const candidate of candidates) {
      if (!sameRect(candidate.getBoundingClientRect(), ringRect)) continue;
      const matches = Array.from(candidate.childNodes)
        .filter((node): node is Text => node.nodeType === realm.Node.TEXT_NODE)
        .flatMap((node) => {
          const frame = textFrame(node, editor.value);
          return frame ? [{ node, leadingLength: frame.leadingLength }] : [];
        });
      if (matches.length !== 1) continue;
      activeTextTarget = {
        element: candidate,
        node: matches[0].node,
        leadingLength: matches[0].leadingLength,
      };
      return activeTextTarget;
    }

    return null;
  };

  const caretRect = (node: Text, offset: number) => {
    const collapsed = ownerDocument.createRange();
    try {
      collapsed.setStart(node, offset);
      collapsed.collapse(true);
      const rect = collapsed.getClientRects()[0] ?? collapsed.getBoundingClientRect();
      if (rect && rect.height > 0) {
        return { left: rect.left, top: rect.top, height: rect.height };
      }
    } catch {
      return null;
    }

    const length = node.nodeValue?.length ?? 0;
    const probe = ownerDocument.createRange();
    try {
      if (offset < length) {
        probe.setStart(node, offset);
        probe.setEnd(node, offset + 1);
        const rect = probe.getClientRects()[0] ?? probe.getBoundingClientRect();
        if (rect && rect.height > 0) return { left: rect.left, top: rect.top, height: rect.height };
      }
      if (offset > 0) {
        probe.setStart(node, offset - 1);
        probe.setEnd(node, offset);
        const rects = Array.from(probe.getClientRects());
        const rect = rects[rects.length - 1] ?? probe.getBoundingClientRect();
        if (rect && rect.height > 0) return { left: rect.right, top: rect.top, height: rect.height };
      }
    } catch {
      return null;
    }
    return null;
  };

  const renderCaret = (
    editor: HTMLTextAreaElement,
    ring: HTMLElement,
  ) => {
    const start = editor.selectionStart ?? 0;
    const end = editor.selectionEnd ?? start;
    if (start !== end || ownerDocument.activeElement !== editor) {
      removeCaret();
      return;
    }
    const target = resolveActiveTextTarget(editor, ring);
    if (!target) {
      removeCaret();
      return;
    }
    const offset = target.leadingLength + clamp(start, 0, editor.value.length);
    const rect = caretRect(target.node, offset);
    if (!rect || rect.left < 0 || rect.top < 0 || rect.left > ownerWindow.innerWidth || rect.top > ownerWindow.innerHeight) {
      removeCaret();
      return;
    }
    const style = ownerWindow.getComputedStyle(target.element);
    const cursor = ensureCaret();
    Object.assign(cursor.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      height: `${Math.max(1, rect.height)}px`,
      background: style.color && style.color !== "transparent" ? style.color : TOOLBAR_BLUE,
    });
  };

  const updateInteractionFeedback = () => {
    feedbackFrame = 0;
    if (disposed) return;
    const editor = runtimeMount.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
    const ring = portalTarget.querySelector<HTMLElement>("[data-mesurer-text-edit-ring='true']");
    const inspectorCard = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-inspector-info='true']");
    if (!editor || !ring) {
      restoreOccludedInspector();
      removeCaret();
      return;
    }

    if (inspectorCard) setInspectorOccluded(inspectorCard, false);
    else restoreOccludedInspector();
    renderCaret(editor, ring);
  };

  const scheduleInteractionFeedback = () => {
    if (disposed || feedbackFrame) return;
    feedbackFrame = ownerWindow.requestAnimationFrame(updateInteractionFeedback);
  };

  const onScroll = () => {
    // Caret/range geometry is main-thread layout work. Native anchors already
    // move the visible edit ring and selection paint in the compositor, so a
    // scroll burst should not run Range or DOM discovery once per frame.
    if (feedbackFrame) {
      ownerWindow.cancelAnimationFrame(feedbackFrame);
      feedbackFrame = 0;
    }
    if (caret) removeCaret();
    if (scrollIdleTimer) ownerWindow.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = ownerWindow.setTimeout(() => {
      scrollIdleTimer = 0;
      scheduleInteractionFeedback();
    }, SCROLL_IDLE_MS);
  };

  const unbindEditor = () => {
    if (!boundEditor) return;
    boundEditor.removeEventListener("input", scheduleInteractionFeedback);
    boundEditor.removeEventListener("select", scheduleInteractionFeedback);
    boundEditor.removeEventListener("keyup", scheduleInteractionFeedback);
    boundEditor.removeEventListener("pointerup", scheduleInteractionFeedback);
    boundEditor.removeEventListener("focus", scheduleInteractionFeedback);
    boundEditor.removeEventListener("blur", scheduleInteractionFeedback);
    boundEditor = null;
    activeTextTarget = null;
  };

  const bindEditor = (editor: HTMLTextAreaElement) => {
    if (boundEditor === editor) return;
    unbindEditor();
    boundEditor = editor;
    editor.addEventListener("input", scheduleInteractionFeedback);
    editor.addEventListener("select", scheduleInteractionFeedback);
    editor.addEventListener("keyup", scheduleInteractionFeedback);
    editor.addEventListener("pointerup", scheduleInteractionFeedback);
    editor.addEventListener("focus", scheduleInteractionFeedback);
    editor.addEventListener("blur", scheduleInteractionFeedback);
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
        unbindEditor();
        restoreOccludedInspector();
        removeCaret();
        restoreTypographyInspectorSurfaces();
        setTypographyContext(false);
        return;
      }

      bindEditor(editor);
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

      const directInputs = Array.from(menu.querySelectorAll<HTMLInputElement>("[data-mesurer-text-style-input]"));
      for (const input of directInputs) {
        const wrapper = input.parentElement;
        toolbar.insertBefore(input, presetButton);
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
      positionRefinedSurfaces(toolbar, menu);
      scheduleInteractionFeedback();
    } finally {
      refining = false;
    }
  };

  const observer = new realm.MutationObserver(() => refine());
  observer.observe(runtimeMount, { childList: true, subtree: true });
  ownerWindow.addEventListener("resize", scheduleInteractionFeedback);
  ownerWindow.addEventListener("scroll", onScroll, { capture: true, passive: true });
  refine();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    ownerWindow.removeEventListener("resize", scheduleInteractionFeedback);
    ownerWindow.removeEventListener("scroll", onScroll, true);
    if (feedbackFrame) ownerWindow.cancelAnimationFrame(feedbackFrame);
    if (scrollIdleTimer) ownerWindow.clearTimeout(scrollIdleTimer);
    feedbackFrame = 0;
    scrollIdleTimer = 0;
    unbindEditor();
    restoreOccludedInspector();
    removeCaret();
    restoreTypographyInspectorSurfaces();
    setTypographyContext(false);
  });
}
