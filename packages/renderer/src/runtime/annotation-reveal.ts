import type { MesurerAnnotation, MesurerAnnotationTarget } from "@jhomra21/mesurer-solid-core";
import type { MesurerWorkspaceRuntime } from "./workspace-context";
import { getMesurerPageKey } from "./page-location";
import { getAccessibleFrameDocument } from "../core/frame-geometry";

export type ResponsiveAnnotationRevealRequest = {
  requestId: number;
  signal: AbortSignal;
  viewport: NonNullable<MesurerAnnotationTarget["viewport"]>;
};

export type ResponsiveAnnotationRevealOutcome =
  | { status: "ready"; previewId: string }
  | { status: "ambiguous" | "refused" | "cancelled" };

export type ResponsiveAnnotationRevealController = {
  ensureViewport(request: ResponsiveAnnotationRevealRequest): Promise<ResponsiveAnnotationRevealOutcome>;
};

export type AnnotationRevealResult =
  | { status: "revealed" }
  | { status: "missing" | "ambiguous" | "refused" | "cancelled"; message: string };

const controllers = new WeakMap<HTMLElement, ResponsiveAnnotationRevealController>();

const waiters = new WeakMap<HTMLElement, Set<(controller: ResponsiveAnnotationRevealController | null) => void>>();

let nextRevealRequestId = 0;

export function registerResponsiveAnnotationRevealController(
  root: HTMLElement,
  controller: ResponsiveAnnotationRevealController,
) {
  controllers.set(root, controller);

  for (const resolve of waiters.get(root) ?? []) resolve(controller);
  waiters.delete(root);

  return () => {
    if (controllers.get(root) === controller) controllers.delete(root);

    for (const resolve of waiters.get(root) ?? []) resolve(null);
    waiters.delete(root);
  };
}

const nextFrame = (win: Window) => new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));

const waitForStage = (root: HTMLElement, win: Window, requestId: number, signal: AbortSignal, isCurrent: () => boolean) =>
  new Promise<ResponsiveAnnotationRevealController | null>((resolve) => {
    const current = controllers.get(root);

    if (current) {
      resolve(current);

      return;
    }

    if (!isCurrent()) {
      resolve(null);

      return;
    }

    const pending = waiters.get(root) ?? new Set<(controller: ResponsiveAnnotationRevealController | null) => void>();
    let timeout = 0;

    const finish = (controller: ResponsiveAnnotationRevealController | null) => {
      win.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      pending.delete(finish);
      resolve(isCurrent() && requestId > 0 ? controller : null);
    };

    const onAbort = () => finish(null);
    pending.add(finish);
    waiters.set(root, pending);
    signal.addEventListener("abort", onAbort, { once: true });
    timeout = win.setTimeout(() => finish(null), 5000);
  });

const exactViewport = (
  targets: MesurerAnnotationTarget[],
) => {
  const viewports = targets.map((target) => target.viewport);

  if (!viewports.length || viewports.some((viewport) => !viewport)) return null;
  const first = viewports[0]!;

  return viewports.every((viewport) => viewport!.url === first.url
    && viewport!.width === first.width && viewport!.height === first.height)
    ? first
    : null;
};

type OuterScrollSnapshot = { elements: { element: HTMLElement; left: number; top: number }[]; x: number; y: number };

const snapshotOuterScroll = (frame: HTMLIFrameElement, win: Window): OuterScrollSnapshot => {
  const elements: OuterScrollSnapshot["elements"] = [];
  let node: Node | null = frame.parentNode;
  const seen = new Set<Node>();

  while (node && !seen.has(node)) {
    seen.add(node);

    if (node instanceof HTMLElement) {
      const element = node;
      elements.push({ element, left: element.scrollLeft, top: element.scrollTop });
    }

    node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
  }

  return { elements, x: win.scrollX, y: win.scrollY };
};

const restoreOuterScroll = (
  snapshot: OuterScrollSnapshot,
  win: Window,
  frame: HTMLIFrameElement,
) => {
  const row = frame.closest<HTMLElement>("[data-mesurer-responsive-row]");

  for (const { element, left, top } of snapshot.elements) {
    if (!element.isConnected) continue;
    element.scrollTo({ left: element === row ? element.scrollLeft : left, top, behavior: "instant" });
  }

  if (row) {
    const rowRect = row.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();

    if (frameRect.left < rowRect.left || frameRect.right > rowRect.right) {
      row.scrollTo({
        left: row.scrollLeft + frameRect.left + frameRect.width / 2 - (rowRect.left + rowRect.width / 2),
        behavior: "instant",
      });
    }
  }

  win.scrollTo({ left: snapshot.x, top: snapshot.y, behavior: "instant" });
};

const belongsToPreview = (target: Element, preview: HTMLIFrameElement) => {
  const previewDocument = getAccessibleFrameDocument(preview);

  if (!previewDocument) return false;
  let document = target.ownerDocument;
  const seen = new Set<Document>();

  while (document !== previewDocument && !seen.has(document)) {
    seen.add(document);
    let frame: Element | null = null;

    try {
      frame = document.defaultView?.frameElement ?? null;
    } catch {
      return false;
    }

    if (!frame) return false;
    document = frame.ownerDocument;
  }

  return document === previewDocument;
};

