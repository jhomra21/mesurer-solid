export type ToolbarPosition = { x: number; y: number };

export const DEFAULT_TOOLBAR_POSITION: ToolbarPosition = { x: 16, y: 16 };

export const MACOS_ELECTRON_TOOLBAR_POSITION: ToolbarPosition = { x: 84, y: 16 };

export const MACOS_ELECTRON_TRAFFIC_LIGHT_SAFE_AREA = {
  right: 84,
  bottom: 48,
} as const;

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

const clearMacOSTrafficLights = (
  ownerWindow: ToolbarHostEnvironment,
  position: ToolbarPosition,
): ToolbarPosition => {
  if (!isMacOSElectronToolbarHost(ownerWindow)) return position;

  if (
    position.x >= MACOS_ELECTRON_TRAFFIC_LIGHT_SAFE_AREA.right
    || position.y >= MACOS_ELECTRON_TRAFFIC_LIGHT_SAFE_AREA.bottom
  ) {
    return position;
  }

  return {
    x: MACOS_ELECTRON_TRAFFIC_LIGHT_SAFE_AREA.right,
    y: position.y,
  };
};

export const getDefaultToolbarPosition = (ownerWindow: ToolbarHostEnvironment): ToolbarPosition =>
  isMacOSElectronToolbarHost(ownerWindow)
    ? MACOS_ELECTRON_TOOLBAR_POSITION
    : DEFAULT_TOOLBAR_POSITION;

export const resolveInitialToolbarPosition = (
  ownerWindow: ToolbarHostEnvironment,
  savedPosition?: ToolbarPosition,
): ToolbarPosition => clearMacOSTrafficLights(
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
  const maxX = Math.max(
    viewportPadding,
    viewportSize.width - toolbarSize.width - viewportPadding,
  );

  const maxY = Math.max(
    viewportPadding,
    viewportSize.height - toolbarSize.height - viewportPadding,
  );

  const clamped = {
    x: Math.min(maxX, Math.max(viewportPadding, position.x)),
    y: Math.min(maxY, Math.max(viewportPadding, position.y)),
  };

  if (!isMacOSElectronToolbarHost(ownerWindow)) return clamped;

  const safeRight = MACOS_ELECTRON_TRAFFIC_LIGHT_SAFE_AREA.right;
  const safeBottom = MACOS_ELECTRON_TRAFFIC_LIGHT_SAFE_AREA.bottom;

  if (clamped.x >= safeRight || clamped.y >= safeBottom) return clamped;

  if (maxX >= safeRight) {
    return {
      x: safeRight,
      y: clamped.y,
    };
  }

  if (maxY >= safeBottom) {
    return {
      x: clamped.x,
      y: safeBottom,
    };
  }

  return clamped;
};
