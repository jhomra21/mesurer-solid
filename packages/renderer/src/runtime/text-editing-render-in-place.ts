import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import { isElementWithinDomTarget } from "@jhomra21/mesurer-solid-dom";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { isMesurerInputBoundary } from "../core/events";

const TOOLBAR_BLUE = "#0d99ff";
const SELECTION_FILL = "rgba(13, 153, 255, 0.22)";
const SKIP_TAGS = new Set([
  "HTML", "BODY", "SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT",
  "IMG", "VIDEO", "AUDIO", "IFRAME", "INPUT", "TEXTAREA", "SELECT", "OPTION",
]);

type DirectTextNode = {
  node: Text;
  index: number;
};

type ActiveTextTarget = {
  element: HTMLElement;
  node: Text;
};

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

const activeTargetByRuntime = new WeakMap<MesurerSolidRuntimeService, ActiveTextTarget>();

const directTextNodes = (
  element: HTMLElement,
  realm: Window & typeof globalThis,
): DirectTextNode[] => Array.from(element.childNodes)
  .map((node, index) => ({ node, index }))
  .filter((value): value is DirectTextNode => (
    value.node.nodeType === realm.Node.TEXT_NODE
    && Boolean(value.node.nodeValue?.trim())
  ));

const directTextNodeAtPoint = (
  ownerDocument: Document,
  realm: Window & typeof globalThis,
  candidates: DirectTextNode[],
  x: number,
  y: number,
) => {
  // SAFETY: This only exposes optional browser caret APIs on the same ownerDocument object.
  const caretDocument = ownerDocument as CaretDocument;
  const caretPosition = caretDocument.caretPositionFromPoint?.(x, y);
  if (caretPosition?.offsetNode instanceof realm.Text) {
    const direct = candidates.find((candidate) => candidate.node === caretPosition.offsetNode);
    if (direct) return direct;
  }

  const caretRange = caretDocument.caretRangeFromPoint?.(x, y);
  if (caretRange?.startContainer instanceof realm.Text) {
    const direct = candidates.find((candidate) => candidate.node === caretRange.startContainer);
    if (direct) return direct;
  }

  for (const candidate of candidates) {
    const range = ownerDocument.createRange();
    range.selectNodeContents(candidate.node);
    let rects: DOMRectList;
    try {
      rects = range.getClientRects();
    } catch {
      continue;
    }
    const hit = Array.from(rects).some((rect) => (
      x >= rect.left - 1
      && x <= rect.right + 1
      && y >= rect.top - 1
      && y <= rect.bottom + 1
    ));
    if (hit) return candidate;
  }

  return null;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * The core text editor historically required exactly one non-empty direct text
 * node. For mixed inline copy such as `text <kbd>key</kbd> text`, expose only
 * the direct text node under the pointer for the duration of the current event
 * dispatch. The real DOM is never reparented or rewritten. Cleanup runs in the
 * next task so the temporary view survives browser microtask checkpoints that
 * can occur between same-event listeners.
 */
export function installMixedInlineTextTargeting(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, pageTarget } = runtime;
  // SAFETY: ownerWindow owns ownerDocument/pageTarget and supplies their matching DOM constructors.
  const realm = ownerWindow as Window & typeof globalThis;

  const directEditingMode = () => {
    const mode = runtime.currentToolMode?.() ?? "none";
    return mode === "text-inspector" || mode === "select";
  };

  const isPageElement = (element: HTMLElement) =>
    isElementWithinDomTarget(element, pageTarget)
    && !element.closest("[data-mesurer-root='true'], [data-mesurer-inspector-ui='true']");

  const prepareAt = (x: number, y: number) => {
    activeTargetByRuntime.delete(runtime);
    if (!directEditingMode()) return;

    for (const candidate of ownerDocument.elementsFromPoint(x, y)) {
      if (isMesurerInputBoundary(candidate, ownerWindow)) return;
      if (!(candidate instanceof realm.HTMLElement)) continue;
      if (!isPageElement(candidate) || SKIP_TAGS.has(candidate.tagName)) continue;
      if (candidate.isContentEditable) continue;

      const nodes = directTextNodes(candidate, realm);
      if (nodes.length === 0) continue;

      // Match the core editor's broad single-node contract. A lone direct text
      // node is unambiguous even when the pointer lands in empty inline space
      // inside a wide text element, so it does not need glyph-level hit testing.
      if (nodes.length === 1) {
        activeTargetByRuntime.set(runtime, { element: candidate, node: nodes[0].node });
        return;
      }

      // Mixed inline elements need the exact direct text run under the pointer
      // so surrounding markup such as <kbd> remains untouched.
      const target = directTextNodeAtPoint(ownerDocument, realm, nodes, x, y);
      if (!target) continue;

      activeTargetByRuntime.set(runtime, { element: candidate, node: target.node });
      if (Object.prototype.hasOwnProperty.call(candidate, "childNodes")) {
        activeTargetByRuntime.delete(runtime);
        continue;
      }

      const actualChildren = Array.from(candidate.childNodes);
      const singleTargetView = actualChildren.map((node, index) => {
        if (index === target.index) return node;
        if (node.nodeType !== realm.Node.TEXT_NODE || !node.nodeValue?.trim()) return node;
        return ownerDocument.createComment("mesurer-non-target-text");
      });

      const eventScopedGetter = () => singleTargetView;
      Object.defineProperty(candidate, "childNodes", {
        configurable: true,
        get: eventScopedGetter,
      });

      ownerWindow.setTimeout(() => {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, "childNodes");
        if (descriptor?.get === eventScopedGetter) Reflect.deleteProperty(candidate, "childNodes");
      }, 0);
      return;
    }
  };

  const onDoubleClick = (event: MouseEvent) => prepareAt(event.clientX, event.clientY);
  const onTouchPointerUp = (event: PointerEvent) => {
    if (!event.pointerType || event.pointerType === "mouse") return;
    prepareAt(event.clientX, event.clientY);
  };

  ownerWindow.addEventListener("dblclick", onDoubleClick, true);
  ownerWindow.addEventListener("pointerup", onTouchPointerUp, true);

  ctx.lifecycle.onDispose(() => {
    activeTargetByRuntime.delete(runtime);
    ownerWindow.removeEventListener("dblclick", onDoubleClick, true);
    ownerWindow.removeEventListener("pointerup", onTouchPointerUp, true);
  });
}

