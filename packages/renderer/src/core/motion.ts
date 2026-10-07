export type MotionKind = "animation" | "transition" | "web-animation";

export const OBSERVED_MOTION_PROPERTIES = [
  "transform",
  "translate",
  "rotate",
  "scale",
  "opacity",
  "filter",
  "clip-path",
  "width",
  "height",
  "top",
  "left",
  "content",
];

const controlledAnimations = new WeakSet<Animation>();

export type MotionDetails = {
  kind: MotionKind;
  name: string;
  duration: number;
  delay: number;
  easing: string;
  properties: string[];
  iterationCount: string;
  direction: string;
  fillMode: string;
  animation: Animation | null;
};

const splitList = (value: string) =>
  value.split(/,(?![^()]*\))/).map((part) => part.trim());

const listValue = (values: string[], index: number) =>
  values[index % values.length] ?? "";

const parseTime = (value: string) => {
  const match = value.trim().match(/^(-?[\d.]+)(ms|s)$/i);

  if (!match) return 0;

  const amount = Number.parseFloat(match[1] ?? "0");

  return match[2]?.toLowerCase() === "s" ? amount * 1000 : amount;
};

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

const isKeyframeEffect = (effect: AnimationEffect | null): effect is KeyframeEffect =>
  Boolean(effect && "getKeyframes" in effect && "target" in effect);

const motionKeyframes = (animation: Animation | null) => {
  const effect = animation?.effect ?? null;

  if (!isKeyframeEffect(effect)) return [];

  try {
    return effect.getKeyframes();
  } catch {
    return [];
  }
};

const FRAME_METADATA = new Set([
  "offset",
  "easing",
  "composite",
  "computedOffset",
]);

const animationName = (animation: Animation) =>
  "animationName" in animation ? String(animation.animationName ?? "") : "";

const transitionProperty = (animation: Animation) =>
  "transitionProperty" in animation ? String(animation.transitionProperty ?? "") : "";

const animationKind = (animation: Animation): MotionKind => {
  if ("animationName" in animation) return "animation";

  if ("transitionProperty" in animation) return "transition";

  return "web-animation";
};

export const hasTransientScriptMotion = (
  element: Element,
  animations = getMotionAnimations(element),
) => animations.some((animation) => {
  if (
    controlledAnimations.has(animation)
    || animationName(animation)
    || transitionProperty(animation)
    || animation.playState !== "running"
  ) {
    return false;
  }

  try {
    const timing = animation.effect?.getTiming();
    const iterations = timing?.iterations;

    return Boolean(timing && iterations !== Infinity);
  } catch {
    return false;
  }
});

export const motionCssProperty = (property: string) =>
  property.startsWith("--")
    ? property
    : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const keyframeProperties = (animation: Animation | null) =>
  unique(
    motionKeyframes(animation)
      .flatMap((frame) => Object.keys(frame))
      .filter((property) => !FRAME_METADATA.has(property)),
  );

export const readMotionKeyframes = (
  animation: Animation | null,
  easing?: string,
) => motionKeyframes(animation).map((frame) => {
  const declarations = Object.entries(frame)
    .filter(([property]) => !FRAME_METADATA.has(property))
    .map(([property, value]) => `${motionCssProperty(property)}: ${value};`);

  if (frame.easing && frame.easing !== "linear") {
    declarations.push(`animation-timing-function: ${frame.easing};`);
  }

  if (
    frame.composite
    && frame.composite !== "auto"
    && frame.composite !== "replace"
  ) {
    declarations.push(`animation-composition: ${frame.composite};`);
  }

  return {
    offset: `${Math.round(Number(frame.computedOffset ?? frame.offset ?? 0) * 10000) / 100}%`,
    value: declarations.join(" "),
    displayValue: declarations
      .filter((declaration) =>
        declaration !== `animation-timing-function: ${easing};`)
      .map((declaration) =>
        declaration
          .slice(0, -1)
          .replace(/^animation-timing-function:/, "easing:")
          .replace(/^animation-composition:/, "composition:"))
      .join("\n"),
  };
});

