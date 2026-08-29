import {
  defineMesurerPlugin,
  type MesurerElementFingerprint,
  type MesurerPlugin,
  type PluginValue,
} from "@jhomra21/mesurer-solid-core";
import {
  getElementFingerprint,
  getElementSelector,
  getRectFromDom,
  isElementFingerprintCompatible,
  isElementFingerprintRebindable,
  isElementWithinDomTarget,
} from "@jhomra21/mesurer-solid-dom";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

export const MESURER_ARRANGE_PLUGIN_ID = "mesurer.arrange";
export const MESURER_ARRANGE_SERVICE_ID = "arrange";
export const MESURER_ARRANGE_STATE_ID = "mesurer.arrange.intents";
export const MESURER_ARRANGE_ACTIVE_STATE_ID = "mesurer.arrange.active";

const RUNTIME_SERVICE_ID = "runtime:solid";
const TOGGLE_COMMAND = "arrange.toggle";
const COMMIT_COMMAND = "arrange.commit";
const CLEAR_COMMAND = "arrange.clear";
const MAX_INTENTS = 100;
const DEFAULT_REVIEW_TOLERANCE = 1;
const CAPTURE_PADDING = 24;

export type ArrangeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ArrangeOffset = {
  x: number;
  y: number;
};

export type ArrangeTarget = {
  id: string;
  selector: string;
  fingerprint: MesurerElementFingerprint;
  before: ArrangeRect;
  desired: ArrangeRect;
  beforeOffset: ArrangeOffset;
  desiredOffset: ArrangeOffset;
};

export type ArrangeIntent = {
  id: string;
  createdAt: number;
  pageUrl: string;
  targets: ArrangeTarget[];
};

export type ArrangePresentation = "before" | "desired" | "live";

export type ArrangeReviewTarget = {
  targetId: string;
  selector: string;
  desired: ArrangeRect;
  current: ArrangeRect | null;
  delta: ArrangeRect | null;
  matched: boolean;
};

export type ArrangeReview = {
  schema: "mesurer.arrange-review/v1";
  arrangeId: string;
  targetStatus: "connected" | "partial" | "stale";
  tolerance: number;
  matched: boolean;
  targets: ArrangeReviewTarget[];
};

export type ArrangeCapturePlan = {
  schema: "mesurer.arrange-capture/v1";
  arrangeId: string;
  state: ArrangePresentation;
  chrome: "hide";
  captures: Array<
    | { id: "viewport"; kind: "viewport" }
    | { id: "focus"; kind: "clip"; rect: ArrangeRect }
  >;
};

export type MesurerArrangeService = {
  active(): boolean;
  intents(): ArrangeIntent[];
  intent(id: string): ArrangeIntent | null;
  show(id: string, state: ArrangePresentation): void;
  showCurrent(): void;
  capturePlan(id: string, state: ArrangePresentation): ArrangeCapturePlan;
  review(id: string, tolerance?: number): ArrangeReview;
  clear(): Promise<void>;
};

type ArrangeTargetValue = {
  [key: string]: PluginValue;
  id: string;
  selector: string;
  fingerprintTag: string;
  fingerprintId: string | null;
  fingerprintTestId: string | null;
  fingerprintRole: string | null;
  fingerprintAriaLabel: string | null;
  fingerprintClasses: string[];
  fingerprintText: string | null;
  beforeLeft: number;
  beforeTop: number;
  beforeWidth: number;
  beforeHeight: number;
  desiredLeft: number;
  desiredTop: number;
  desiredWidth: number;
  desiredHeight: number;
  beforeOffsetX: number;
  beforeOffsetY: number;
  desiredOffsetX: number;
  desiredOffsetY: number;
};

type ArrangeIntentValue = {
  [key: string]: PluginValue;
  id: string;
  createdAt: number;
  pageUrl: string;
  targets: ArrangeTargetValue[];
};

type ArrangeStateValue = {
  [key: string]: PluginValue;
  intents: ArrangeIntentValue[];
};

type InlineTransform = {
  value: string;
  priority: string;
};

type AppliedPreview = {
  element: HTMLElement;
  transform: InlineTransform;
};

type DragTarget = {
  element: HTMLElement;
  target: ArrangeTargetValue;
};

type DragState = {
  pointerId: number;
  originX: number;
  originY: number;
  targets: DragTarget[];
  dx: number;
  dy: number;
};

