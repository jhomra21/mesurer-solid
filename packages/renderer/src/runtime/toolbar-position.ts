export type ToolbarPosition = { x: number; y: number };

export const DEFAULT_TOOLBAR_POSITION: ToolbarPosition = { x: 16, y: 16 };

export const MACOS_ELECTRON_TOOLBAR_POSITION: ToolbarPosition = { x: 84, y: 16 };

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

export const getDefaultToolbarPosition = (ownerWindow: ToolbarHostEnvironment): ToolbarPosition =>
  isElectronWindow(ownerWindow) && isMacOSWindow(ownerWindow)
    ? MACOS_ELECTRON_TOOLBAR_POSITION
    : DEFAULT_TOOLBAR_POSITION;

export const resolveInitialToolbarPosition = (
  ownerWindow: ToolbarHostEnvironment,
  savedPosition?: ToolbarPosition,
): ToolbarPosition => savedPosition ?? getDefaultToolbarPosition(ownerWindow);
