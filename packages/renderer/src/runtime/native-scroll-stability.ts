import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

/**
 * Keep native anchor surfaces in the same document-space positioning model and
 * advance only their hidden fallback coordinates during compositor scrolling.
 *
 * CSS Anchor Positioning owns the visible geometry. The inline left/top values
 * on selected-text highlights remain as a fallback for re-binding after scroll;
 * keeping those values in viewport coordinates without reading layout prevents
 * the settle pass from turning scroll distance into a new selection offset.
 */
export function installNativeScrollStability(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow } = runtime;

  const style = ownerDocument.createElement("style");
  style.dataset.mesurerNativeScrollStability = "true";
  style.dataset.mesurerInspectorUi = "true";
  style.textContent = `
[data-mesurer-selected-measurement="true"] > div {
  transition: none !important;
  animation: none !important;
}
[data-mesurer-native-scroll-owner="typography"][data-mesurer-native-scroll-anchor="box"],
[data-mesurer-native-scroll-owner="typography"][data-mesurer-native-scroll-anchor="offset"] {
  position: absolute !important;
}
`;
  ownerDocument.head.append(style);

  let scrollX = ownerWindow.scrollX;
  let scrollY = ownerWindow.scrollY;

  const shiftSelectedTextFallbacks = () => {
    const nextX = ownerWindow.scrollX;
    const nextY = ownerWindow.scrollY;
    const deltaX = nextX - scrollX;
    const deltaY = nextY - scrollY;
    scrollX = nextX;
    scrollY = nextY;
    if (deltaX === 0 && deltaY === 0) return;

    for (const highlight of ownerDocument.querySelectorAll<HTMLElement>(
      "[data-mesurer-text-selection-highlight='true'][data-mesurer-native-scroll-anchor='offset']",
    )) {
      const left = Number.parseFloat(highlight.style.left);
      const top = Number.parseFloat(highlight.style.top);
      if (Number.isFinite(left)) highlight.style.left = `${left - deltaX}px`;
      if (Number.isFinite(top)) highlight.style.top = `${top - deltaY}px`;
    }
  };

  ownerWindow.addEventListener("scroll", shiftSelectedTextFallbacks, true);

  ctx.lifecycle.onDispose(() => {
    ownerWindow.removeEventListener("scroll", shiftSelectedTextFallbacks, true);
    style.remove();
  });
}
