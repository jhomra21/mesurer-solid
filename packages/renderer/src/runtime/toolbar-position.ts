export type ToolbarPosition = { x: number; y: number };

export const DEFAULT_TOOLBAR_POSITION: ToolbarPosition = { x: 16, y: 16 };

export const MACOS_ELECTRON_TITLEBAR_SAFE_TOP = 48;

export const MACOS_ELECTRON_TOOLBAR_POSITION: ToolbarPosition = {
  x: 84,
  y: MACOS_ELECTRON_TITLEBAR_SAFE_TOP,
};

export type ToolbarHostEnvironment = {
  navigator: Pick<Navigator, "platform" | "userAgent">;
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

const clearMacOSTitlebar = (
  ownerWindow: ToolbarHostEnvironment,
  position: ToolbarPosition,
): ToolbarPosition => {
  if (!isMacOSElectronToolbarHost(ownerWindow)) return position;

  return {
    x: position.x,
    y: Math.max(MACOS_ELECTRON_TITLEBAR_SAFE_TOP, position.y),
  };
};

export const getDefaultToolbarPosition = (ownerWindow: ToolbarHostEnvironment): ToolbarPosition =>
  isMacOSElectronToolbarHost(ownerWindow)
    ? MACOS_ELECTRON_TOOLBAR_POSITION
    : DEFAULT_TOOLBAR_POSITION;

export const resolveInitialToolbarPosition = (
  ownerWindow: ToolbarHostEnvironment,
  savedPosition?: ToolbarPosition,
): ToolbarPosition => clearMacOSTitlebar(
  ownerWindow,
  savedPosition ?? getDefaultToolbarPosition(ownerWindow),
);

export const constrainToolbarPosition = (
  ownerWindow: ToolbarHostEnvironment,
  position: ToolbarPosition,
  toolbarSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
  viewportPadding = 8,
): ToolbarPosition => {
  const minY = isMacOSElectronToolbarHost(ownerWindow)
    ? Math.max(viewportPadding, MACOS_ELECTRON_TITLEBAR_SAFE_TOP)
    : viewportPadding;

  const maxX = Math.max(
    viewportPadding,
    viewportSize.width - toolbarSize.width - viewportPadding,
  );

  const maxY = Math.max(
    minY,
    viewportSize.height - toolbarSize.height - viewportPadding,
  );

  return {
    x: Math.min(maxX, Math.max(viewportPadding, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y)),
  };
};