/**
 * Keep the host element as the visual source of truth while editing. The
 * textarea remains the keyboard/input surface, but is transparent so entering
 * edit mode cannot repaint the target background or layout. A fixed inset ring
 * marks edit state and lightweight range overlays restore the familiar initial
 * select-all highlight without making the textarea visible again.
 */
export function installRenderInPlaceTextEditing(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, pageTarget, portalTarget } = runtime;
  // SAFETY: ownerWindow owns portalTarget and supplies the matching MutationObserver constructor.
  const realm = ownerWindow as Window & typeof globalThis;
  const runtimeMounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = runtimeMounts.item(runtimeMounts.length - 1);
  if (!runtimeMount) return;
  const workspace = runtime.createWorkspaceRuntime();

  let ring: HTMLDivElement | null = null;
  let selectionRects: HTMLDivElement[] = [];
  let boundEditor: HTMLTextAreaElement | null = null;
  let resolvedEditorTarget: ActiveTextTarget | null = null;
  let queued = false;
  let disposed = false;

  const removeRing = () => {
    ring?.remove();
    ring = null;
  };

  const clearSelectionRects = () => {
    for (const rect of selectionRects) rect.remove();
    selectionRects = [];
  };

  const ensureSelectionRect = (index: number) => {
    const existing = selectionRects[index];
    if (existing?.isConnected) return existing;
    const highlight = ownerDocument.createElement("div");
    highlight.dataset.mesurerTextSelectionHighlight = "true";
    highlight.dataset.mesurerInspectorUi = "true";
    highlight.setAttribute("aria-hidden", "true");
    Object.assign(highlight.style, {
      position: "fixed",
      zIndex: "2147483644",
      pointerEvents: "none",
      borderRadius: "2px",
      background: SELECTION_FILL,
      transition: "none",
      animation: "none",
    });
    portalTarget.append(highlight);
    selectionRects[index] = highlight;
    return highlight;
  };

  const trimSelectionRects = (count: number) => {
    while (selectionRects.length > count) selectionRects.pop()?.remove();
  };

  const ensureRing = () => {
    if (ring?.isConnected) return ring;
    ring = ownerDocument.createElement("div");
    ring.dataset.mesurerTextEditRing = "true";
    ring.dataset.mesurerInspectorUi = "true";
    ring.setAttribute("aria-hidden", "true");
    Object.assign(ring.style, {
      position: "fixed",
      zIndex: "2147483645",
      pointerEvents: "none",
      boxSizing: "border-box",
      background: "transparent",
      boxShadow: `inset 0 0 0 1.5px ${TOOLBAR_BLUE}`,
      transition: "none",
      animation: "none",
    });
    runtimeMount.append(ring);
    return ring;
  };

  const schedule = () => {
    if (disposed || queued) return;
    queued = true;
    ownerWindow.queueMicrotask(() => {
      queued = false;
      refine();
    });
  };

  const renderSelection = (
    editor: HTMLTextAreaElement,
    target: ActiveTextTarget | null,
  ) => {
    if (!target?.node.isConnected || target.node.parentNode !== target.element) {
      clearSelectionRects();
      return;
    }

    const start = editor.selectionStart ?? 0;
    const end = editor.selectionEnd ?? start;
    if (start === end) {
      clearSelectionRects();
      return;
    }

    const text = target.node.nodeValue ?? "";
    const leadingLength = text.length - text.trimStart().length;
    const trailingLength = text.length - text.trimEnd().length;
    const editableLength = Math.max(0, text.length - leadingLength - trailingLength);
    const rangeStart = leadingLength + clamp(Math.min(start, end), 0, editableLength);
    const rangeEnd = leadingLength + clamp(Math.max(start, end), 0, editableLength);
    if (rangeStart === rangeEnd) {
      clearSelectionRects();
      return;
    }

    const range = ownerDocument.createRange();
    try {
      range.setStart(target.node, rangeStart);
      range.setEnd(target.node, rangeEnd);
    } catch {
      clearSelectionRects();
      return;
    }

    let rects: DOMRect[];
    try {
      rects = Array.from(range.getClientRects()).filter((rect) => (
        rect.width > 0
        && rect.height > 0
        && rect.right > 0
        && rect.bottom > 0
        && rect.left < ownerWindow.innerWidth
        && rect.top < ownerWindow.innerHeight
      ));
    } catch {
      clearSelectionRects();
      return;
    }

    for (const [index, rect] of rects.entries()) {
      const highlight = ensureSelectionRect(index);
      Object.assign(highlight.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    }
    trimSelectionRects(rects.length);
  };

  const bindEditor = (editor: HTMLTextAreaElement) => {
    if (boundEditor === editor) return;
    if (boundEditor) {
      boundEditor.removeEventListener("input", schedule);
      boundEditor.removeEventListener("select", schedule);
      boundEditor.removeEventListener("keyup", schedule);
      boundEditor.removeEventListener("pointerup", schedule);
    }
    boundEditor = editor;
    resolvedEditorTarget = null;
    editor.addEventListener("input", schedule);
    editor.addEventListener("select", schedule);
    editor.addEventListener("keyup", schedule);
    editor.addEventListener("pointerup", schedule);
  };

  const selectedTargetForEditor = (editor: HTMLTextAreaElement): ActiveTextTarget | null => {
    const candidates = workspace.currentSelection().elements.filter((element) => (
      element.isConnected
      && isElementWithinDomTarget(element, pageTarget)
      && !element.closest("[data-mesurer-root='true'], [data-mesurer-inspector-ui='true']")
    ));
    if (candidates.length !== 1) return null;
    const element = candidates[0];
    const nodes = directTextNodes(element, realm);
    if (!nodes.length) return null;
    const editorValue = editor.value.trim();
    const exact = nodes.find(({ node }) => (node.nodeValue ?? "").trim() === editorValue)
      ?? (nodes.length === 1 ? nodes[0] : null);
    return exact ? { element, node: exact.node } : null;
  };

  const refine = () => {
    if (disposed) return;
    const editor = runtimeMount.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
    if (!editor) {
      if (boundEditor) {
        boundEditor.removeEventListener("input", schedule);
        boundEditor.removeEventListener("select", schedule);
        boundEditor.removeEventListener("keyup", schedule);
        boundEditor.removeEventListener("pointerup", schedule);
      }
      boundEditor = null;
      resolvedEditorTarget = null;
      clearSelectionRects();
      removeRing();
      return;
    }

    // The host element underneath already mirrors editor input through the
    // core session. Hiding the textarea leaves the real rendered background,
    // inline children, wrapping, and selected geometry untouched.
    editor.style.opacity = "0";
    editor.style.background = "transparent";
    editor.style.boxShadow = "none";
    bindEditor(editor);

    const preparedTarget = activeTargetByRuntime.get(runtime) ?? null;
    const target = preparedTarget
      ?? resolvedEditorTarget
      ?? selectedTargetForEditor(editor);
    if (target?.element.isConnected && target.node.isConnected) resolvedEditorTarget = target;

    const host = target?.element ?? null;
    const hostIsUsable = Boolean(
      host?.isConnected
      && isElementWithinDomTarget(host, pageTarget)
      && !host.closest("[data-mesurer-root='true'], [data-mesurer-inspector-ui='true']"),
    );
    const hostElement = hostIsUsable ? host : null;
    const rect = hostElement?.getBoundingClientRect() ?? editor.getBoundingClientRect();
    const style = ownerWindow.getComputedStyle(hostElement ?? editor);
    const editRing = ensureRing();
    Object.assign(editRing.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderRadius: style.borderRadius,
    });

    renderSelection(editor, hostElement ? target : null);
  };

  const syncOnScroll = () => {
    // Native CSS anchors already move the ring and selected-text paint in the
    // same compositor scroll. Re-reading DOM/Range geometry here forces layout
    // and is the visible source of trackpad catch-up. Keep the synchronous path
    // only until the native ring binding exists for fallback browsers.
    if (ring?.dataset.mesurerNativeScrollAnchor === "box") return;
    refine();
  };

  const observer = new realm.MutationObserver(schedule);
  observer.observe(runtimeMount, { childList: true, subtree: true });
  ownerWindow.addEventListener("resize", schedule);
  ownerWindow.addEventListener("scroll", syncOnScroll, true);
  refine();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    activeTargetByRuntime.delete(runtime);
    observer.disconnect();
    ownerWindow.removeEventListener("resize", schedule);
    ownerWindow.removeEventListener("scroll", syncOnScroll, true);
    if (boundEditor) {
      boundEditor.removeEventListener("input", schedule);
      boundEditor.removeEventListener("select", schedule);
      boundEditor.removeEventListener("keyup", schedule);
      boundEditor.removeEventListener("pointerup", schedule);
    }
    resolvedEditorTarget = null;
    clearSelectionRects();
    removeRing();
    workspace.dispose();
  });
}
