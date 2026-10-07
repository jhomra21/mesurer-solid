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
import type { ObservedMotionTarget } from "../core/observed-motion";
import { MotionPreview, type MotionPreviewWakeRef } from "./MotionPreview";

const SPEED_PRESETS = [0.25, 0.5, 1, 2] as const;

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
    ];
  });

  const keyframes = createMemo(() => props.motions
    .filter((motion) => motion.kind !== "transition")
    .map((motion) => ({
      name: motion.name,
      frames: readMotionKeyframes(motion.animation, motion.easing),
    }))
    .filter(({ frames }) => frames.length > 0));

  const copy = (value: string) => {
    void props.ownerWindow.navigator.clipboard?.writeText(value).catch(() => undefined);
  };

  return (
    <div
      data-mesurer-motion-details="true"
      class="msr:w-full msr:border-t msr:border-ink-200 msr:px-2 msr:pb-2 msr:pt-2 msr:text-[10px] msr:text-ink-900"
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
          <button
            type="button"
            class="msr:ml-auto msr:bg-transparent msr:p-0 msr:text-[10px] msr:text-ink-500 msr:underline msr:underline-offset-2"
            aria-expanded={keyframesExpanded() ? "true" : "false"}
            onClick={() => setKeyframesExpanded((value) => !value)}
          >
            {keyframesExpanded() ? "Hide keyframes" : "Show keyframes"}
          </button>

          <Show when={keyframesExpanded()}>
            <div class="msr:flex msr:flex-col msr:gap-2 msr:pt-1">
              <For each={keyframes()}>{(group) => (
                <div>
                  <div class="msr:mb-1 msr:font-mono msr:text-[10px] msr:font-medium">{group.name}</div>
                  <For each={group.frames}>{(frame) => (
                    <div class="msr:grid msr:grid-cols-[3.5rem_minmax(0,1fr)] msr:gap-2 msr:font-mono msr:text-[9px]">
                      <span class="msr:text-ink-500">{frame.offset}</span>
                      <span class="msr:whitespace-pre-wrap msr:break-words">{frame.displayValue || "underlying style"}</span>
                    </div>
                  )}</For>
                </div>
              )}</For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}

