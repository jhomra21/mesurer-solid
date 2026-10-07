import { createEffect, onCleanup } from "solid-js";
import { getMotionAnimations, motionCssProperty } from "../core/motion";
import { createMotionDependencies, cssVariables } from "../core/motion-dependencies";
import { fitMotionPreview } from "../core/motion-preview";
import { createMotionSnapshot } from "../core/motion-snapshot";
import {
  OBSERVED_MOTION_PROPERTIES,
  type ObservedMotionTarget,
} from "../core/observed-motion";

type PreviewBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type MotionPreviewWakeRef = {
  current: (() => void) | null;
};

const isKeyframeEffect = (effect: AnimationEffect | null): effect is KeyframeEffect =>
  Boolean(effect && "getKeyframes" in effect && "target" in effect);

const inlineStyleFor = (element: Element) => {
  if (!("style" in element)) return null;

  // SAFETY: checking for the style property narrows to DOM elements exposing CSSStyleDeclaration.
  return element.style as CSSStyleDeclaration;
};

const shadowHost = (element: Element) => {
  const root = element.getRootNode();

  if (!("host" in root)) return null;

  const host = root.host;

  return host instanceof Element ? host : null;
};

export function MotionPreview(props: {
  element: Element;
  ownerWindow: Window;
  observedTargets: ObservedMotionTarget[];
  wakeRef?: MotionPreviewWakeRef;
}) {
  let hostElement: HTMLDivElement | undefined;
  let framingElement: Element | null = null;
  let framingBounds: PreviewBounds | null = null;

  createEffect(() => {
    const host = hostElement;
    const element = props.element;
    const ownerWindow = props.ownerWindow;
    const observedTargets = props.observedTargets;
    const wakeRef = props.wakeRef;

    if (!host) return;

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });

    shadow.replaceChildren();

    const snapshot = createMotionSnapshot(element, ownerWindow, shadow);

    if (!snapshot) return;

    const { root: clone } = snapshot;
    const dependencies = createMotionDependencies(element.ownerDocument);
    const oldStyle = host.ownerDocument.createElement("span").style;

    const childrenOf = (source: Element) => {
      if (source.localName === "slot") {
        // SAFETY: localName confirms this element is an HTML slot before assignedNodes is used.
        const assigned = (source as HTMLSlotElement).assignedNodes({ flatten: true });

        if (assigned.length) return assigned;
      }

      return [...(source.shadowRoot?.childNodes ?? source.childNodes)];
    };

    const readPairs = () => snapshot.pairs.map((pair) => {
      dependencies.forElement(pair.source, "");

      const targets = observedTargets.filter((target) => target.element === pair.source);

      const opaque = observedTargets.some((target) =>
        target.properties.includes("style")
        && (
          target.element === element
          || target.element === pair.source
          || target.element.contains(pair.source)
        ));

      const properties = targets
        .flatMap((target) => target.properties)
        .filter((property) => OBSERVED_MOTION_PROPERTIES.includes(property));

      return {
        ...pair,
        properties: new Set<string>(opaque ? OBSERVED_MOTION_PROPERTIES : properties),
        written: new Map<string, string>(),
        sourceText: pair.pseudo
          ? []
          : childrenOf(pair.source).filter((node) => node.nodeType === Node.TEXT_NODE),
        copyText: pair.pseudo
          ? []
          : [...pair.copy.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE),
      };
    });

    let pairs = readPairs();
    let structureDirty = false;

    const frame = host.ownerDocument.createElement("div");

    frame.style.cssText = "position:absolute;transform-origin:top left;pointer-events:none;";
    Object.assign(clone.style, {
      position: "absolute",
      inset: "auto",
      left: "0",
      top: "0",
      margin: "0",
    });

    frame.append(clone);
    shadow.append(frame);

    let request = 0;
    let lastPaint = -Infinity;
    let lastFit = 0;
    let lastSize = -Infinity;
    let needsSize = false;
    let running = false;
    let disposed = false;
    let scale = 1;
    let bounds = framingElement === element ? framingBounds : null;

    const originStyle = ownerWindow.getComputedStyle(element);

    const offsets = {
      left: Number.parseFloat(originStyle.left) || 0,
      top: Number.parseFloat(originStyle.top) || 0,
    };

    let effects: Array<{ source: Element; pseudo: string | null; frames: Keyframe[] }> = [];
    let previousAnimations: Animation[] = [];
    const signatures = new WeakMap<Animation, string>();

    const fit = () => {
      if (!bounds) return;

      framingElement = element;
      framingBounds = bounds;

      const fitted = fitMotionPreview(
        {
          left: bounds.left,
          top: bounds.top,
          width: bounds.right - bounds.left,
          height: bounds.bottom - bounds.top,
        },
        host.clientWidth,
        host.clientHeight,
      );

      scale = fitted.scale;
      frame.style.transform = `translate(${fitted.left}px, ${fitted.top}px) scale(${scale})`;
    };

    const measure = (dynamicOnly = false) => {
      const origin = frame.getBoundingClientRect();

      for (const { copy, pseudo, properties } of pairs) {
        if (pseudo || !copy.isConnected) continue;

        if (dynamicOnly && copy !== clone && !properties.size) continue;

        const rect = copy.getBoundingClientRect();

        if (!rect.width || !rect.height) continue;

        const next = {
          left: (rect.left - origin.left) / scale,
          top: (rect.top - origin.top) / scale,
          right: (rect.right - origin.left) / scale,
          bottom: (rect.bottom - origin.top) / scale,
        };

        bounds = bounds
          ? {
              left: Math.min(bounds.left, next.left),
              top: Math.min(bounds.top, next.top),
              right: Math.max(bounds.right, next.right),
              bottom: Math.max(bounds.bottom, next.bottom),
            }
          : next;
      }
    };

    const size = (sampleEffects = true) => {
      if (!element.isConnected) return;

      const computed = ownerWindow.getComputedStyle(element);

      clone.style.width = frame.style.width = computed.width;
      clone.style.height = frame.style.height = computed.height;
      frame.style.transform = "none";
      scale = 1;

      if (!observedTargets.length) bounds = null;

      let parent = element.parentElement;
      let background = "rgba(0, 0, 0, 0)";

      while (parent && background === "rgba(0, 0, 0, 0)") {
        background = ownerWindow.getComputedStyle(parent).backgroundColor;
        parent = parent.parentElement;
      }

      host.style.background = background;

      const samples: Animation[] = [];

      try {
        measure();

        for (const effect of observedTargets.length || !sampleEffects ? [] : effects) {
          const pair = pairs.find((candidate) =>
            candidate.source === effect.source && candidate.pseudo === effect.pseudo);

          if (!pair || !pair.copy.animate) continue;

          try {
            const sample = pair.copy.animate(effect.frames, {
              duration: 1000,
              fill: "both",
              pseudoElement: effect.pseudo,
            });

            sample.pause();
            samples.push(sample);
          } catch {
            // Unsupported pseudo-element or animation. Keep the inert snapshot.
          }
        }

        for (let step = 0; samples.length && step <= 32; step += 1) {
          for (const sample of samples) sample.currentTime = step * 1000 / 32;
          measure();
        }
      } finally {
        for (const sample of samples) sample.cancel();
      }

      fit();
    };

    const mutationOptions: MutationObserverInit = {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      childList: true,
      characterData: true,
      attributeFilter: ["style", "class", "transform", "opacity"],
    };

    let mutations: MutationObserver | null = null;

    const scan = () => {
      if (disposed) return;

      if (!element.isConnected) {
        running = false;

        return;
      }

      if (dependencies.refresh(ownerWindow.performance.now())) {
        structureDirty = true;
        needsSize = true;
      }

      const animations = getMotionAnimations(element);

      let changed = animations.length !== previousAnimations.length
        || animations.some((animation, index) => animation !== previousAnimations[index]);

      previousAnimations = animations;
      running = observedTargets.length > 0
        || animations.some((animation) => animation.playState === "running");

      effects = [];

      for (const animation of animations) {
        try {
          const effect = animation.effect;

          if (!isKeyframeEffect(effect) || !effect.target) continue;

          const frames = effect.getKeyframes();
          const signature = JSON.stringify(frames);

          if (signatures.get(animation) !== signature) {
            signatures.set(animation, signature);
            changed = true;
          }

          const pair = pairs.find((candidate) =>
            candidate.source === effect.target
            && candidate.pseudo === (effect.pseudoElement ?? null));

          if (!pair) continue;

          for (const frameValue of frames) {
            for (const key of Object.keys(frameValue)) {
              if (["offset", "computedOffset", "easing", "composite"].includes(key)) continue;
              pair.properties.add(motionCssProperty(key));
            }
          }

          if (!frames.length
            && observedTargets.some((target) => target.properties.includes("animation"))) {
            for (const property of OBSERVED_MOTION_PROPERTIES) pair.properties.add(property);
          }

          effects.push({
            source: effect.target,
            pseudo: effect.pseudoElement ?? null,
            frames,
          });
        } catch {
          const effect = animation.effect;

          if (!isKeyframeEffect(effect)) continue;

          for (const pair of pairs) {
            if (pair.source !== effect.target || pair.pseudo !== (effect.pseudoElement ?? null)) continue;

            for (const property of OBSERVED_MOTION_PROPERTIES) pair.properties.add(property);
          }
        }
      }

      if (changed) needsSize = true;
      wake();
    };

    const paint = (time: number) => {
      request = 0;

      if (disposed || !element.isConnected) return;

      if (time - lastPaint >= 1000 / (observedTargets.length ? 60 : 30) - 1) {
        lastPaint = time;

        if (structureDirty) {
          structureDirty = false;
          snapshot.refresh();
          pairs = readPairs();

          for (const pair of pairs) {
            if (pair.source.shadowRoot) mutations?.observe(pair.source.shadowRoot, mutationOptions);
          }

          scan();
          needsSize = true;
        }

        if (needsSize && time - lastSize >= 250) {
          lastSize = time;
          needsSize = false;
          size();
        }

        const textUpdates = pairs.map((pair) => {
          if (pair.pseudo) return [];

          return pair.sourceText.flatMap((node, index) =>
            pair.copyText[index] && pair.copyText[index]!.textContent !== node.textContent
              ? [{ copy: pair.copyText[index]!, text: node.textContent }]
              : []);
        });

        const computedStyles = pairs.map((pair, index) => {
          if (!pair.source.isConnected || (!pair.properties.size && !textUpdates[index]!.length)) {
            return null;
          }

          try {
            return ownerWindow.getComputedStyle(pair.source, pair.pseudo);
          } catch {
            return null;
          }
        });

        const values = pairs.map((pair, index) => {
          const computed = computedStyles[index];

          return computed
            ? [...pair.properties].map((property) =>
                [property, computed.getPropertyValue(property)] as const)
            : [];
        });

        const sizes = computedStyles.map((computed, index) =>
          computed && textUpdates[index]!.length
            ? [computed.width, computed.height]
            : null);

        for (const [index, pair] of pairs.entries()) {
          if (textUpdates[index]!.length) {
            for (const update of textUpdates[index]!) update.copy.textContent = update.text;

            const nextSize = sizes[index];

            if (nextSize) {
              pair.style.width = nextSize[0]!;
              pair.style.height = nextSize[1]!;
            }

            needsSize = true;
          }

          if (!pair.properties.size || !pair.copy.isConnected) continue;

          for (const [property, sourceValue] of values[index]!) {
            if (property === "content" && !pair.pseudo) continue;

            let value = sourceValue;

            if (pair.source === element
              && !pair.pseudo
              && (property === "left" || property === "top")) {
              value = `${(Number.parseFloat(value) || 0) - offsets[property]}px`;
            }

            if (pair.written.get(property) !== value) {
              pair.style.setProperty(property, value);
              pair.written.set(property, value);
            }
          }
        }

        if (observedTargets.length && time - lastFit >= 100) {
          lastFit = time;
          measure(true);
          fit();
        }
      }

      if (running && !request) request = ownerWindow.requestAnimationFrame(paint);
    };

    const wake = () => {
      if (!disposed && !request) request = ownerWindow.requestAnimationFrame(paint);
    };

    if (wakeRef) {
      wakeRef.current = () => {
        lastPaint = -Infinity;
        wake();
      };
    }

    scan();
    size(false);
    needsSize = effects.length > 0 && !observedTargets.length;
    lastSize = ownerWindow.performance.now();

    // SAFETY: ownerWindow owns the DOM constructor globals used by this preview.
    const Resize = (ownerWindow as Window & typeof globalThis).ResizeObserver;

    const resize = Resize ? new Resize(() => {
      needsSize = true;
      wake();
    }) : null;

    resize?.observe(host);
    resize?.observe(element);

    // SAFETY: ownerWindow owns the DOM constructor globals used by this preview.
    const Mutation = (ownerWindow as Window & typeof globalThis).MutationObserver;

    mutations = Mutation ? new Mutation((records) => {
      if (records.some((record) => record.type === "childList")) structureDirty = true;

      for (const record of records) {
        if (record.type !== "attributes" || !(record.target instanceof Element)) continue;

        const source = record.target;

        if (record.attributeName === "class") dependencies.invalidate();

        if (record.attributeName === "style") {
          const sourceStyle = inlineStyleFor(source);

          if (!sourceStyle) continue;

          oldStyle.cssText = record.oldValue ?? "";

          const variables = [...new Set([...sourceStyle, ...oldStyle])]
            .filter((property) =>
              property.startsWith("--")
              && sourceStyle.getPropertyValue(property) !== oldStyle.getPropertyValue(property));

          for (const pair of pairs) {
            const author = variables.length ? dependencies.forElement(pair.source, "") : null;

            const computed = variables.length && dependencies.hasOpaqueStyles(pair.source)
              ? ownerWindow.getComputedStyle(pair.source, pair.pseudo)
              : null;

            for (const property of OBSERVED_MOTION_PROPERTIES) {
              const inline = pair.pseudo
                ? ""
                : inlineStyleFor(pair.source)?.getPropertyValue(property) ?? "";

              const dependsOnVariable = variables.some((variable) =>
                [...cssVariables(inline), ...(author?.get(property) ?? [])].includes(variable));

              const computedChanged = computed
                && computed.getPropertyValue(property)
                  !== (pair.written.get(property) ?? pair.style.getPropertyValue(property));

              if (
                (pair.source === source
                  && !pair.pseudo
                  && inline !== oldStyle.getPropertyValue(property))
                || dependsOnVariable
                || computedChanged
              ) {
                pair.properties.add(property);
              }
            }
          }
        } else if (record.attributeName === "class") {
          for (const pair of pairs) {
            const computed = ownerWindow.getComputedStyle(pair.source, pair.pseudo);

            for (const property of OBSERVED_MOTION_PROPERTIES) {
              if (computed.getPropertyValue(property)
                !== (pair.written.get(property) ?? pair.style.getPropertyValue(property))) {
                pair.properties.add(property);
              }
            }
          }
        } else if (record.attributeName === "transform" || record.attributeName === "opacity") {
          for (const pair of pairs) {
            if (pair.source === source && !pair.pseudo) pair.properties.add(record.attributeName);
          }
        }
      }

      wake();
    }) : null;

    mutations?.observe(element, mutationOptions);

    for (const { source } of pairs) {
      if (source.shadowRoot) mutations?.observe(source.shadowRoot, mutationOptions);
    }

    let ancestor = element.parentElement ?? shadowHost(element);

    while (ancestor) {
      mutations?.observe(ancestor, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ["style", "class"],
      });

      ancestor = ancestor.parentElement ?? shadowHost(ancestor);
    }

    const stylesObserver = Mutation ? new Mutation(() => {
      dependencies.invalidate();
      wake();
    }) : null;

    if (element.ownerDocument.head) {
      stylesObserver?.observe(element.ownerDocument.head, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    }

    const interval = ownerWindow.setInterval(scan, 250);

    onCleanup(() => {
      disposed = true;

      if (wakeRef) wakeRef.current = null;

      resize?.disconnect();
      mutations?.disconnect();
      stylesObserver?.disconnect();
      ownerWindow.clearInterval(interval);
      ownerWindow.cancelAnimationFrame(request);
      snapshot.dispose();
      shadow.replaceChildren();
    });
  });

  return (
    <div
      ref={(element) => { hostElement = element; }}
      data-mesurer-motion-preview="true"
      aria-hidden="true"
      class="msr:pointer-events-none msr:relative msr:h-36 msr:w-full msr:overflow-hidden"
    />
  );
}
