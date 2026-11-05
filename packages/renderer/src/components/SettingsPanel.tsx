import { onSettled, type ComponentProps } from "solid-js";
import { SettingsPanel as SettingsPanelCore } from "./SettingsPanelCore";

type SettingsPanelProps = ComponentProps<typeof SettingsPanelCore>;

const SETTINGS_WIDTH = 252;

const VIEWPORT_PADDING = 8;

const SETTINGS_ANCHOR_GAP = 4;

/**
 * Keep the horizontal Settings placement inside the viewport while the dialog is open.
 *
 * Plugin lifecycle can change the toolbar width while Settings stays open. The toolbar owns the
 * initial menu placement; this component observes only toolbar/anchor size changes and re-clamps
 * that same horizontal placement after layout, so pointer and scroll paths do no extra work.
 */
export function SettingsPanel(props: SettingsPanelProps) {
  let hostElement: HTMLDivElement | undefined;

  onSettled(() => {
    const host = hostElement;
    const ownerWindow = props.ownerWindow.document.defaultView ?? props.ownerWindow;
    // SAFETY: ownerWindow is the browsing-context global for the Settings DOM and owns the constructors used by these observers.
    const realm = ownerWindow as Window & typeof globalThis;

    if (!host || !realm.ResizeObserver) return;

    const dialog = host.closest<HTMLElement>("[role='dialog'][aria-label='Settings']");
    const anchor = dialog?.parentElement ?? null;
    const toolbar = dialog?.closest<HTMLElement>("[data-mesurer-toolbar='true']") ?? null;
    let clampFrame = 0;

    const clampToViewport = () => {
      clampFrame = 0;

      if (!dialog?.isConnected || !anchor?.isConnected) return;

      if (toolbar?.dataset.orientation === "vertical") return;
      const viewportWidth = ownerWindow.innerWidth;

      if (viewportWidth <= 0) return;
      const measuredWidth = dialog.getBoundingClientRect().width || SETTINGS_WIDTH;
      const width = Math.min(measuredWidth, Math.max(0, viewportWidth - VIEWPORT_PADDING * 2));
      const anchorRect = anchor.getBoundingClientRect();
      const idealViewportLeft = anchorRect.right + SETTINGS_ANCHOR_GAP - width;

      const maxViewportLeft = Math.max(
        VIEWPORT_PADDING,
        viewportWidth - VIEWPORT_PADDING - width,
      );

      const viewportLeft = Math.min(
        maxViewportLeft,
        Math.max(VIEWPORT_PADDING, idealViewportLeft),
      );

      const nextLeft = viewportLeft - anchorRect.left;
      const currentLeft = Number.parseFloat(dialog.style.left);

      if (!Number.isFinite(currentLeft) || Math.abs(currentLeft - nextLeft) > 0.25) {
        dialog.style.left = `${nextLeft}px`;
        dialog.style.right = "auto";
      }
    };

    const scheduleClamp = () => {
      if (clampFrame) return;
      clampFrame = ownerWindow.requestAnimationFrame(clampToViewport);
    };

    const resizeObserver = new realm.ResizeObserver(scheduleClamp);

    if (toolbar) resizeObserver.observe(toolbar);

    if (anchor) resizeObserver.observe(anchor);
    ownerWindow.addEventListener("resize", scheduleClamp);

    scheduleClamp();

    return () => {
      resizeObserver.disconnect();
      ownerWindow.removeEventListener("resize", scheduleClamp);

      if (clampFrame) ownerWindow.cancelAnimationFrame(clampFrame);
    };
  });

  return (
    <div ref={(element) => { hostElement = element; }} style={{ display: "contents" }}>
      <SettingsPanelCore {...props} />
    </div>
  );
}
