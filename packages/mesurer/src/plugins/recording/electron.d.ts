export type MesurerElectronBootstrap = {
  readonly disposed: boolean;
  readonly ready: Promise<void>;
  dispose(): void;
};

/**
 * Install Mesurer's package-owned Electron integration.
 *
 * Importing `mesurer-solid/electron` installs one shared instance automatically.
 * Call this function only when explicit lifecycle ownership is useful.
 */
export function installMesurerElectron(): MesurerElectronBootstrap;

export const mesurerElectron: MesurerElectronBootstrap;