type PresentationState = {
  intentId: string | null;
  state: ArrangePresentation;
};

const moveIcon = {
  viewBox: "0 0 24 24",
  paths: [
    "M12 2.75 8.75 6h2.5v5.25H6V8.75L2.75 12 6 15.25v-2.5h5.25V18h-2.5L12 21.25 15.25 18h-2.5v-5.25H18v2.5L21.25 12 18 8.75v2.5h-5.25V6h2.5L12 2.75Z",
  ],
};

const rect = (value: ArrangeRect): ArrangeRect => ({
  left: value.left,
  top: value.top,
  width: value.width,
  height: value.height,
});

const addOffset = (value: ArrangeRect, offset: ArrangeOffset): ArrangeRect => ({
  left: value.left + offset.x,
  top: value.top + offset.y,
  width: value.width,
  height: value.height,
});

const deltaRect = (current: ArrangeRect, desired: ArrangeRect): ArrangeRect => ({
  left: current.left - desired.left,
  top: current.top - desired.top,
  width: current.width - desired.width,
  height: current.height - desired.height,
});

const unionRects = (values: ArrangeRect[]): ArrangeRect | null => {
  if (!values.length) return null;
  const left = Math.min(...values.map((value) => value.left));
  const top = Math.min(...values.map((value) => value.top));
  const right = Math.max(...values.map((value) => value.left + value.width));
  const bottom = Math.max(...values.map((value) => value.top + value.height));
  return { left, top, width: right - left, height: bottom - top };
};

const pageUrl = (ownerWindow: Window) => {
  const { origin, pathname, search } = ownerWindow.location;
  return `${origin}${pathname}${search}`;
};

const randomId = (ownerWindow: Window, prefix: string) => {
  const value = ownerWindow.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
};

const fingerprintFromValue = (target: ArrangeTargetValue): MesurerElementFingerprint => ({
  tag: target.fingerprintTag,
  id: target.fingerprintId,
  testId: target.fingerprintTestId,
  role: target.fingerprintRole,
  ariaLabel: target.fingerprintAriaLabel,
  classes: [...target.fingerprintClasses],
  text: target.fingerprintText,
});

const publicTarget = (target: ArrangeTargetValue): ArrangeTarget => ({
  id: target.id,
  selector: target.selector,
  fingerprint: fingerprintFromValue(target),
  before: {
    left: target.beforeLeft,
    top: target.beforeTop,
    width: target.beforeWidth,
    height: target.beforeHeight,
  },
  desired: {
    left: target.desiredLeft,
    top: target.desiredTop,
    width: target.desiredWidth,
    height: target.desiredHeight,
  },
  beforeOffset: { x: target.beforeOffsetX, y: target.beforeOffsetY },
  desiredOffset: { x: target.desiredOffsetX, y: target.desiredOffsetY },
});

const publicIntent = (intent: ArrangeIntentValue): ArrangeIntent => ({
  id: intent.id,
  createdAt: intent.createdAt,
  pageUrl: intent.pageUrl,
  targets: intent.targets.map(publicTarget),
});

const restoreTransform = (preview: AppliedPreview) => {
  const { element, transform } = preview;
  if (transform.value || transform.priority) {
    element.style.setProperty("transform", transform.value, transform.priority);
  } else {
    element.style.removeProperty("transform");
  }
};

const isEditable = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
};

