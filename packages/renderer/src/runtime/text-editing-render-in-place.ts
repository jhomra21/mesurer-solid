import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import { isElementWithinDomTarget } from "@jhomra21/mesurer-solid-dom";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const TOOLBAR_BLUE = "#0d99ff";
const SELECTION_FILL = "rgba(13, 153, 255, 0.22)";
const VIEWPORT_PADDING = 8;
const SURFACE_GAP = 8;
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

type SurfaceRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
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

const surfaceRect = (left: number, top: number, width: number, height: number): SurfaceRect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

const domSurfaceRect = (rect: DOMRect): SurfaceRect => surfaceRect(
  rect.left,
  rect.top,
  rect.width,
  rect.height,
);

const overlapArea = (left: SurfaceRect, right: SurfaceRect) => {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
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
      if (!(candidate instanceof realm.HTMLElement)) continue;
      if (!isPageElement(candidate) || SKIP_TAGS.has(candidate.tagName)) continue;
      if (candidate.isContentEditable) continue;

      const nodes = directTextNodes(candidate, realm);
      if (nodes.length === 0) continue;

      // A hit-stack ancestor may contain direct text somewhere else while an
      // Arrange/select overlay sits above the actual clicked line. Only let a
      // candidate win when this pointer intersects one of its own direct text
      // runs; otherwise keep scanning down to the real host element.
      const target = directTextNodeAtPoint(ownerDocument, realm, nodes, x, y);
      if (!target) continue;

      activeTargetByRuntime.set(runtime, { element: candidate, node: target.node });
      if (nodes.length === 1) return;
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

  let ring: HTMLDivElement | null = null;
  let selectionRects: HTMLDivElement[] = [];
  let boundEditor: HTMLTextAreaElement | null = null;
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

  const ensureRing = () => {
    if (ring?.isConnected) return ring;
    ring = ownerDocument.createElement("div");
    ring.dataset.mesurerTextEditRing = "true";
    ring.dataset.mesurerInspectorUi = "true";
    ring.setAttribute("aria-hidden", "true");
    Object.assign(ring.style, {
      position: "fixed",
      zIndex: "2147483647",
      pointerEvents: "none",
      boxSizing: "border-box",
      background: "transparent",
      boxShadow: `inset 0 0 0 1.5px ${TOOLBAR_BLUE}`,
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
    clearSelectionRects();
    if (!target?.node.isConnected || target.node.parentNode !== target.element) return;

    const start = editor.selectionStart ?? 0;
    const end = editor.selectionEnd ?? start;
    if (start === end) return;

    const text = target.node.nodeValue ?? "";
    const leadingLength = text.length - text.trimStart().length;
    const trailingLength = text.length - text.trimEnd().length;
    const editableLength = Math.max(0, text.length - leadingLength - trailingLength);
    const rangeStart = leadingLength + clamp(Math.min(start, end), 0, editableLength);
    const rangeEnd = leadingLength + clamp(Math.max(start, end), 0, editableLength);
    if (rangeStart === rangeEnd) return;

    const range = ownerDocument.createRange();
    try {
      range.setStart(target.node, rangeStart);
      range.setEnd(target.node, rangeEnd);
    } catch {
      return;
    }

    let rects: DOMRect[];
    try {
      rects = Array.from(range.getClientRects());
    } catch {
      return;
    }

    for (const rect of rects) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= ownerWindow.innerWidth || rect.top >= ownerWindow.innerHeight) {
        continue;
      }
      const highlight = ownerDocument.createElement("div");
      highlight.dataset.mesurerTextSelectionHighlight = "true";
      highlight.dataset.mesurerInspectorUi = "true";
      highlight.setAttribute("aria-hidden", "true");
      Object.assign(highlight.style, {
        position: "fixed",
        zIndex: "2147483646",
        pointerEvents: "none",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        borderRadius: "2px",
        background: SELECTION_FILL,
      });
      portalTarget.append(highlight);
      selectionRects.push(highlight);
    }
  };

  const visibleRect = (element: HTMLElement | null) => {
    if (!element?.isConnected) return null;
    const style = ownerWindow.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? domSurfaceRect(rect) : null;
  };

  const positionInspectorCard = (hostRect: SurfaceRect) => {
    const card = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-inspector-info='true']");
    if (!card) return;

    const measured = card.getBoundingClientRect();
    const width = Math.min(measured.width || 320, Math.max(1, ownerWindow.innerWidth - VIEWPORT_PADDING * 2));
    const height = measured.height;
    if (height <= 0) return;

    const toolbar = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-style-toolbar='true']");
    const menu = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-style-menu='true']");
    const toolbarRect = visibleRect(toolbar);
    const menuRect = visibleRect(menu);
    const obstacles = [hostRect, toolbarRect, menuRect].filter((rect): rect is SurfaceRect => Boolean(rect));
    const maxLeft = Math.max(VIEWPORT_PADDING, ownerWindow.innerWidth - VIEWPORT_PADDING - width);
    const maxTop = Math.max(VIEWPORT_PADDING, ownerWindow.innerHeight - VIEWPORT_PADDING - height);
    const centeredLeft = clamp(hostRect.left + hostRect.width / 2 - width / 2, VIEWPORT_PADDING, maxLeft);
    const centeredTop = clamp(hostRect.top + hostRect.height / 2 - height / 2, VIEWPORT_PADDING, maxTop);
    const right = hostRect.right + SURFACE_GAP;
    const left = hostRect.left - SURFACE_GAP - width;
    const above = hostRect.top - SURFACE_GAP - height;
    const below = hostRect.bottom + SURFACE_GAP;

    const rawCandidates = [
      [centeredLeft, above],
      [centeredLeft, below],
      [right, centeredTop],
      [right, VIEWPORT_PADDING],
      [right, maxTop],
      [left, centeredTop],
      [left, VIEWPORT_PADDING],
      [left, maxTop],
      [VIEWPORT_PADDING, VIEWPORT_PADDING],
      [maxLeft, VIEWPORT_PADDING],
      [VIEWPORT_PADDING, maxTop],
      [maxLeft, maxTop],
    ] as const;

    const hostCenterX = hostRect.left + hostRect.width / 2;
    const hostCenterY = hostRect.top + hostRect.height / 2;
    const candidates = rawCandidates
      .map(([candidateLeft, candidateTop], priority) => {
        const rect = surfaceRect(candidateLeft, candidateTop, width, height);
        const fitsViewport = rect.left >= VIEWPORT_PADDING
          && rect.top >= VIEWPORT_PADDING
          && rect.right <= ownerWindow.innerWidth - VIEWPORT_PADDING
          && rect.bottom <= ownerWindow.innerHeight - VIEWPORT_PADDING;
        if (!fitsViewport) return null;
        const overlap = obstacles.reduce((total, obstacle) => total + overlapArea(rect, obstacle), 0);
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(centerX - hostCenterX, centerY - hostCenterY);
        return { rect, overlap, distance, priority };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((leftCandidate, rightCandidate) => (
        leftCandidate.overlap - rightCandidate.overlap
        || leftCandidate.distance - rightCandidate.distance
        || leftCandidate.priority - rightCandidate.priority
      ));

    const best = candidates[0];
    if (!best) return;
    Object.assign(card.style, {
      transform: "none",
      left: `${best.rect.left}px`,
      top: `${best.rect.top}px`,
    });
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
    editor.addEventListener("input", schedule);
    editor.addEventListener("select", schedule);
    editor.addEventListener("keyup", schedule);
    editor.addEventListener("pointerup", schedule);
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

    const target = activeTargetByRuntime.get(runtime) ?? null;
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
    positionInspectorCard(domSurfaceRect(rect));
  };

  const observer = new realm.MutationObserver(schedule);
  observer.observe(runtimeMount, { childList: true, subtree: true });
  ownerWindow.addEventListener("resize", schedule);
  ownerWindow.addEventListener("scroll", schedule, true);
  refine();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    activeTargetByRuntime.delete(runtime);
    observer.disconnect();
    ownerWindow.removeEventListener("resize", schedule);
    ownerWindow.removeEventListener("scroll", schedule, true);
    if (boundEditor) {
      boundEditor.removeEventListener("input", schedule);
      boundEditor.removeEventListener("select", schedule);
      boundEditor.removeEventListener("keyup", schedule);
      boundEditor.removeEventListener("pointerup", schedule);
    }
    clearSelectionRects();
    removeRing();
  });
}
