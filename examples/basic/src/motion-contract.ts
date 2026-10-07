import { mountMesurer } from "../../../packages/mesurer/src/index";

const webTarget = document.querySelector<HTMLElement>("[data-testid='web-motion']");

if (!webTarget) throw new Error("Motion contract Web Animation target is missing.");

const webAnimation = webTarget.animate(
  [
    { opacity: 0.45, transform: "scale(0.98)" },
    { opacity: 1, transform: "scale(1)" },
  ],
  {
    duration: 1600,
    iterations: Infinity,
    easing: "ease-in-out",
  },
);

webAnimation.id = "mesurer-contract-web-animation";

const subject = mountMesurer({
  target: document.body,
  isolate: false,
  persistKey: "mesurer-motion-contract",
});

await subject.ready;

type AnimationState = {
  playState: AnimationPlayState;
  currentTime: number | null;
  playbackRate: number;
};

const stateFor = (selector: string): AnimationState[] => {
  const target = document.querySelector(selector);

  if (!(target instanceof Element)) throw new Error(`Motion target not found: ${selector}`);

  return target.getAnimations({ subtree: true }).map((animation) => {
    const currentTime = Number(animation.currentTime);

    return {
      playState: animation.playState,
      currentTime: Number.isFinite(currentTime) ? currentTime : null,
      playbackRate: animation.playbackRate,
    };
  });
};

declare global {
  interface Window {
    __MESURER_MOTION_TEST__?: {
      subject: typeof subject;
      stateFor(selector: string): AnimationState[];
    };
  }
}

window.__MESURER_MOTION_TEST__ = {
  subject,
  stateFor,
};