export const arrangePlugin = (): MesurerPlugin => defineMesurerPlugin({
  id: MESURER_ARRANGE_PLUGIN_ID,
  version: "0.1.0",
  requires: [RUNTIME_SERVICE_ID],
  provides: ["tool:arrange", "intent:arrange", "agent:arrange"],
  setup(ctx) {
    const runtime = ctx.service.get<MesurerSolidRuntimeService>(RUNTIME_SERVICE_ID);
    if (!runtime) throw new Error("Arrange plugin requires the Solid renderer runtime.");

    const { ownerDocument, ownerWindow } = runtime;
    const workspace = runtime.createWorkspaceRuntime();
    const inspectorMount = runtime.createInspectorMount();
    const pageTarget = runtime.pageTarget ?? ownerDocument.body ?? ownerDocument.documentElement;
    // SAFETY: ownerWindow is the browsing-context global for ownerDocument and owns these DOM constructors.
    const realm = ownerWindow as Window & typeof globalThis;

    ctx.state.register<ArrangeStateValue>({
      id: MESURER_ARRANGE_STATE_ID,
      initial: { intents: [] },
      history: true,
      persist: true,
    });
    ctx.state.register<boolean>({
      id: MESURER_ARRANGE_ACTIVE_STATE_ID,
      initial: false,
    });

    const root = inspectorMount.element;
    root.dataset.mesurerArrange = "true";
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.zIndex = "84";
    root.style.pointerEvents = "none";

    const box = ownerDocument.createElement("div");
    box.dataset.mesurerArrangeBox = "true";
    box.setAttribute("role", "application");
    box.setAttribute("aria-label", "Arrange selected elements");
    box.style.position = "fixed";
    box.style.display = "none";
    box.style.boxSizing = "border-box";
    box.style.border = "1px solid #0d99ff";
    box.style.cursor = "grab";
    box.style.pointerEvents = "auto";
    box.style.touchAction = "none";
    box.style.userSelect = "none";
    root.append(box);

    const previews = new Map<HTMLElement, AppliedPreview>();
    let presentation: PresentationState = { intentId: null, state: "desired" };
    let drag: DragState | null = null;
    let pendingIntent: ArrangeIntentValue | null = null;
    let disposed = false;
    let refreshFrame = 0;
    let observer: MutationObserver | null = null;

    const state = () => ctx.state.get<ArrangeStateValue>(MESURER_ARRANGE_STATE_ID) ?? { intents: [] };
    const active = () => ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;
    const currentPage = () => pageUrl(ownerWindow);
    const currentIntents = () => state().intents.filter((intent) => intent.pageUrl === currentPage());

    const isMesurerUi = (element: HTMLElement) => Boolean(
      element.closest("[data-mesurer-island='true'], [data-mesurer-inspector-ui='true'], [data-mesurer-root='true']"),
    );
    const isPageElement = (element: HTMLElement) =>
      isElementWithinDomTarget(element, pageTarget) && !isMesurerUi(element);

    const queryCandidates = (selector: string): HTMLElement[] => {
      const matches: HTMLElement[] = [];
      if (pageTarget instanceof realm.HTMLElement && pageTarget.matches(selector) && !isMesurerUi(pageTarget)) {
        matches.push(pageTarget);
      }
      for (const candidate of pageTarget.querySelectorAll(selector)) {
        if (candidate instanceof realm.HTMLElement && isPageElement(candidate)) matches.push(candidate);
      }
      return matches;
    };

    const resolveTarget = (target: ArrangeTargetValue) => {
      const fingerprint = fingerprintFromValue(target);
      if (!isElementFingerprintRebindable(fingerprint)) return null;
      let selectorMatches: HTMLElement[] = [];
      try {
        selectorMatches = queryCandidates(target.selector)
          .filter((candidate) => isElementFingerprintCompatible(candidate, fingerprint));
      } catch {
        return null;
      }
      if (selectorMatches.length !== 1) return null;

      if (!fingerprint.id && !fingerprint.testId) {
        let fingerprintMatches: HTMLElement[] = [];
        try {
          fingerprintMatches = queryCandidates(fingerprint.tag)
            .filter((candidate) => isElementFingerprintCompatible(candidate, fingerprint));
        } catch {
          return null;
        }
        if (fingerprintMatches.length !== 1 || fingerprintMatches[0] !== selectorMatches[0]) return null;
      }
      return selectorMatches[0] ?? null;
    };

    const clearPreviewStyles = () => {
      for (const preview of previews.values()) restoreTransform(preview);
      previews.clear();
    };

    const presentationIntents = () => {
      const intents = currentIntents();
      if (presentation.state === "live") return [];
      if (!presentation.intentId) return intents;
      const index = intents.findIndex((intent) => intent.id === presentation.intentId);
      if (index < 0) return intents;
      return intents.slice(0, presentation.state === "before" ? index : index + 1);
    };

    const effectiveOffsets = (intents = presentationIntents()) => {
      const offsets = new Map<HTMLElement, ArrangeOffset>();
      for (const intent of intents) {
        for (const target of intent.targets) {
          const element = resolveTarget(target);
          if (!element) continue;
          offsets.set(element, { x: target.desiredOffsetX, y: target.desiredOffsetY });
        }
      }
      return offsets;
    };

    const applyOffsets = (offsets: Map<HTMLElement, ArrangeOffset>) => {
      clearPreviewStyles();
      for (const [element, offset] of offsets) {
        if (!element.isConnected || !isPageElement(element)) continue;
        if (offset.x === 0 && offset.y === 0) continue;
        const transform = {
          value: element.style.getPropertyValue("transform"),
          priority: element.style.getPropertyPriority("transform"),
        };
        const computed = ownerWindow.getComputedStyle(element).transform;
        const base = computed && computed !== "none" ? ` ${computed}` : "";
        element.style.setProperty(
          "transform",
          `translate3d(${offset.x}px, ${offset.y}px, 0)${base}`,
          "important",
        );
        previews.set(element, { element, transform });
      }
    };

    const applyPresentation = () => applyOffsets(effectiveOffsets());

    const withPreviewsSuspended = <T>(operation: () => T): T => {
      clearPreviewStyles();
      try {
        return operation();
      } finally {
        if (!disposed && !drag) applyPresentation();
      }
    };

    const selectedElements = () => workspace.currentSelection().elements
      .filter((element) => element.isConnected && isPageElement(element));

    const selectionRect = () => unionRects(selectedElements().map((element) => getRectFromDom(element)));

    const renderBox = (override?: ArrangeRect | null) => {
      if (!active()) {
        box.style.display = "none";
        return;
      }
      const value = override === undefined ? selectionRect() : override;
      if (!value) {
        box.style.display = "none";
        return;
      }
      box.style.display = "block";
      box.style.left = `${value.left}px`;
      box.style.top = `${value.top}px`;
      box.style.width = `${value.width}px`;
      box.style.height = `${value.height}px`;
    };

    const refresh = () => {
      if (disposed || drag) return;
      applyPresentation();
      renderBox();
    };

    const scheduleRefresh = () => {
      if (refreshFrame || disposed) return;
      refreshFrame = ownerWindow.requestAnimationFrame(() => {
        refreshFrame = 0;
        refresh();
      });
    };

    const beginDrag = (event: PointerEvent) => {
      if (!active() || event.button !== 0) return;
      const elements = selectedElements();
      if (!elements.length) return;
      event.preventDefault();
      event.stopPropagation();

      const offsets = effectiveOffsets(currentIntents());
      clearPreviewStyles();
      const targets = elements.map((element, index): DragTarget => {
        const natural = getRectFromDom(element);
        const beforeOffset = offsets.get(element) ?? { x: 0, y: 0 };
        const before = addOffset(natural, beforeOffset);
        const fingerprint = getElementFingerprint(element);
        return {
          element,
          target: {
            id: `target-${index + 1}`,
            selector: getElementSelector(element),
            fingerprintTag: fingerprint.tag,
            fingerprintId: fingerprint.id,
            fingerprintTestId: fingerprint.testId,
            fingerprintRole: fingerprint.role,
            fingerprintAriaLabel: fingerprint.ariaLabel,
            fingerprintClasses: [...fingerprint.classes],
            fingerprintText: fingerprint.text,
            beforeLeft: before.left,
            beforeTop: before.top,
            beforeWidth: before.width,
            beforeHeight: before.height,
            desiredLeft: before.left,
            desiredTop: before.top,
            desiredWidth: before.width,
            desiredHeight: before.height,
            beforeOffsetX: beforeOffset.x,
            beforeOffsetY: beforeOffset.y,
            desiredOffsetX: beforeOffset.x,
            desiredOffsetY: beforeOffset.y,
          },
        };
      });
      applyPresentation();
      drag = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        targets,
        dx: 0,
        dy: 0,
      };
      box.style.cursor = "grabbing";
      box.setPointerCapture?.(event.pointerId);
    };

    const updateDrag = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      let dx = event.clientX - drag.originX;
      let dy = event.clientY - drag.originY;
      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      drag.dx = dx;
      drag.dy = dy;

      const offsets = effectiveOffsets(currentIntents());
      for (const item of drag.targets) {
        offsets.set(item.element, {
          x: item.target.beforeOffsetX + dx,
          y: item.target.beforeOffsetY + dy,
        });
      }
      applyOffsets(offsets);
      const beforeGroup = unionRects(drag.targets.map((item) => ({
        left: item.target.beforeLeft,
        top: item.target.beforeTop,
        width: item.target.beforeWidth,
        height: item.target.beforeHeight,
      })));
      renderBox(beforeGroup ? addOffset(beforeGroup, { x: dx, y: dy }) : null);
    };

    const cancelDrag = () => {
      if (!drag) return;
      const pointerId = drag.pointerId;
      drag = null;
      if (box.hasPointerCapture?.(pointerId)) box.releasePointerCapture(pointerId);
      box.style.cursor = "grab";
      applyPresentation();
      renderBox();
    };

    const finishDrag = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const completed = drag;
      drag = null;
      if (box.hasPointerCapture?.(event.pointerId)) box.releasePointerCapture(event.pointerId);
      box.style.cursor = "grab";

      if (completed.dx === 0 && completed.dy === 0) {
        applyPresentation();
        renderBox();
        return;
      }

      pendingIntent = {
        id: randomId(ownerWindow, "arrange"),
        createdAt: Date.now(),
        pageUrl: currentPage(),
        targets: completed.targets.map(({ target }) => ({
          ...target,
          desiredLeft: target.beforeLeft + completed.dx,
          desiredTop: target.beforeTop + completed.dy,
          desiredOffsetX: target.beforeOffsetX + completed.dx,
          desiredOffsetY: target.beforeOffsetY + completed.dy,
        })),
      };
      void ctx.command.execute(COMMIT_COMMAND).catch(() => {
        pendingIntent = null;
        applyPresentation();
        renderBox();
      });
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      cancelDrag();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (!active() && !drag)) return;
      if (isEditable(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (drag) cancelDrag();
      else ctx.state.update<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID, () => false);
    };

    box.addEventListener("pointerdown", beginDrag);
    box.addEventListener("pointermove", updateDrag);
    box.addEventListener("pointerup", finishDrag);
    box.addEventListener("pointercancel", onPointerCancel);
    ownerWindow.addEventListener("keydown", onKeyDown, true);
    ownerWindow.addEventListener("resize", scheduleRefresh);
    ownerWindow.addEventListener("scroll", scheduleRefresh, true);
    pageTarget.addEventListener("scroll", scheduleRefresh, true);

    observer = new realm.MutationObserver(scheduleRefresh);
    observer.observe(pageTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["id", "class", "data-testid", "role", "aria-label"],
    });

    const workspaceUnsubscribe = workspace.subscribe(scheduleRefresh);
    const stateSubscription = ctx.state.subscribe(scheduleRefresh);

    const findIntent = (id: string) => state().intents.find((intent) => intent.id === id) ?? null;

    const focusRect = (intent: ArrangeIntentValue, stateValue: ArrangePresentation) => {
      let value: ArrangeRect | null = null;
      if (stateValue === "before") {
        value = unionRects(intent.targets.map((target) => ({
          left: target.beforeLeft,
          top: target.beforeTop,
          width: target.beforeWidth,
          height: target.beforeHeight,
        })));
      } else if (stateValue === "desired") {
        value = unionRects(intent.targets.map((target) => ({
          left: target.desiredLeft,
          top: target.desiredTop,
          width: target.desiredWidth,
          height: target.desiredHeight,
        })));
      } else {
        value = withPreviewsSuspended(() => unionRects(intent.targets
          .map((target) => resolveTarget(target))
          .filter((element): element is HTMLElement => element !== null)
          .map((element) => getRectFromDom(element))));
      }
      if (!value) throw new Error(`Arrange intent has no resolvable capture region: ${intent.id}`);
      const left = Math.max(0, value.left - CAPTURE_PADDING);
      const top = Math.max(0, value.top - CAPTURE_PADDING);
      const right = Math.min(ownerWindow.innerWidth, value.left + value.width + CAPTURE_PADDING);
      const bottom = Math.min(ownerWindow.innerHeight, value.top + value.height + CAPTURE_PADDING);
      return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    };

    const review = (id: string, tolerance = DEFAULT_REVIEW_TOLERANCE): ArrangeReview => {
      const intent = findIntent(id);
      if (!intent) throw new Error(`Arrange intent not found: ${id}`);
      const targets = withPreviewsSuspended(() => intent.targets.map((target): ArrangeReviewTarget => {
        const element = resolveTarget(target);
        const desired = {
          left: target.desiredLeft,
          top: target.desiredTop,
          width: target.desiredWidth,
          height: target.desiredHeight,
        };
        if (!element) {
          return {
            targetId: target.id,
            selector: target.selector,
            desired,
            current: null,
            delta: null,
            matched: false,
          };
        }
        const current = getRectFromDom(element);
        const delta = deltaRect(current, desired);
        const matched = Math.abs(delta.left) <= tolerance
          && Math.abs(delta.top) <= tolerance
          && Math.abs(delta.width) <= tolerance
          && Math.abs(delta.height) <= tolerance;
        return { targetId: target.id, selector: target.selector, desired, current, delta, matched };
      }));
      const resolved = targets.filter((target) => target.current !== null).length;
      const targetStatus = resolved === 0 ? "stale" as const
        : resolved === targets.length ? "connected" as const : "partial" as const;
      return {
        schema: "mesurer.arrange-review/v1",
        arrangeId: intent.id,
        targetStatus,
        tolerance,
        matched: targets.length > 0 && targets.every((target) => target.matched),
        targets,
      };
    };

    const service: MesurerArrangeService = {
      active,
      intents: () => state().intents.map(publicIntent),
      intent(id) {
        const intent = findIntent(id);
        return intent ? publicIntent(intent) : null;
      },
      show(id, stateValue) {
        const intent = findIntent(id);
        if (!intent) throw new Error(`Arrange intent not found: ${id}`);
        presentation = { intentId: id, state: stateValue };
        refresh();
      },
      showCurrent() {
        presentation = { intentId: null, state: "desired" };
        refresh();
      },
      capturePlan(id, stateValue) {
        const intent = findIntent(id);
        if (!intent) throw new Error(`Arrange intent not found: ${id}`);
        return {
          schema: "mesurer.arrange-capture/v1",
          arrangeId: id,
          state: stateValue,
          chrome: "hide",
          captures: [
            { id: "viewport", kind: "viewport" },
            { id: "focus", kind: "clip", rect: focusRect(intent, stateValue) },
          ],
        };
      },
      review,
      clear: () => ctx.command.execute(CLEAR_COMMAND),
    };

    ctx.tool.register({
      id: "arrange",
      label: "Arrange",
      order: 65,
      command: TOGGLE_COMMAND,
      icon: moveIcon,
      active,
      disabled: () => selectedElements().length === 0,
    });
    ctx.command.register(TOGGLE_COMMAND, () => {
      const next = !active();
      ctx.state.update<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID, () => next);
      if (!next && drag) cancelDrag();
      renderBox();
    });
    ctx.command.register(COMMIT_COMMAND, () => {
      const intent = pendingIntent;
      pendingIntent = null;
      if (!intent) return;
      ctx.state.update<ArrangeStateValue>(MESURER_ARRANGE_STATE_ID, (current) => ({
        intents: [...current.intents, intent].slice(-MAX_INTENTS),
      }));
      presentation = { intentId: null, state: "desired" };
    });
    ctx.command.register(CLEAR_COMMAND, () => {
      ctx.state.update<ArrangeStateValue>(MESURER_ARRANGE_STATE_ID, () => ({ intents: [] }));
      presentation = { intentId: null, state: "desired" };
    });
    ctx.service.provide(MESURER_ARRANGE_SERVICE_ID, service);

    applyPresentation();
    renderBox();

    ctx.lifecycle.onDispose(() => {
      disposed = true;
      if (refreshFrame) ownerWindow.cancelAnimationFrame(refreshFrame);
      observer?.disconnect();
      observer = null;
      box.removeEventListener("pointerdown", beginDrag);
      box.removeEventListener("pointermove", updateDrag);
      box.removeEventListener("pointerup", finishDrag);
      box.removeEventListener("pointercancel", onPointerCancel);
      ownerWindow.removeEventListener("keydown", onKeyDown, true);
      ownerWindow.removeEventListener("resize", scheduleRefresh);
      ownerWindow.removeEventListener("scroll", scheduleRefresh, true);
      pageTarget.removeEventListener("scroll", scheduleRefresh, true);
      workspaceUnsubscribe();
      stateSubscription.dispose();
      clearPreviewStyles();
      workspace.dispose();
      inspectorMount.dispose();
    });
  },
});