export function MotionPlayer(props: {
  element: Element;
  ownerWindow: Window;
  observedProperties: string[];
  observedTargets: ObservedMotionTarget[];
}) {
  const [duration, setDuration] = createSignal(0);
  const [progress, setProgress] = createSignal(0);
  const [speed, setSpeed] = createSignal(1);
  const [playing, setPlaying] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const [motions, setMotions] = createSignal<MotionDetails[]>([]);
  const [inspectOpen, setInspectOpen] = createSignal(false);
  const [speedOpen, setSpeedOpen] = createSignal(false);
  const [playbackElement, setPlaybackElement] = createSignal<Element | null>(null);

  const previewWakeRef: MotionPreviewWakeRef = { current: null };
  let animations: Animation[] = [];

  const observedOnly = () => props.observedProperties.length > 0;
  const playbackReady = () => playbackElement() === props.element;
  const controllable = () =>
    playbackReady()
    && !observedOnly()
    && duration() > 0
    && motions().some((motion) => motion.animation);

  createEffect(() => {
    const element = props.element;
    const ownerWindow = props.ownerWindow;

    setPlaybackElement(null);

    const timer = ownerWindow.setTimeout(() => {
      if (element.isConnected) setPlaybackElement(element);
    }, 250);

    onCleanup(() => ownerWindow.clearTimeout(timer));
  });

  createEffect(() => {
    const element = props.element;
    const ownerWindow = props.ownerWindow;

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
  });

  createEffect(() => {
    const ownerWindow = props.ownerWindow;

    if (!ready() || !controllable()) return;

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
  });

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
    if (!controllable()) return;

    setSpeed(next);
    controlMotion(props.element, playing() ? "play" : "pause", next);
    setSpeedOpen(false);
  };

  return (
    <Show when={ready() || props.observedProperties.length > 0}>
      <div
        data-mesurer-motion-player="true"
        data-mesurer-inspector-ui="true"
        aria-label="Motion playback"
        class="mesurer-menu-surface msr:pointer-events-auto msr:w-full msr:overflow-hidden msr:rounded-[12px] msr:border msr:border-ink-200 msr:bg-white msr:text-ink-900"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div class="msr:p-2">
          <button
            type="button"
            class="msr:block msr:w-full msr:overflow-hidden msr:rounded-[8px] msr:border-0 msr:bg-ink-50 msr:p-0 msr:text-left"
            disabled={!controllable()}
            aria-label="Motion preview"
            onClick={togglePlay}
          >
            <MotionPreview
              element={props.element}
              ownerWindow={props.ownerWindow}
              observedTargets={props.observedTargets}
              wakeRef={previewWakeRef}
            />
          </button>

          <div class="msr:mt-2 msr:flex msr:h-7 msr:items-center msr:gap-1">
            <Show
              when={!observedOnly() && playbackReady()}
              fallback={
                <div
                  role="status"
                  class="msr:min-w-0 msr:flex-1 msr:truncate msr:font-mono msr:text-[10px] msr:text-ink-500"
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
                class="msr:flex msr:size-7 msr:shrink-0 msr:items-center msr:justify-center msr:rounded-[7px] msr:bg-transparent msr:text-ink-900 msr:hover:bg-black/4 msr:disabled:opacity-40"
                onClick={togglePlay}
              >
                {playing() ? <PauseIcon /> : <PlayIcon />}
              </button>

              <span class="msr:w-8 msr:shrink-0 msr:font-mono msr:text-[10px] msr:tabular-nums msr:text-ink-500">
                {controllable() ? timestamp(progress() * duration()) : "—"}
              </span>

              <input
                type="range"
                data-mesurer-motion-scrubber="true"
                aria-label="Scrub motion timeline"
                disabled={!controllable()}
                min="0"
                max="1"
                step="0.001"
                value={progress()}
                class="msr:min-w-0 msr:flex-1 msr:accent-ink-900"
                onInput={(event) => seek(Number(event.currentTarget.value))}
                onChange={(event) => seek(Number(event.currentTarget.value))}
                onKeyDown={(event) => event.stopPropagation()}
              />

              <span class="msr:w-8 msr:shrink-0 msr:text-right msr:font-mono msr:text-[10px] msr:tabular-nums msr:text-ink-500">
                {controllable() ? timestamp(duration()) : "—"}
              </span>

              <div class="msr:relative msr:flex msr:shrink-0">
                <button
                  type="button"
                  data-mesurer-motion-speed="true"
                  aria-label="Playback speed"
                  aria-expanded={speedOpen() ? "true" : "false"}
                  disabled={!controllable()}
                  class="msr:h-7 msr:min-w-10 msr:rounded-[7px] msr:bg-transparent msr:px-1.5 msr:font-mono msr:text-[10px] msr:text-ink-500 msr:hover:bg-black/4 msr:disabled:opacity-40"
                  onClick={() => setSpeedOpen((open) => !open)}
                >
                  {speed()}x
                </button>

                <Show when={speedOpen() && controllable()}>
                  <div
                    data-mesurer-motion-speed-menu="true"
                    role="menu"
                    aria-label="Playback speed options"
                    class="mesurer-menu-surface msr:absolute msr:bottom-full msr:right-0 msr:z-[120] msr:mb-1 msr:flex msr:min-w-24 msr:flex-col msr:rounded-[8px] msr:border msr:border-ink-200 msr:bg-white msr:p-1"
                  >
                    <For each={SPEED_PRESETS}>{(value) => (
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={speed() === value ? "true" : "false"}
                        data-mesurer-motion-speed-option={String(value)}
                        class="msr:rounded-[5px] msr:bg-transparent msr:px-2 msr:py-1 msr:text-left msr:font-mono msr:text-[10px] msr:text-ink-700 msr:hover:bg-black/4"
                        onClick={() => changeSpeed(value)}
                      >
                        {value}x
                      </button>
                    )}</For>
                  </div>
                </Show>
              </div>
            </Show>

            <button
              type="button"
              data-mesurer-motion-inspect="true"
              aria-label={inspectOpen() ? "Hide motion details" : "Show motion details"}
              aria-expanded={inspectOpen() ? "true" : "false"}
              class="msr:flex msr:size-7 msr:shrink-0 msr:items-center msr:justify-center msr:rounded-[7px] msr:bg-transparent msr:text-ink-900 msr:hover:bg-black/4"
              onClick={() => setInspectOpen((open) => !open)}
            >
              <InspectIcon />
            </button>
          </div>
        </div>

        <Show when={inspectOpen()}>
          <div class="mesurer-thin-scrollbar msr:max-h-[50vh] msr:overflow-y-auto">
            <MotionValues
              motions={motions()}
              ownerWindow={props.ownerWindow}
              element={props.element}
              observedProperties={props.observedProperties}
            />
          </div>
        </Show>
      </div>
    </Show>
  );
}