export const getMotionAnimations = (element: Element) => {
  const read = (target: Element) => {
    try {
      return target.getAnimations({ subtree: true });
    } catch {
      try {
        return target.getAnimations();
      } catch {
        return [];
      }
    }
  };

  const animations = new Set(read(element));
  const nodes = [element];

  for (let index = 0; index < nodes.length && index < 128; index += 1) {
    const node = nodes[index];

    if (!node) continue;

    const shadowChildren = [...(node.shadowRoot?.children ?? [])];

    for (const child of shadowChildren) {
      for (const animation of read(child)) animations.add(animation);
    }

    nodes.push(
      ...[...node.children, ...shadowChildren].slice(0, 128 - nodes.length),
    );
  }

  return [...animations];
};

const animationFor = (
  animations: Animation[],
  name: string,
  index: number,
) => animations.filter((animation) => animationName(animation) === name)[index] ?? null;

const ownAnimationsFor = (element: Element, animations: Animation[]) =>
  animations.filter((animation) => {
    const effect = animation.effect;

    if (!isKeyframeEffect(effect)) return true;

    return (!effect.target || effect.target === element) && !effect.pseudoElement;
  });

export const readMotionDetails = (
  element: Element,
  ownerWindow: Window,
): MotionDetails[] => {
  const view = element.ownerDocument.defaultView ?? ownerWindow;
  const style = view.getComputedStyle(element);
  const animations = getMotionAnimations(element);
  const ownAnimations = ownAnimationsFor(element, animations);

  const names = splitList(style.animationName);
  const durations = splitList(style.animationDuration);
  const delays = splitList(style.animationDelay);
  const easings = splitList(style.animationTimingFunction);
  const iterations = splitList(style.animationIterationCount);
  const directions = splitList(style.animationDirection);
  const fills = splitList(style.animationFillMode);

  const animationDetails = names
    .map<MotionDetails>((name, index) => {
      const duplicateIndex = names
        .slice(0, index)
        .filter((candidate) => candidate === name)
        .length;

      const animation = animationFor(
        ownAnimations,
        name,
        duplicateIndex,
      );

      return {
        kind: "animation",
        name,
        duration: parseTime(listValue(durations, index)),
        delay: parseTime(listValue(delays, index)),
        easing: listValue(easings, index),
        properties: keyframeProperties(animation),
        iterationCount: listValue(iterations, index),
        direction: listValue(directions, index),
        fillMode: listValue(fills, index),
        animation,
      };
    })
    .filter((motion) => motion.name !== "none");

  const transitionProperties = splitList(style.transitionProperty);
  const transitionDurations = splitList(style.transitionDuration);
  const transitionDelays = splitList(style.transitionDelay);
  const transitionEasings = splitList(style.transitionTimingFunction);

  const transitionAnimations = ownAnimations.filter((animation) =>
    Boolean(transitionProperty(animation)));

  const transitionDetails = transitionProperties
    .map<MotionDetails>((property, index) => {
      const animation = transitionAnimations.find((candidate) =>
        transitionProperty(candidate) === property)
        ?? (property === "all" ? transitionAnimations[0] : null)
        ?? null;

      return {
        kind: "transition",
        name: property,
        duration: parseTime(listValue(transitionDurations, index)),
        delay: parseTime(listValue(transitionDelays, index)),
        easing: listValue(transitionEasings, index),
        properties: property === "all" ? ["all"] : [property],
        iterationCount: "1",
        direction: "normal",
        fillMode: "both",
        animation,
      };
    })
    .filter((motion) =>
      motion.name !== "none" && motion.duration > 0 && motion.animation !== null);

  const claimed = new Set(
    [...animationDetails, ...transitionDetails]
      .map((motion) => motion.animation),
  );

  const webAnimations: MotionDetails[] = animations
    .filter((animation) => !claimed.has(animation))
    .flatMap((animation, index) => {
      let timing: EffectTiming | null = null;

      try {
        timing = animation.effect?.getTiming() ?? null;
      } catch {
        return [];
      }

      if (!timing) return [];

      const properties = keyframeProperties(animation);
      const numericDuration = Number(timing.duration);

      return [{
        kind: animationKind(animation),
        name: animationName(animation)
          || transitionProperty(animation)
          || animation.id
          || `js-${motionCssProperty(properties[0] || "animation")}-${index + 1}`,
        duration: Number.isFinite(numericDuration) ? numericDuration : 0,
        delay: timing.delay ?? 0,
        easing: timing.easing || "linear",
        properties,
        iterationCount: timing.iterations === Infinity
          ? "infinite"
          : String(timing.iterations ?? 1),
        direction: timing.direction || "normal",
        fillMode: timing.fill === "auto" ? "none" : timing.fill || "none",
        animation,
      }];
    });

  return [...animationDetails, ...transitionDetails, ...webAnimations];
};

