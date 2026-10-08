import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import {
  controlMotion,
  getMotionAnimations,
  motionCssProperty,
  motionDuration,
  motionPlaybackState,
  readMotionDetails,
  readMotionKeyframes,
  scrubAnimations,
  type MotionDetails,
} from "../core/motion";
import { observeMotion, readObservedMotion } from "../core/observed-motion";
import { ControlShell } from "./ControlField";
import { MotionPreview, type MotionPreviewWakeRef } from "./MotionPreview";

const SPEED_PRESETS = [0.25, 0.5, 1] as const;

const timestamp = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const timeValue = (milliseconds: number) =>
  milliseconds >= 1000
    ? `${milliseconds / 1000}s`
    : `${milliseconds}ms`;

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3.25 2.25 9 6l-5.75 3.75z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 2.25h2v7.5H3zm4 0h2v7.5H7z" fill="currentColor" />
    </svg>
  );
}

function InspectIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4 2.25 1.25 6 4 9.75M8 2.25 10.75 6 8 9.75M6.75 1.75 5.25 10.25" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function MotionValues(props: {
  motions: MotionDetails[];
  ownerWindow: Window;
  element: Element;
  observedProperties: string[];
}) {
  const [keyframesExpanded, setKeyframesExpanded] = createSignal(false);

  const grouped = createMemo(() => {
    const animations = props.motions.filter((motion) => motion.kind === "animation");
    const transitions = props.motions.filter((motion) => motion.kind === "transition");
    const webAnimations = props.motions.filter((motion) => motion.kind === "web-animation");

    const properties = [...new Set(props.motions.flatMap((motion) => motion.properties))]
      .map(motionCssProperty)
      .join(", ");

    const shorthand = (
      label: string,
      motions: MotionDetails[],
    ) => {
      const value = motions.map((motion) => [
        motion.name,
        timeValue(motion.duration),
        motion.easing,
        motion.delay ? timeValue(motion.delay) : "",
        ...(motion.kind !== "transition"
          ? [
              motion.iterationCount !== "1" ? motion.iterationCount : "",
              motion.direction !== "normal" ? motion.direction : "",
              motion.fillMode !== "none" ? motion.fillMode : "",
              motion.animation?.playState === "paused" ? "paused" : "",
            ]
          : []),
      ].filter(Boolean).join(" ")).join(",\n");

      return value ? [[label, value] as const] : [];
    };

    const style = props.ownerWindow.getComputedStyle(props.element);

    const extras = [
      "animation-composition", "animation-timeline", "animation-range-start",
      "animation-range-end", "transition-behavior",
      ...(properties.includes("transform") ? ["transform-origin"] : []),
      ...(style.perspective !== "none" ? ["perspective", "perspective-origin"] : []),
    ].flatMap((label) => {
      const value = style.getPropertyValue(label).trim();

      return value && !/^(auto|normal|replace)(,\s*\1)*$/.test(value)
        ? [[label, value] as const]
        : [];
    });

    return [
      ...shorthand("animation", animations),
      ...shorthand("transition", transitions),
      ...shorthand("web animation", webAnimations),
      ...(properties ? [["animated properties", properties] as const] : []),
      ...(props.observedProperties.length
        ? [
            ["observed motion", props.observedProperties.join(", ")] as const,
            ["playback", "Observed motion is read-only"] as const,
          ]
        : []),
      ...extras,
    ];
  });

  const keyframes = createMemo(() => props.motions
    .filter((motion) => motion.kind !== "transition")
    .map((motion) => ({
      name: motion.name,
      frames: readMotionKeyframes(motion.animation, motion.easing),
    }))
    .filter(({ frames }) => frames.length > 0));

  const keyframeBlocks = createMemo(() => keyframes().map(({ name, frames }) =>
    `@keyframes ${name} {\n${frames.map(({ offset, value }) => `  ${offset} { ${value} }`).join("\n")}\n}`));

  const groupedKeyframes = createMemo(() => keyframes().map(({ name, frames }) => {
    const groups = new Map<string, { offsets: string[]; displayValue: string }>();

    for (const { offset, value, displayValue } of frames) {
      const match = groups.get(value);

      if (match) match.offsets.push(offset);
      else groups.set(value, { offsets: [offset], displayValue });
    }

    return { name, frames: [...groups].map(([value, group]) => ({ value, ...group })) };
  }));

  const copy = (value: string) => {
    void props.ownerWindow.navigator.clipboard?.writeText(value).catch(() => undefined);
  };

  return (
    <div
      class="msr:w-full msr:px-2 msr:pb-2 msr:pt-2 msr:text-[10px] msr:text-ink-900"
    >
      <div class="msr:flex msr:flex-col msr:gap-1">
        <For each={grouped()}>{([label, value]) => (
          <div class="msr:grid msr:grid-cols-[5.5rem_minmax(0,1fr)] msr:items-baseline msr:gap-2">
            <span class="msr:text-ink-500">{label}</span>
            <button
              type="button"
              class="msr:min-w-0 msr:whitespace-pre-wrap msr:break-words msr:bg-transparent msr:p-0 msr:text-right msr:font-mono msr:text-[10px] msr:text-ink-900 msr:hover:underline"
              onClick={() => copy(value)}
            >
              {value}
            </button>
          </div>
        )}</For>

        <Show when={keyframes().length > 0}>
          <Show when={!keyframesExpanded()}>
            <For each={keyframes()}>{(group, index) => (
              <div class="msr:grid msr:grid-cols-[3.5rem_minmax(0,1fr)] msr:items-baseline msr:gap-2">
                <span class="msr:text-ink-500">{index() === 0 ? "keyframes" : ""}</span>
                <button
                  type="button"
                  aria-label={`Copy keyframes ${group.name}`}
                  class="msr:min-w-0 msr:whitespace-pre-wrap msr:break-words msr:bg-transparent msr:p-0 msr:text-right msr:font-mono msr:text-[10px] msr:text-ink-900 msr:hover:underline"
                  onClick={() => copy(keyframeBlocks().join("\n\n"))}
                >
                  {group.name}: {group.frames.map((frame) => frame.offset).join(", ")}
                </button>
              </div>
            )}</For>
          </Show>

          <Show when={keyframesExpanded()}>
            <For each={groupedKeyframes()}>{(group, groupIndex) => (
              <div class="msr:mt-1 msr:flex msr:flex-col msr:gap-1">
                <div class="msr:grid msr:grid-cols-[auto_minmax(0,1fr)] msr:items-baseline msr:gap-2">
                  <span class="msr:text-ink-500">{groupIndex() === 0 ? "keyframes" : ""}</span>
                  <button
                    type="button"
                    class="msr:min-w-0 msr:truncate msr:bg-transparent msr:p-0 msr:text-right msr:font-mono msr:text-[10px] msr:text-ink-900 msr:hover:underline"
                    onClick={() => copy(keyframeBlocks()[groupIndex()] ?? "")}
                  >{group.name}</button>
                </div>
                <For each={group.frames}>{(frame) => (
                  <div class="msr:grid msr:grid-cols-[3.5rem_minmax(0,1fr)] msr:items-baseline msr:gap-2">
                    <span class="msr:font-mono msr:tabular-nums msr:text-ink-500">{frame.offsets.join(", ")}</span>
                    <button
                      type="button"
                      class="msr:min-w-0 msr:whitespace-pre-wrap msr:break-words msr:bg-transparent msr:p-0 msr:text-right msr:font-mono msr:text-[10px] msr:text-ink-900 msr:hover:underline"
                      onClick={() => copy(`${frame.offsets.join(", ")} { ${frame.value} }`)}
                    >{frame.displayValue || "underlying style"}</button>
                  </div>
                )}</For>
              </div>
            )}</For>
          </Show>

          <button
            type="button"
            data-mesurer-motion-keyframes-toggle="true"
            class="msr:ml-auto msr:bg-transparent msr:p-0 msr:text-[10px] msr:text-ink-500 msr:underline msr:underline-offset-2"
            aria-expanded={keyframesExpanded() ? "true" : "false"}
            onClick={() => setKeyframesExpanded((value) => !value)}
          >
            {keyframesExpanded() ? "Hide keyframes" : "Show keyframes"}
          </button>
        </Show>
      </div>
    </div>
  );
}

