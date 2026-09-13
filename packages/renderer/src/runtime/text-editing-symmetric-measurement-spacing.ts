import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { MEASURE_LABEL_OFFSET } from "../core/constants";

const EDITOR = "[data-mesurer-text-editor='true']";
const EDIT_RING = "[data-mesurer-text-edit-ring='true']";
const INSPECTOR_CARD = "[data-mesurer-text-inspector-info='true']";
const INSPECTOR_SHELL = "[data-mesurer-text-inspector-placement-shell='true']";
const MEASUREMENT_ROOT = "[data-mesurer-measurement='true']";
const MEASUREMENT_CHROME = "[data-mesurer-measurement-chrome='true']";
const MEASUREMENT_LABEL = "[data-mesurer-measurement-label='true']";
const STANDARD_DIMENSIONS_LABEL_HEIGHT = 20;
const RECT_TOLERANCE = 8;
const GAP_TOLERANCE = 0.75;
const SPACING_MARKER = "data-mesurer-symmetric-measurement-spacing";

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const rectFromDom = (rect: DOMRect): Rect => ({
  left: rect.left,
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
  width: rect.width,
  height: rect.height,
});

const rectScore = (left: Rect, right: Rect) => (
  Math.abs(left.left - right.left)
  + Math.abs(left.top - right.top)
  + Math.abs(left.width - right.width)
  + Math.abs(left.height - right.height)
);

const fallbackLabelRect = (host: Rect): Rect => ({
  left: host.left,
  top: host.bottom + MEASURE_LABEL_OFFSET,
  right: host.right,
  bottom: host.bottom + MEASURE_LABEL_OFFSET + STANDARD_DIMENSIONS_LABEL_HEIGHT,
  width: host.width,
  height: STANDARD_DIMENSIONS_LABEL_HEIGHT,
});

const setStyleProperty = (element: HTMLElement, property: string, value: string) => {
  if (element.style.getPropertyValue(property) === value) return false;
  element.style.setProperty(property, value);
  return true;
};

/**
 * Final rendered-surface spacing owner for direct text edit.
 *
 * Placement and collision avoidance choose the lane first. This adapter then
 * measures Mesurer's own edit ring, dimensions pill, and Typography card and
 * removes only the rendered gap error. It intentionally has no scroll or hover
 * subscription: native anchoring carries the already-balanced surfaces while
 * pointer motion only changes transient hover evidence.
 */
