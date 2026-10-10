export type ToolbarPosition = { x: number; y: number };

export const DEFAULT_TOOLBAR_POSITION: ToolbarPosition = { x: 16, y: 16 };

export const MACOS_ELECTRON_TITLEBAR_SAFE_TOP = 48;

export const MACOS_ELECTRON_TOOLBAR_POSITION: ToolbarPosition = {
  x: 84,
  y: MACOS_ELECTRON_TITLEBAR_SAFE_TOP,
};

export type ToolbarHostEnvironment = {
  navigator: Pick<Navigator, "platform" | "userAgent">;
  innerHeight?: number;
  outerHeight?: number;
  __MESURER_HOST__?: {
    windowControls?: { visible: boolean; bounds?: { x: number; y: number; width: number; height: number } };
  };
  process?: {
    type?: string;
    versions?: {
      electron?: string;
    };
  };
};

const isElectronWindow = (ownerWindow: ToolbarHostEnvironment) =>
  ownerWindow.process?.type === "renderer"
  || Boolean(ownerWindow.process?.versions?.electron)
  || /\bElectron\/\d/i.test(ownerWindow.navigator.userAgent);

const isMacOSWindow = (ownerWindow: ToolbarHostEnvironment) => {
  const platform = ownerWindow.navigator.platform || ownerWindow.navigator.userAgent;

  return /^Mac/i.test(platform) || /\bMacintosh\b/i.test(ownerWindow.navigator.userAgent);
};

export const isMacOSElectronToolbarHost = (ownerWindow: ToolbarHostEnvironment) =>
  isElectronWindow(ownerWindow) && isMacOSWindow(ownerWindow);

type NativeControlsRect = { x: number; y: number; width: number; height: number };

const DEFAULT_CONTROLS: NativeControlsRect = { x: 0, y: 0, width: 84, height: 48 };

const getWindowControls = (ownerWindow: ToolbarHostEnvironment): NativeControlsRect | null => {
  if (!isMacOSElectronToolbarHost(ownerWindow)) return null;

  // A desktop host with custom chrome can expose its actual traffic-light
  // geometry through the narrow Mesurer host bridge. No Electron/Node APIs
  // need to cross contextIsolation.
  const declared = ownerWindow.__MESURER_HOST__?.windowControls;

  if (declared) return declared.visible ? declared.bounds ?? DEFAULT_CONTROLS : null;

  const overlay = (ownerWindow.navigator as Navigator & {
    windowControlsOverlay?: { visible: boolean; getTitlebarAreaRect: () => DOMRect };
  }).windowControlsOverlay;

  if (overlay?.visible) {
    const content = overlay.getTitlebarAreaRect();

    if (content.x > 0 && content.height > 0) {
      return { x: 0, y: content.y, width: content.x, height: content.height };
    }
  }

  // A framed macOS window draws its traffic lights in the OS titlebar, OUTSIDE
  // the renderer viewport. The previous universal 84x48 exclusion incorrectly
  // blocked dragging into perfectly valid page content.
  if (
    Number.isFinite(ownerWindow.outerHeight)
    && Number.isFinite(ownerWindow.innerHeight)
    && ownerWindow.outerHeight! - ownerWindow.innerHeight! >= 24
  ) return null;

  // Frameless/hidden-titlebar hosts without an explicit contract retain the
  // conservative fallback until their actual button bounds are provided.
  return DEFAULT_CONTROLS;
};

export const getDefaultToolbarPosition = (ownerWindow: ToolbarHostEnvironment): ToolbarPosition =>
  getWindowControls(ownerWindow)
    ? MACOS_ELECTRON_TOOLBAR_POSITION
    : DEFAULT_TOOLBAR_POSITION;

const clearMacOSWindowControls = (
  ownerWindow: ToolbarHostEnvironment,
  position: ToolbarPosition,
  padding: number,
  toolbarWidth = 0,
  toolbarHeight = 0,
): ToolbarPosition => {
  const controls = getWindowControls(ownerWindow);

  if (!controls || controls.width <= 0 || controls.height <= 0) return position;

  const intersects = position.x < controls.x + controls.width
    && position.x + toolbarWidth > controls.x
    && position.y < controls.y + controls.height
    && position.y + toolbarHeight > controls.y;

  return intersects
    ? { ...position, y: Math.max(padding, controls.y + controls.height) }
    : position;
};

export const resolveInitialToolbarPosition = (
  ownerWindow: ToolbarHostEnvironment,
  savedPosition?: ToolbarPosition,
): ToolbarPosition => clearMacOSWindowControls(
  ownerWindow,
  savedPosition ?? getDefaultToolbarPosition(ownerWindow),
  8,
  352,
  40,
);

export const constrainToolbarPosition = (
  ownerWindow: ToolbarHostEnvironment,
  position: ToolbarPosition,
  toolbarSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
  viewportPadding = 8,
): ToolbarPosition => {
  const minY = viewportPadding;

  const maxX = Math.max(
    viewportPadding,
    viewportSize.width - toolbarSize.width - viewportPadding,
  );

  const maxY = Math.max(
    minY,
    viewportSize.height - toolbarSize.height - viewportPadding,
  );

  return clearMacOSWindowControls(ownerWindow, {
    x: Math.min(maxX, Math.max(viewportPadding, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y)),
  }, viewportPadding, toolbarSize.width, toolbarSize.height);
};