export function MotionPlayer(props: {
  element: Element;
  ownerWindow: Window;
}) {
  const [duration, setDuration] = createSignal(0);
  const [progress, setProgress] = createSignal(0);
  const [speed, setSpeed] = createSignal(1);
  const [playing, setPlaying] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const [motions, setMotions] = createSignal<MotionDetails[]>([]);
  const [inspectOpen, setInspectOpen] = createSignal(false);
  const [speedOpen, setSpeedOpen] = createSignal(false);
  let speedAnchorElement: HTMLDivElement | undefined;
  let speedSelectElement: HTMLSelectElement | undefined;
  let customSpeedInput: HTMLInputElement | undefined;
  let customSpeedTrack: HTMLDivElement | undefined;
  const [speedDraft, setSpeedDraft] = createSignal("");
  const [speedEditing, setSpeedEditing] = createSignal(false);
  let scrubTrack: HTMLDivElement | undefined;
  let scrubBounds: DOMRect | null = null;
  let scrubPointer: number | null = null;
  const customSpeedId = "mesurer-motion-custom-speed";

  const [playbackElement, setPlaybackElement] = createSignal<Element | null>(null);
  const [observedTargets, setObservedTargets] = createSignal(readObservedMotion(props.element));

  const previewWakeRef: MotionPreviewWakeRef = { current: null };
  let animations: Animation[] = [];

  const observedProperties = createMemo(() =>
    [...new Set(observedTargets().flatMap((target) => target.properties))]);

  const observedOnly = () => observedProperties().length > 0;
  const playbackReady = () => playbackElement() === props.element;

  const controllable = () =>
    playbackReady()
    && !observedOnly()
    && duration() > 0
    && motions().some((motion) => motion.animation);

  createEffect(
    () => [props.element, props.ownerWindow] as const,
    ([element, ownerWindow]) => {
      setObservedTargets(readObservedMotion(element));

      const stopObserved = observeMotion(
        element,
        ownerWindow,
        (targets) => setObservedTargets(targets),
      );

      onCleanup(stopObserved);
    },
  );

  createEffect(
    () => [props.element, props.ownerWindow] as const,
    ([element, ownerWindow]) => {
      setPlaybackElement(null);

      const timer = ownerWindow.setTimeout(() => {
        if (element.isConnected) setPlaybackElement(element);
      }, 250);

      onCleanup(() => ownerWindow.clearTimeout(timer));
    },
  );

  createEffect(
    () => [props.element, props.ownerWindow] as const,
    ([element, ownerWindow]) => {
      setProgress(0);
      setPlaying(false);
      setInspectOpen(false);
      setSpeedOpen(false);
      animations = [];

      const first = getMotionAnimations(element)[0];

      setSpeed(first?.playbackRate ?? 1);

      const refresh = () => {
        if (!element.isConnected) {
          setReady(false);
          setDuration(0);
          setMotions([]);
          animations = [];

          return;
        }

        try {
          const nextMotions = readMotionDetails(element, ownerWindow);

          const nextAnimations = [...new Set(
            nextMotions.flatMap((motion) => motion.animation ? [motion.animation] : []),
          )];

          setReady(nextMotions.length > 0 || getMotionAnimations(element).length > 0);
          setDuration(Math.max(0, ...nextMotions.map(motionDuration)));
          setMotions(nextMotions);
          animations = nextAnimations;
        } catch {
          setReady(false);
          setDuration(0);
          setMotions([]);
          animations = [];
        }
      };

      refresh();

      const interval = ownerWindow.setInterval(refresh, 250);

      onCleanup(() => ownerWindow.clearInterval(interval));
    },
  );

  createEffect(
    () => [props.ownerWindow, ready(), controllable(), duration()] as const,
    ([ownerWindow, motionReady, canControl]) => {
      if (!motionReady || !canControl) return;

      let timer = 0;
      let frame = 0;
      let disposed = false;

      const update = () => {
        if (disposed) return;

        const playback = motionPlaybackState(animations, duration());

        setProgress(playback.progress);
        setPlaying(playback.playing);
        previewWakeRef.current?.();

        if (playback.playing) {
          frame = ownerWindow.requestAnimationFrame(update);
        } else {
          timer = ownerWindow.setTimeout(update, 250);
        }
      };

      update();

      onCleanup(() => {
        disposed = true;
        ownerWindow.clearTimeout(timer);
        ownerWindow.cancelAnimationFrame(frame);
      });
    },
  );

  const seek = (next: number) => {
    if (!controllable()) return;

    const position = Math.max(0, Math.min(1, next));

    setProgress(position);
    setPlaying(false);
    scrubAnimations(animations, position, duration());
    previewWakeRef.current?.();
  };

  const togglePlay = () => {
    if (!controllable()) return;

    const action = playing() ? "pause" : "play";

    controlMotion(props.element, action, speed());
    setPlaying(action === "play");
  };

  const changeSpeed = (next: number) => {
    if (!controllable() || !Number.isFinite(next)) return;

    const clamped = Math.min(4, Math.max(0.1, Math.round(next * 100) / 100));

    setSpeed(clamped);
    controlMotion(props.element, playing() ? "play" : "pause", clamped);
  };

  const changeSpeedFromPointer = (clientX: number) => {
    const rect = customSpeedTrack?.getBoundingClientRect();

    if (!rect) return;
    const usable = Math.max(1, rect.width - 16);
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left - 8) / usable));
    const stepped = Math.round((0.1 + ratio * 3.9 - 0.1) / 0.05) * 0.05 + 0.1;

    changeSpeed(stepped);
  };

  const scrubAt = (clientX: number) => {
    if (!controllable()) return;

    const rect = scrubBounds ?? scrubTrack?.getBoundingClientRect();

    if (!rect?.width) return;
    seek((clientX - rect.left) / rect.width);
  };

  const stopScrubbing = (pointerId: number) => {
    if (scrubPointer !== pointerId) return;
    scrubPointer = null;
    scrubBounds = null;

    if (scrubTrack?.hasPointerCapture(pointerId)) scrubTrack.releasePointerCapture(pointerId);
  };

  createEffect(
    () => speedOpen(),
    (open) => {
      if (!open) return;

      const ownerWindow = speedAnchorElement?.ownerDocument.defaultView;

      if (!ownerWindow) return;

      ownerWindow.queueMicrotask(() => {
        if (!speedOpen()) return;
        customSpeedInput?.focus({ preventScroll: true });
        customSpeedInput?.select();
      });

      const dismiss = (event: Event) => {
        if (event.type === "keydown") {
          // SAFETY: this listener handles only keydown and pointerdown; the type guard selects a keyboard event.
          const keyboard = event as KeyboardEvent;

          if (keyboard.key !== "Escape") return;
          keyboard.preventDefault();
          keyboard.stopPropagation();
          setSpeedOpen(false);
          speedSelectElement?.focus({ preventScroll: true });

          return;
        }

        if (speedAnchorElement && event.composedPath().includes(speedAnchorElement)) return;
        setSpeedOpen(false);
      };

      ownerWindow.addEventListener("pointerdown", dismiss, true);
      ownerWindow.addEventListener("keydown", dismiss, true);

      onCleanup(() => {
        ownerWindow.removeEventListener("pointerdown", dismiss, true);
        ownerWindow.removeEventListener("keydown", dismiss, true);
      });
    },
  );

  return (
    <Show when={ready() || observedProperties().length > 0}>
      <div
        data-mesurer-motion-player="true"
        data-mesurer-inspector-ui="true"
        aria-label="Motion playback"
        class="mesurer-menu-surface msr:relative msr:box-border msr:pointer-events-auto msr:w-full msr:overflow-visible msr:rounded-[12px] msr:bg-white msr:text-ink-900 msr:outline-none"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div class="msr:relative msr:p-2">
          <button
            type="button"
            class="msr:relative msr:block msr:w-full msr:overflow-hidden msr:rounded-[8px] msr:border-0 msr:bg-ink-50 msr:p-0 msr:text-left"
            disabled={!controllable()}
            aria-label="Motion preview"
            onClick={togglePlay}
          >
            <MotionPreview
              element={props.element}
              ownerWindow={props.ownerWindow}
              observedTargets={observedTargets()}
              wakeRef={previewWakeRef}
            />
          </button>

          <div class="msr:mt-2 msr:flex msr:h-5 msr:items-center msr:gap-1.5">
            <Show
              when={!observedOnly() && playbackReady()}
              fallback={
                <div
                  role="status"
                  class="msr:min-w-0 msr:flex-1 msr:truncate msr:font-mono msr:text-[10px] msr:leading-none msr:text-ink-500"
                >
                  {observedOnly() ? "JavaScript animation. Controls unavailable." : "Preparing motion…"}
                </div>
              }
            >
              <button
                type="button"
                data-mesurer-motion-play="true"
                aria-label={playing() ? "Pause motion" : "Play motion"}
                aria-pressed={playing() ? "true" : "false"}
                disabled={!controllable()}
                class="msr:flex msr:size-5 msr:shrink-0 msr:items-center msr:justify-center msr:rounded-[6px] msr:border-0 msr:bg-transparent msr:p-0 msr:text-ink-900 msr:hover:bg-black/4 msr:disabled:opacity-40"
                onClick={togglePlay}
              >
                {playing() ? <PauseIcon /> : <PlayIcon />}
              </button>

              <span class="msr:flex msr:h-5 msr:w-8 msr:shrink-0 msr:items-center msr:font-mono msr:text-[10px] msr:leading-none msr:tabular-nums msr:text-ink-500">
                {controllable() ? timestamp(progress() * duration()) : "—"}
              </span>

              <div
                ref={scrubTrack}
                role="slider"
                tabindex={controllable() ? 0 : -1}
                data-mesurer-motion-scrubber="true"
                aria-label="Scrub motion timeline"
                aria-disabled={!controllable() ? "true" : "false"}
                aria-valuemin={0}
                aria-valuemax={duration()}
                aria-valuenow={progress() * duration()}
                aria-valuetext={controllable() ? `${Math.round(progress() * 100)}%` : "Playback unavailable"}
                class="mesurer-recording-timeline msr:relative msr:h-5 msr:min-w-0 msr:flex-1 msr:cursor-pointer msr:select-none"
                onPointerDown={(event) => {
                  if (!controllable()) return;

                  scrubBounds = event.currentTarget.getBoundingClientRect();
                  scrubPointer = event.pointerId;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  scrubAt(event.clientX);
                }}
                onPointerMove={(event) => {
                  if (event.pointerId === scrubPointer) scrubAt(event.clientX);
                }}
                onPointerUp={(event) => {
                  if (event.pointerId !== scrubPointer) return;
                  scrubAt(event.clientX);
                  stopScrubbing(event.pointerId);
                }}
                onPointerCancel={(event) => stopScrubbing(event.pointerId)}
                onLostPointerCapture={(event) => stopScrubbing(event.pointerId)}
                onKeyDown={(event) => {
                  if (!controllable()) return;

                  if (event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    event.stopPropagation();
                    seek(event.key === "Home" ? 0 : 1);

                    return;
                  }

                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  event.stopPropagation();
                  seek(progress() + (event.key === "ArrowRight" ? 0.02 : -0.02));
                }}
              >
                <div class="mesurer-recording-track-rail msr:pointer-events-none msr:absolute msr:inset-x-0 msr:top-1/2 msr:h-[3px] msr:-translate-y-1/2 msr:rounded-full msr:bg-ink-200" />
                <div
                  class="msr:pointer-events-none msr:absolute msr:top-1/2 msr:z-[2] msr:h-2 msr:-translate-y-1/2"
                  style={{ left: `${progress() * 100}%` }}
                >
                  <div class="mesurer-recording-playhead msr:h-full msr:w-0.5 msr:rounded-full msr:bg-ink-900" />
                </div>
              </div>

              <span class="msr:flex msr:h-5 msr:w-8 msr:shrink-0 msr:items-center msr:justify-end msr:font-mono msr:text-[10px] msr:leading-none msr:tabular-nums msr:text-ink-500">
                {controllable() ? timestamp(duration()) : "—"}
              </span>

              <div ref={speedAnchorElement} class="msr:relative msr:flex msr:h-5 msr:shrink-0 msr:items-center">
                <select
                  ref={speedSelectElement}
                  data-mesurer-motion-speed="true"
                  aria-label="Playback speed"
                  aria-controls={speedOpen() ? customSpeedId : undefined}
                  disabled={!controllable()}
                  value={String(speed())}
                  style={{ width: `${Math.max(6, `${speed()}x`.length + 1)}ch` }}
                  class="mesurer-settings-button-ghost msr:h-5 msr:appearance-none msr:rounded-[6px] msr:border msr:border-transparent msr:bg-transparent msr:p-0 msr:text-center msr:font-mono msr:text-[10px] msr:tabular-nums msr:text-ink-500 msr:hover:bg-black/4 msr:focus-visible:bg-black/4 msr:focus-visible:outline-none"
                  onChange={(event) => {
                    if (event.currentTarget.value === "custom") {
                      setSpeedOpen(true);

                      return;
                    }

                    setSpeedOpen(false);
                    changeSpeed(Number(event.currentTarget.value));
                  }}
                >
                  <For each={SPEED_PRESETS}>{(value) => (
                    <option value={String(value)}>{value}x</option>
                  )}</For>
                  <Show when={!SPEED_PRESETS.some((value) => value === speed())}>
                    <option value={String(speed())}>{speed()}x</option>
                  </Show>
                  <option value="custom">Custom</option>
                </select>

                <Show when={speedOpen() && controllable()}>
                  <div
                    id={customSpeedId}
                    role="dialog"
                    data-mesurer-motion-custom-speed="true"
                    aria-label="Custom playback speed"
                    class="mesurer-menu-surface msr:absolute msr:right-0 msr:top-full msr:z-[120] msr:mt-1 msr:flex msr:w-[208px] msr:max-w-[calc(100vw-16px)] msr:items-center msr:gap-1 msr:rounded-[9px] msr:border msr:border-ink-200 msr:bg-white msr:p-1"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div class="msr:min-w-0 msr:flex-1">
                      <div class="msr:grid msr:h-8 msr:w-full msr:grid-cols-[minmax(0,1fr)] msr:items-center">
                        <ControlShell
                          left={
                            <div
                              ref={customSpeedTrack}
                              class="msr:relative msr:min-w-0 msr:flex-1 msr:touch-none msr:select-none msr:px-2"
                              style={{ height: "20px" }}
                              data-slider-container="true"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                event.currentTarget.setPointerCapture(event.pointerId);
                                changeSpeedFromPointer(event.clientX);
                              }}
                              onPointerMove={(event) => {
                                if (event.currentTarget.hasPointerCapture(event.pointerId)) changeSpeedFromPointer(event.clientX);
                              }}
                              onPointerUp={(event) => {
                                event.stopPropagation();

                                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                  event.currentTarget.releasePointerCapture(event.pointerId);
                                }
                              }}
                              onPointerCancel={(event) => {
                                event.stopPropagation();

                                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                  event.currentTarget.releasePointerCapture(event.pointerId);
                                }
                              }}
                            >
                              <div
                                class="msr:absolute msr:left-[8px] msr:right-[8px] msr:rounded-full"
                                style={{ top: "8px", height: "4px", "background-color": "var(--msr-slider-track)" }}
                                aria-hidden="true"
                              />
                              <div
                                class="msr:absolute msr:left-[8px] msr:rounded-full"
                                style={{
                                  top: "8px",
                                  height: "4px",
                                  width: `calc(${((speed() - 0.1) / 3.9) * 100}% - ${((speed() - 0.1) / 3.9) * 16}px)`,
                                  "background-color": "var(--msr-accent)",
                                }}
                                aria-hidden="true"
                              />
                              <div
                                role="slider"
                                tabindex={0}
                                aria-label="Custom playback speed slider"
                                aria-valuemin={0.1}
                                aria-valuemax={4}
                                aria-valuenow={speed()}
                                aria-valuetext={`${speed()}x`}
                                class="mesurer-control-thumb msr:absolute msr:rounded-[5px] msr:bg-white msr:shadow-sm msr:outline-none msr:focus-visible:ring-1 msr:focus-visible:ring-[var(--msr-accent)]/25"
                                style={{
                                  left: `calc(8px + (100% - 16px) * ${(speed() - 0.1) / 3.9})`,
                                  top: "4px",
                                  width: "12px",
                                  height: "12px",
                                  transform: "translateX(-50%)",
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Home") changeSpeed(0.1);
                                  else if (event.key === "End") changeSpeed(4);
                                  else if (event.key === "ArrowRight" || event.key === "ArrowUp") changeSpeed(speed() + 0.05);
                                  else if (event.key === "ArrowLeft" || event.key === "ArrowDown") changeSpeed(speed() - 0.05);
                                  else return;

                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                              />
                            </div>
                          }
                          right={
                            <input
                              ref={customSpeedInput}
                              type="text"
                              aria-label="Custom playback speed value"
                              value={speedEditing() ? speedDraft() : `${speed()}x`}
                              class="msr:h-full msr:w-full msr:border-0 msr:bg-transparent msr:px-1 msr:text-left msr:font-mono msr:text-[12px] msr:font-medium msr:tabular-nums msr:text-ink-700 msr:outline-none"
                              onFocus={() => {
                                setSpeedDraft(`${speed()}x`);
                                setSpeedEditing(true);
                              }}
                              onInput={(event) => {
                                const value = event.currentTarget.value;

                                setSpeedDraft(value);
                                const parsed = Number.parseFloat(value);

                                if (Number.isFinite(parsed)) changeSpeed(parsed);
                              }}
                              onBlur={() => setSpeedEditing(false)}
                              onPointerDown={(event) => event.stopPropagation()}
                              onKeyDown={(event) => {
                                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  changeSpeed(speed() + (event.key === "ArrowUp" ? 0.05 : -0.05));

                                  return;
                                }

                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  event.currentTarget.blur();
                                }
                              }}
                            />
                          }
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Close custom speed"
                      class="msr:flex msr:size-5 msr:shrink-0 msr:items-center msr:justify-center msr:rounded-[6px] msr:bg-transparent msr:text-ink-700 msr:hover:bg-black/4"
                      onClick={() => {
                        setSpeedOpen(false);
                        speedSelectElement?.focus({ preventScroll: true });
                      }}
                    ><span aria-hidden="true">×</span></button>
                  </div>
                </Show>
              </div>
            </Show>

            <button
              type="button"
              data-mesurer-motion-inspect="true"
              aria-label={inspectOpen() ? "Hide motion details" : "Show motion details"}
              aria-expanded={inspectOpen() ? "true" : "false"}
              class="msr:flex msr:size-5 msr:shrink-0 msr:items-center msr:justify-center msr:rounded-[6px] msr:border-0 msr:bg-transparent msr:p-0 msr:text-ink-900 msr:hover:bg-black/4"
              onClick={() => setInspectOpen((open) => !open)}
            >
              <InspectIcon />
            </button>
          </div>
        </div>

        <div data-mesurer-motion-details="true" hidden={!inspectOpen()} class="mesurer-thin-scrollbar msr:max-h-[50vh] msr:overflow-y-auto">
          <Show when={inspectOpen()}>
            <MotionValues
              motions={motions()}
              ownerWindow={props.ownerWindow}
              element={props.element}
              observedProperties={observedProperties()}
            />
          </Show>
        </div>
      </div>
    </Show>
  );
}