export function installSymmetricMeasurementSpacing(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
  sourcePortalTarget: HTMLElement | ShadowRoot = runtime.portalTarget,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns the runtime DOM and therefore provides the realm
  // constructors used for every instanceof check in this adapter.
  const realm = ownerWindow as Window & typeof globalThis;
  const runtimeMounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = runtimeMounts.item(runtimeMounts.length - 1);
  if (!runtimeMount) return;

  const labels = new Set<HTMLElement>();
  let editor: HTMLTextAreaElement | null = null;
  let ring: HTMLElement | null = null;
  let shell: HTMLElement | null = null;
  let card: HTMLElement | null = null;
  let queued = false;
  let frame = 0;
  let disposed = false;

  const registerSurface = (element: HTMLElement) => {
    if (element instanceof realm.HTMLTextAreaElement && element.matches(EDITOR)) editor = element;
    if (element.matches(EDIT_RING)) ring = element;
    if (element.matches(INSPECTOR_SHELL)) shell = element;
    if (element.matches(INSPECTOR_CARD)) card = element;
    if (element.matches(MEASUREMENT_LABEL)) labels.add(element);
  };

  const registerNode = (node: Node) => {
    if (!(node instanceof realm.HTMLElement)) return;
    registerSurface(node);
    const isMesurerContainer = node === runtimeMount
      || node.matches(`${MEASUREMENT_ROOT}, [data-mesurer-text-edit-runtime='true'], [data-mesurer-root='true']`);
    if (!isMesurerContainer) return;
    for (const selector of [EDITOR, EDIT_RING, INSPECTOR_SHELL, INSPECTOR_CARD, MEASUREMENT_LABEL]) {
      for (const element of node.querySelectorAll<HTMLElement>(selector)) registerSurface(element);
    }
  };

  const seedMeasurementRoots = (scope: ParentNode) => {
    for (const root of scope.querySelectorAll<HTMLElement>(MEASUREMENT_ROOT)) registerNode(root);
  };

  registerNode(runtimeMount);
  seedMeasurementRoots(portalTarget);
  if (sourcePortalTarget !== portalTarget) seedMeasurementRoots(sourcePortalTarget);

  const matchingLabelRect = (host: Rect) => {
    let best: { rect: Rect; score: number } | null = null;
    for (const label of Array.from(labels)) {
      if (!label.isConnected) {
        labels.delete(label);
        continue;
      }

      const root = label.closest(MEASUREMENT_ROOT);
      if (!(root instanceof realm.HTMLElement)
        || root.getAttribute("data-mesurer-selected-measurement") !== "true") continue;

      const labelRect = rectFromDom(label.getBoundingClientRect());
      if (labelRect.width <= 0 || labelRect.height <= 0) continue;

      const chrome = root.querySelector<HTMLElement>(MEASUREMENT_CHROME);
      const chromeRect = chrome?.isConnected ? rectFromDom(chrome.getBoundingClientRect()) : null;
      const expectedTop = host.bottom + MEASURE_LABEL_OFFSET;
      const hostCenter = host.left + host.width / 2;
      const labelCenter = labelRect.left + labelRect.width / 2;
      const geometryScore = chromeRect && chromeRect.width > 0 && chromeRect.height > 0
        ? rectScore(chromeRect, host)
        : Math.abs(labelRect.top - expectedTop) + Math.abs(labelCenter - hostCenter);
      if (geometryScore > RECT_TOLERANCE * 4) continue;
      if (!best || geometryScore < best.score) best = { rect: labelRect, score: geometryScore };
    }
    return best?.rect ?? fallbackLabelRect(host);
  };

  const reconcile = () => {
    if (disposed) return;
    if (!editor?.isConnected || !ring?.isConnected || !shell?.isConnected || !card?.isConnected) return;

    const host = rectFromDom(ring.getBoundingClientRect());
    if (host.width <= 0 || host.height <= 0) return;
    const hostIntersectsViewport = host.right > 0
      && host.bottom > 0
      && host.left < ownerWindow.innerWidth
      && host.top < ownerWindow.innerHeight;
    if (!hostIntersectsViewport) return;

    const cardRect = rectFromDom(card.getBoundingClientRect());
    if (cardRect.width <= 0 || cardRect.height <= 0 || cardRect.top < host.bottom) return;

    const labelRect = matchingLabelRect(host);
    const sourceGap = labelRect.top - host.bottom;
    const typographyGap = cardRect.top - labelRect.bottom;
    const correction = typographyGap - sourceGap;

    shell.setAttribute(SPACING_MARKER, "true");
    shell.dataset.mesurerSymmetricSourceGap = sourceGap.toFixed(3);
    shell.dataset.mesurerSymmetricTypographyGap = typographyGap.toFixed(3);

    if (Math.abs(correction) <= GAP_TOLERANCE) return;

    const nativeAnchored = shell.dataset.mesurerNativeScrollOwner === "typography"
      && shell.dataset.mesurerNativeScrollAnchor === "offset";
    if (nativeAnchored) {
      const currentAnchor = Number.parseFloat(shell.style.getPropertyValue("--mesurer-native-anchor-y"));
      const shellRect = rectFromDom(shell.getBoundingClientRect());
      const current = Number.isFinite(currentAnchor) ? currentAnchor : shellRect.top - host.top;
      setStyleProperty(shell, "--mesurer-native-anchor-y", `${current - correction}px`);
    } else {
      const shellRect = rectFromDom(shell.getBoundingClientRect());
      const currentTop = Number.parseFloat(shell.style.top);
      const current = Number.isFinite(currentTop) ? currentTop : shellRect.top;
      setStyleProperty(shell, "top", `${current - correction}px`);
    }
  };

  const schedule = () => {
    if (disposed || queued) return;
    queued = true;
    ownerWindow.queueMicrotask(() => {
      queued = false;
      if (frame) return;
      frame = ownerWindow.requestAnimationFrame(() => {
        frame = 0;
        reconcile();
      });
    });
  };

  const observeRuntime = (records: MutationRecord[]) => {
    let relevant = false;
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.addedNodes) registerNode(node);
        relevant = true;
        continue;
      }
      if (!(record.target instanceof realm.HTMLElement)) continue;
      if (record.target.matches(INSPECTOR_SHELL)) {
        registerSurface(record.target);
        relevant = true;
      }
    }
    if (relevant) schedule();
  };

  const runtimeObserver = new realm.MutationObserver(observeRuntime);
  runtimeObserver.observe(runtimeMount, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "data-mesurer-native-scroll-owner", "data-mesurer-native-scroll-anchor"],
  });

  const externalObserver = new realm.MutationObserver((records) => {
    let relevant = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof realm.HTMLElement)) continue;
        if (!node.matches(`${MEASUREMENT_ROOT}, [data-mesurer-root='true']`)) continue;
        registerNode(node);
        relevant = true;
      }
    }
    if (relevant) schedule();
  });
  const observed = new Set<Node>();
  const observeExternal = (node: Node, subtree: boolean) => {
    if (observed.has(node) || node === runtimeMount) return;
    observed.add(node);
    externalObserver.observe(node, { childList: true, subtree });
  };
  observeExternal(portalTarget, portalTarget !== ownerDocument.body);
  if (sourcePortalTarget !== portalTarget) observeExternal(sourcePortalTarget, true);
  if (ownerDocument.body) observeExternal(ownerDocument.body, false);

  ownerWindow.addEventListener("resize", schedule, true);
  ownerWindow.addEventListener("dblclick", schedule, true);
  schedule();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    runtimeObserver.disconnect();
    externalObserver.disconnect();
    ownerWindow.removeEventListener("resize", schedule, true);
    ownerWindow.removeEventListener("dblclick", schedule, true);
    if (frame) ownerWindow.cancelAnimationFrame(frame);
    labels.clear();
    shell?.removeAttribute(SPACING_MARKER);
  });
}
