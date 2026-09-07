import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import { isElementWithinDomTarget } from "@jhomra21/mesurer-solid-dom";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const TOOLBAR_BLUE = "#0d99ff";
const SKIP_TAGS = new Set([
  "HTML", "BODY", "SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT",
  "IMG", "VIDEO", "AUDIO", "IFRAME", "INPUT", "TEXTAREA", "SELECT", "OPTION",
]);
const activeHostByRuntime = new WeakMap<MesurerSolidRuntimeService, HTMLElement>();

type DirectTextNode = {
  node: Text;
  index: number;
};

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

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
    const hit = Array.from(range.getClientRects()).some((rect) => (
      x >= rect.left - 1
      && x <= rect.right + 1
      && y >= rect.top - 1
      && y <= rect.bottom + 1
    ));
    if (hit) return candidate;
  }

  return null;
};

/**
 * The core text editor historically required exactly one non-empty direct text
 * node. For mixed inline copy such as `text <kbd>key</kbd> text`, expose only
 * the direct text node under the pointer for the core's single synchronous
 * childNodes read. The real DOM is never reparented or rewritten, and the
 * one-shot view removes itself as soon as the core consumes it.
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
    activeHostByRuntime.delete(runtime);
    if (!directEditingMode()) return;

    for (const candidate of ownerDocument.elementsFromPoint(x, y)) {
      if (!(candidate instanceof realm.HTMLElement)) continue;
      if (!isPageElement(candidate) || SKIP_TAGS.has(candidate.tagName)) continue;
      if (candidate.isContentEditable) return;

      const nodes = directTextNodes(candidate, realm);
      if (nodes.length === 0) continue;

      activeHostByRuntime.set(runtime, candidate);
      if (nodes.length === 1) return;

      const target = directTextNodeAtPoint(ownerDocument, realm, nodes, x, y);
      if (!target || Object.prototype.hasOwnProperty.call(candidate, "childNodes")) {
        activeHostByRuntime.delete(runtime);
        return;
      }

      const actualChildren = Array.from(candidate.childNodes);
      const singleTargetView = actualChildren.map((node, index) => {
        if (index === target.index) return node;
        if (node.nodeType !== realm.Node.TEXT_NODE || !node.nodeValue?.trim()) return node;
        return ownerDocument.createComment("mesurer-non-target-text");
      });

      const oneShotGetter = () => {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, "childNodes");
        if (descriptor?.get === oneShotGetter) Reflect.deleteProperty(candidate, "childNodes");
        return singleTargetView;
      };

      Object.defineProperty(candidate, "childNodes", {
        configurable: true,
        get: oneShotGetter,
      });

      ownerWindow.queueMicrotask(() => {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, "childNodes");
        if (descriptor?.get === oneShotGetter) Reflect.deleteProperty(candidate, "childNodes");
      });
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
    activeHostByRuntime.delete(runtime);
    ownerWindow.removeEventListener("dblclick", onDoubleClick, true);
    ownerWindow.removeEventListener("pointerup", onTouchPointerUp, true);
  });
}

/**
 * Keep the host element as the visual source of truth while editing. The
 * textarea remains the keyboard/input surface, but is transparent so entering
 * edit mode cannot repaint the target background, text selection, or layout.
 * A fixed inset ring provides the only additional edit-state treatment.
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
  let boundEditor: HTMLTextAreaElement | null = null;
  let queued = false;
  let disposed = false;

  const removeRing = () => {
    ring?.remove();
    ring = null;
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

  const refine = () => {
    if (disposed) return;
    const editor = runtimeMount.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
    if (!editor) {
      boundEditor = null;
      activeHostByRuntime.delete(runtime);
      removeRing();
      return;
    }

    // The host element underneath already mirrors editor input through the
    // core session. Hiding the textarea leaves the real rendered background,
    // inline children, wrapping, and selected geometry untouched.
    editor.style.opacity = "0";
    editor.style.background = "transparent";
    editor.style.boxShadow = "none";

    if (boundEditor !== editor) {
      boundEditor = editor;
      editor.addEventListener("input", schedule);
    }

    const host = activeHostByRuntime.get(runtime);
    const hostIsUsable = Boolean(
      host?.isConnected
      && isElementWithinDomTarget(host, pageTarget)
      && !host.closest("[data-mesurer-root='true'], [data-mesurer-inspector-ui='true']"),
    );
    const rect = hostIsUsable ? host!.getBoundingClientRect() : editor.getBoundingClientRect();
    const style = ownerWindow.getComputedStyle(hostIsUsable ? host! : editor);
    const editRing = ensureRing();
    Object.assign(editRing.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderRadius: style.borderRadius,
    });
  };

  const observer = new realm.MutationObserver(schedule);
  observer.observe(runtimeMount, { childList: true, subtree: true });
  ownerWindow.addEventListener("resize", schedule);
  ownerWindow.addEventListener("scroll", schedule, true);
  refine();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    activeHostByRuntime.delete(runtime);
    observer.disconnect();
    ownerWindow.removeEventListener("resize", schedule);
    ownerWindow.removeEventListener("scroll", schedule, true);
    if (boundEditor) boundEditor.removeEventListener("input", schedule);
    removeRing();
  });
}
