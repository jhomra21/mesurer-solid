import {
  getMotionAnimations,
  hasTransientScriptMotion,
  motionCssProperty,
  OBSERVED_MOTION_PROPERTIES,
} from "./motion";
import {
  createMotionDependencies,
  cssVariables,
} from "./motion-dependencies";

export { OBSERVED_MOTION_PROPERTIES } from "./motion";

export type ObservedMotionTarget = {
  element: Element;
  properties: string[];
};

type ObservedElementState = {
  values: string[];
  inputs: string[];
  declarations: string[];
  nativeInputs: Set<string>;
  covered: Set<string>;
};

const knownMotion = new WeakMap<Element, ObservedMotionTarget[]>();

const isKeyframeEffect = (effect: AnimationEffect | null): effect is KeyframeEffect =>
  Boolean(effect && "getKeyframes" in effect && "target" in effect);

const animationName = (animation: Animation) =>
  "animationName" in animation
    ? String(animation.animationName ?? "")
    : "";

const shadowHost = (element: Element) => {
  const root = element.getRootNode();

  if (!("host" in root)) return null;

  const host = root.host;

  return host instanceof Element ? host : null;
};

const inlineStyleFor = (element: Element) => {
  if (!("style" in element)) return null;

  // SAFETY: checking for the style property narrows to DOM elements exposing CSSStyleDeclaration.
  return element.style as CSSStyleDeclaration;
};

const mutationObserverFor = (view: Window) => {
  // SAFETY: a Window owns the DOM constructor globals used by nodes in that window.
  return (view as Window & typeof globalThis).MutationObserver;
};

export const readObservedMotion = (
  element: Element,
): ObservedMotionTarget[] => {
  const cached = knownMotion
    .get(element)
    ?.filter((target) => target.element.isConnected);

  if (cached?.length) return cached;

  return hasTransientScriptMotion(element)
    ? [{ element, properties: ["animation"] }]
    : [];
};

export function motionElements(root: Element, limit = 128) {
  const elements = [root];

  for (
    let index = 0;
    index < elements.length && elements.length < limit;
    index += 1
  ) {
    const element = elements[index];

    if (!element) continue;

    elements.push(
      ...[
        ...element.children,
        ...(element.shadowRoot?.children ?? []),
      ].slice(0, limit - elements.length),
    );
  }

  return elements;
}