export const motionDuration = (motion: MotionDetails) => {
  const iterations = Number.parseFloat(motion.iterationCount);

  return Number.isFinite(iterations)
    ? motion.duration * Math.max(0, iterations)
    : motion.duration;
};

const animationDuration = (animation: Animation, fallback: number) => {
  const timing = animation.effect?.getTiming();
  const duration = Number(timing?.duration);

  if (!Number.isFinite(duration)) return fallback;

  return duration * (
    timing?.iterations === Infinity
      ? 1
      : Math.max(0, timing?.iterations ?? 1)
  );
};

export const motionPlaybackState = (
  animations: Animation[],
  duration: number,
) => {
  const active = animations.filter((animation) => animation.playState === "running");
  const candidates = active.length ? active : animations;

  const reference = candidates.reduce<Animation | null>((longest, animation) => {
    if (!longest) return animation;

    return animationDuration(animation, duration) > animationDuration(longest, duration)
      ? animation
      : longest;
  }, null);

  return {
    playing: active.length > 0,
    progress: reference ? motionPlaybackProgress(reference, duration) : 0,
  };
};

export const motionPlaybackProgress = (
  animation: Animation,
  duration: number,
) => {
  const time = Number(animation.currentTime);

  if (!Number.isFinite(time) || duration <= 0) return 0;

  const timing = animation.effect?.getTiming();
  const elapsed = Math.max(0, time - (timing?.delay ?? 0));
  const looping = timing?.iterations === Infinity;

  const position = looping && (animation.playState === "running" || elapsed > duration)
    ? elapsed % duration
    : elapsed;

  return Math.min(1, position / duration);
};

export const formatMotionTime = (milliseconds: number) => {
  if (milliseconds >= 1000) {
    return `${(milliseconds / 1000).toFixed(milliseconds >= 10000 ? 0 : 1)}s`;
  }

  return `${Math.round(milliseconds)}ms`;
};

export const controlMotion = (
  element: Element,
  action: "play" | "pause" | "replay",
  playbackRate = 1,
) => {
  for (const animation of getMotionAnimations(element)) {
    controlledAnimations.add(animation);
    animation.playbackRate = playbackRate;

    if (action === "replay") {
      animation.cancel();
      animation.play();

      continue;
    }

    if (action === "play") animation.play();
    else animation.pause();
  }
};

export const scrubMotion = (
  element: Element,
  progress: number,
  duration: number,
) => {
  scrubAnimations(getMotionAnimations(element), progress, duration);
};

export const scrubAnimations = (
  animations: Animation[],
  progress: number,
  duration: number,
) => {
  const currentTime = Math.max(0, Math.min(1, progress)) * duration;

  for (const animation of animations) {
    controlledAnimations.add(animation);

    const timing = animation.effect?.getTiming();

    const elapsed = timing?.iterations === Infinity
      ? currentTime
      : Math.min(currentTime, animationDuration(animation, duration));

    animation.currentTime = elapsed + (timing?.delay ?? 0);
    animation.pause();
  }
};