export function createAnnotationRevealCoordinator(options: {
  root: HTMLElement;
  ownerWindow: Window;
  runtime: MesurerWorkspaceRuntime;
  responsiveEnabled(): boolean;
  responsiveOpen(): boolean;
  openResponsive(): Promise<void>;
  closeResponsive(): Promise<void>;
}) {
  let latestRequest = 0;
  const cancellations = new Set<() => void>();
  const abortControllers = new Set<AbortController>();

  const cancel = () => {
    latestRequest = ++nextRevealRequestId;

    for (const controller of abortControllers) controller.abort();
    abortControllers.clear();

    for (const cancelRequest of cancellations) cancelRequest();
  };

  const waitForResolvedTarget = (
    annotationId: string,
    isCurrent: () => boolean,
  ) => new Promise<Element | null>((resolve) => {
    const finish = (element: Element | null) => {
      unsubscribe();
      options.ownerWindow.clearTimeout(timeout);
      cancellations.delete(cancel);
      resolve(element);
    };

    const check = () => {
      if (!isCurrent()) {
        finish(null);

        return;
      }

      const target = options.runtime.annotation(annotationId)
        ?.resolvedTargets.find(({ element }) => element?.isConnected)?.element;

      if (target) finish(target);
    };

    const unsubscribe = options.runtime.subscribe(check);
    const cancel = () => finish(null);
    cancellations.add(cancel);
    const timeout = options.ownerWindow.setTimeout(() => finish(null), 5000);
    check();
  });

  const reveal = async (annotation: MesurerAnnotation): Promise<AnnotationRevealResult> => {
    const requestId = ++nextRevealRequestId;
    const abortController = new AbortController();
    abortControllers.add(abortController);
    latestRequest = requestId;
    const annotationPageKey = getMesurerPageKey(options.ownerWindow);

    const current = () => requestId === latestRequest
      && getMesurerPageKey(options.ownerWindow) === annotationPageKey;

    const targets = annotation.anchor.kind === "elements" ? annotation.anchor.targets : [];
    const viewport = exactViewport(targets);
    let selectedPreviewId: string | null = null;

    let stageWasOpen = false;

    const stageObserver = new MutationObserver(() => {
      if (options.responsiveOpen()) {
        stageWasOpen = true;
      } else if (viewport && stageWasOpen && current()) {
        cancel();
      }
    });

    if (viewport) stageObserver.observe(options.root, { childList: true, subtree: true });

    try {
    if (annotation.anchor.kind === "elements" && targets.some((target) => target.viewport) && !viewport) {
      return { status: "ambiguous", message: "This note spans more than one saved preview." };
    }

    if (viewport) {
      if (viewport.url !== options.ownerWindow.location.href.split("#")[0]) {
        return { status: "refused", message: "This note belongs to a different page URL." };
      }

      if (!options.responsiveEnabled()) {
        return { status: "refused", message: "Enable Responsive to view this note." };
      }

      if (!options.responsiveOpen()) {
        await options.openResponsive();

        if (!current()) return { status: "cancelled", message: "Reveal cancelled." };
      }

      const controller = await waitForStage(options.root, options.ownerWindow, requestId, abortController.signal, current);

      if (!controller || !current()) return { status: "cancelled", message: "Reveal cancelled." };
      const ensured = await controller.ensureViewport({ requestId, viewport, signal: abortController.signal });

      if (ensured.status === "ambiguous") return { status: "ambiguous", message: "More than one matching preview is open." };

      if (ensured.status !== "ready") {
        return ensured.status === "cancelled"
          ? { status: "cancelled", message: "Reveal cancelled." }
          : { status: "refused", message: "This preview could not be opened." };
      }

      selectedPreviewId = ensured.previewId;
    } else if (options.responsiveOpen()) {
      await options.closeResponsive();

      if (!current()) return { status: "cancelled", message: "Reveal cancelled." };
      await nextFrame(options.ownerWindow);
    }

    if (!current()) return { status: "cancelled", message: "Reveal cancelled." };

    const target = annotation.anchor.kind === "region"
      ? null
      : await waitForResolvedTarget(annotation.id, current);

    if (!current()) return { status: "cancelled", message: "Reveal cancelled." };

    if (target) {
      const selectedFrame = viewport
        ? [...options.root.querySelectorAll<HTMLIFrameElement>("iframe[data-mesurer-responsive-frame]")]
          .find((candidate) => candidate.getAttribute("data-mesurer-responsive-preview-id") === selectedPreviewId)
        : null;

      if (viewport && (!selectedFrame || !belongsToPreview(target, selectedFrame))) {
        return { status: "missing", message: "The saved target is not in the selected preview." };
      }

      const scrollSnapshot = viewport && selectedFrame
        ? snapshotOuterScroll(selectedFrame, options.ownerWindow)
        : null;

      let currentTarget: Element | null = target;

      while (currentTarget && current()) {
        currentTarget.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });

        if (!viewport || currentTarget.ownerDocument === selectedFrame?.contentDocument) break;

        let frame: Element | null = null;

        try { frame = currentTarget.ownerDocument.defaultView?.frameElement ?? null; } catch { /* Inaccessible frame boundary. */ }

        currentTarget = frame;
      }

      if (!current()) return { status: "cancelled", message: "Reveal cancelled." };

      if (scrollSnapshot) restoreOuterScroll(scrollSnapshot, options.ownerWindow, selectedFrame!);

      return { status: "revealed" };
    }

    if (annotation.anchor.kind === "region") {
      const rect = annotation.anchor.rect;
      options.ownerWindow.scrollBy({
        left: rect.left + rect.width / 2 - options.ownerWindow.innerWidth / 2,
        top: rect.top + rect.height / 2 - options.ownerWindow.innerHeight / 2,
        behavior: "instant",
      });

      return { status: "revealed" };
    }

    return { status: "missing", message: "The saved target is not currently available." };
    } finally {
      stageObserver.disconnect();
      abortControllers.delete(abortController);
    }
  };

  return {
    reveal,
    cancel,
    dispose() {
      cancel();
    },
  };
}
