export type ToolbarPosition = { x: number; y: number };

export const DEFAULT_TOOLBAR_POSITION: ToolbarPosition = { x: 16, y: 16 };

export const MACOS_ELECTRON_TOOLBAR_POSITION: ToolbarPosition = { x: 84, y: 16 };

type ElectronWindow = Window & {
  process?: {
    type?: string;
    versions?: {
      electron?: string;
    };
  };
};

const isElectronWindow = (ownerWindow: Window) => {
  const candidate = ownerWindow as ElectronWindow;

  return candidate.process?.type === "renderer"
    || Boolean(candidate.process?.versions?.electron)
    || /\bElectron\/\d/i.test(ownerWindow.navigator.userAgent);
};

const isMacOSWindow = (ownerWindow: Window) => {
  const platform = ownerWindow.navigator.platform || ownerWindow.navigator.userAgent;

  return /^Mac/i.test(platform) || /\bMacintosh\b/i.test(ownerWindow.navigator.userAgent);
};

export const getDefaultToolbarPosition = (ownerWindow: Window): ToolbarPosition =>
  isElectronWindow(ownerWindow) && isMacOSWindow(ownerWindow)
    ? MACOS_ELECTRON_TOOLBAR_POSITION
    : DEFAULT_TOOLBAR_POSITION;