export function observeMotion(
  root: Element,
  view: Window,
  onChange: (targets: ObservedMotionTarget[]) => void,
) {
  let request = 0;
  let lastSample = -Infinity;
  let until = 0;
  let disposed = false;
  let urgent = true;

  const previous = new WeakMap<Element, ObservedElementState>();
  const dependencies = createMotionDependencies(root.ownerDocument);
  const oldStyle = root.ownerDocument.createElement("span").style;
  const initial = readObservedMotion(root);

  if (initial.length) knownMotion.set(root, initial);

  const detected = new Map(
    initial.map((target) => [target.element, new Set(target.properties)]),
  );

  const observers: MutationObserver[] = [];
  const observedRoots = new WeakSet<Node>();
  const MutationObserverConstructor = mutationObserverFor(view);

  const publish = () => {
    if (disposed) return;

    const targets = [...detected].map(([element, properties]) => ({
      element,
      properties: [...properties],
    }));

    knownMotion.set(root, targets);
    onChange(targets);
  };

  const sample = (time: number) => {
    request = 0;

    if (disposed) return;

    if (!root.isConnected) {
      knownMotion.delete(root);

      if (detected.size) {
        detected.clear();
        onChange([]);
      }

      return;
    }

    if (time - lastSample >= 100) {
      lastSample = time;
      dependencies.refresh(time);

      const covered = new Map<Element, Set<string>>();
      const names = new Map<Element, string[]>();
      const animations = getMotionAnimations(root);

      for (const animation of animations) {
        try {
          const effect = animation.effect;

          if (!isKeyframeEffect(effect) || !effect.target) continue;

          const name = animationName(animation);

          if (name) {
            names.set(
              effect.target,
              [...(names.get(effect.target) ?? []), name],
            );
          }

          const properties = covered.get(effect.target) ?? new Set<string>();

          for (const frame of effect.getKeyframes()) {
            for (const property of Object.keys(frame)) {
              properties.add(motionCssProperty(property));
            }
          }

          covered.set(effect.target, properties);
        } catch {
          // Some browser effects do not expose keyframes.
        }
      }

      let changed = false;

      if (hasTransientScriptMotion(root, animations) && !detected.has(root)) {
        detected.set(root, new Set(["animation"]));
        changed = true;
      }

      const elements = motionElements(root);

      for (const element of detected.keys()) {
        if (elements.includes(element)) continue;

        detected.delete(element);
        changed = true;
      }

      for (const element of elements) {
        if (element.shadowRoot) watch(element.shadowRoot);

        try {
          const style = view.getComputedStyle(element);

          const values = OBSERVED_MOTION_PROPERTIES.map((property) =>
            style.getPropertyValue(property));

          const inline = inlineStyleFor(element);

          const authorVariables = dependencies.forElement(
            element,
            [
              style.animationName ?? "",
              ...(names.get(element) ?? []),
            ].join(","),
          );

          const native = new Set(covered.get(element) ?? []);
          const nativeInputs = new Set<string>();

          const declarations = OBSERVED_MOTION_PROPERTIES.map((property) =>
            inline?.getPropertyValue(property) ?? "");

          const inputs = OBSERVED_MOTION_PROPERTIES.map((property) => {
            const declaration = inline?.getPropertyValue(property) ?? "";

            const variables = [
              ...cssVariables(declaration),
              ...(authorVariables.get(property) ?? []),
            ];

            const nativeVariable = variables.length > 0
              && variables.every((variable) => {
                let owner: Element | null = element;

                while (owner) {
                  if (covered.get(owner)?.has(variable)) return true;

                  owner = owner.parentElement ?? shadowHost(owner);
                }

                return false;
              });

            if (nativeVariable) {
              native.add(property);
              nativeInputs.add(property);
            }

            return JSON.stringify([
              declaration,
              ...variables.map((variable) =>
                style.getPropertyValue(variable)),
            ]);
          });

          const before = previous.get(element);
          const properties = detected.get(element) ?? new Set<string>();

          if (before) {
            OBSERVED_MOTION_PROPERTIES.forEach((property, index) => {
              const inputChanged = declarations[index] !== before.declarations[index]
                || (
                  inputs[index] !== before.inputs[index]
                  && !nativeInputs.has(property)
                  && !before.nativeInputs.has(property)
                );

              const uncoveredChange = values[index] !== before.values[index]
                && !native.has(property)
                && !before.covered.has(property);

              if (
                (inputChanged || uncoveredChange)
                && !properties.has(property)
              ) {
                properties.add(property);
                detected.set(element, properties);
                changed = true;
              }
            });
          }

          previous.set(element, {
            values,
            inputs,
            declarations,
            nativeInputs,
            covered: native,
          });
        } catch {
          // A disappearing or foreign element must not break inspection.
        }
      }

      if (changed) publish();
    }

    if (time < until) request = view.requestAnimationFrame(sample);
  };

  const wake = () => {
    if (disposed) return;

    if (view.performance.now() > until) urgent = true;

    until = view.performance.now() + 1500;

    if (!request) request = view.requestAnimationFrame(sample);
  };

  const watch = (node: Node, subtree = true) => {
    if (!MutationObserverConstructor || observedRoots.has(node)) return;

    try {
      const observer = new MutationObserverConstructor((records = []) => {
        if (
          records.some((record) =>
            record.type === "attributes"
            && record.attributeName === "class")
        ) {
          dependencies.invalidate();
        }

        if (
          records.some((record) =>
            record.type === "childList"
            || record.type === "characterData")
        ) {
          const properties = detected.get(root) ?? new Set<string>();

          if (!properties.has("content")) {
            properties.add("content");
            detected.set(root, properties);
            publish();
          }
        }

        const opaqueVariableWrite = dependencies.hasOpaqueStyles(root)
          && records.some((record) => {
            if (
              record.type !== "attributes"
              || record.attributeName !== "style"
              || !(record.target instanceof Element)
            ) {
              return false;
            }

            const current = inlineStyleFor(record.target);

            if (!current) return false;

            if (!oldStyle) {
              return /(^|;)\s*--/.test(
                `${record.oldValue ?? ""};${current.cssText}`,
              );
            }

            oldStyle.cssText = record.oldValue ?? "";

            return [...new Set([...current, ...oldStyle])].some((property) =>
              property.startsWith("--")
              && current.getPropertyValue(property)
                !== oldStyle.getPropertyValue(property));
          });

        if (opaqueVariableWrite) {
          const properties = detected.get(root) ?? new Set<string>();

          if (!properties.has("style")) {
            properties.add("style");
            detected.set(root, properties);
            publish();
          }
        }

        if (
          urgent
          && records.some((record) =>
            record.type === "attributes"
            && record.attributeName === "style")
        ) {
          urgent = false;
          view.cancelAnimationFrame(request);
          lastSample = -Infinity;
          sample(view.performance.now());
        }

        wake();
      });

      observer.observe(node, {
        subtree,
        childList: subtree,
        characterData: subtree,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ["style", "class", "transform", "opacity"],
      });

      observedRoots.add(node);
      observers.push(observer);
    } catch {
      // Detached or unsupported document: sampling still works.
    }
  };

  watch(root);

  let ancestor = root.parentElement ?? shadowHost(root);

  while (ancestor) {
    watch(ancestor, false);
    ancestor = ancestor.parentElement ?? shadowHost(ancestor);
  }

  if (MutationObserverConstructor && root.ownerDocument.head) {
    const observer = new MutationObserverConstructor(() => {
      dependencies.invalidate();
      wake();
    });

    observer.observe(root.ownerDocument.head, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    observers.push(observer);
  }

  sample(view.performance.now());
  wake();

  const stylesheetInterval = view.setInterval(() => {
    if (dependencies.refresh(view.performance.now())) wake();
  }, 1000);

  return () => {
    disposed = true;
    knownMotion.delete(root);

    for (const observer of observers) observer.disconnect();

    view.clearInterval(stylesheetInterval);
    view.cancelAnimationFrame(request);
  };
}
