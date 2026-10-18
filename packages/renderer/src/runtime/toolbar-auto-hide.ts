import { createEffect, createSignal, onSettled, untrack } from "solid-js";
import type { ToolbarSide } from "./toolbar-dock";
import { getWindowControls } from "./toolbar-position";

export function createToolbarAutoHide(options: {
  ownerWindow: Window;
  element: () => HTMLElement | undefined;
  enabled: () => boolean;
  edge: () => ToolbarSide | null;
  busy: () => boolean;
}) {
  const [tucked, setTucked] = createSignal(false);
  const [pressedOff, setPressedOff] = createSignal(false);
  let awaited = true;
  let timer = 0;
  const window = options.ownerWindow;
  const clear = () => { window.clearTimeout(timer); timer = 0; };

  const stay = () => { clear(); setTucked(false); };

  const hideSoon = () => {
    if (awaited || options.busy() || !options.enabled() || !options.edge()
      || options.element()?.querySelector(":focus-visible") || timer) return;
    timer = window.setTimeout(() => { timer = 0; setTucked(true); }, 600);
  };

  createEffect(() => [options.enabled(), options.edge(), options.busy()] as const, ([enabled, edge, busy]) => {
    stay();

    if (enabled && edge && !busy) untrack(hideSoon);
  });
  onSettled(() => {
    const bar = options.element();

    const move = (event: PointerEvent) => {
      if (!options.enabled() || !options.edge()) return;
      const rect = bar?.getBoundingClientRect();

      if (!rect) return;
      const controls = getWindowControls(window);

      const overControls = controls && event.clientX >= controls.x && event.clientX < controls.x + controls.width
        && event.clientY >= controls.y && event.clientY < controls.y + controls.height;

      if (overControls) return;
      const safeTop = controls && rect.left < controls.x + controls.width && rect.right > controls.x ? controls.y + controls.height : 0;
      const alongX = event.clientX >= rect.left - 16 && event.clientX <= rect.right + 16;
      const alongY = event.clientY >= rect.top - 16 && event.clientY <= rect.bottom + 16;

      const near = {
        top: event.clientY <= safeTop + 48 && alongX,
        bottom: event.clientY >= window.innerHeight - 48 && alongX,
        left: event.clientX <= 48 && alongY,
        right: event.clientX >= window.innerWidth - 48 && alongY,
      }[options.edge()!];

      if (near && event.buttons === 0) { awaited = false; stay(); }
      else hideSoon();
    };

    const down = (event: PointerEvent) => setPressedOff(Boolean(bar && !event.composedPath().includes(bar)));
    const end = () => setPressedOff(false);
    const focus = () => { if (bar?.querySelector(":focus-visible")) stay(); };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    bar?.addEventListener("focusin", focus);
    bar?.addEventListener("focusout", hideSoon);

    return () => {
      clear();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      bar?.removeEventListener("focusin", focus);
      bar?.removeEventListener("focusout", hideSoon);
    };
  });

  return { tucked, pressedOff };
}
