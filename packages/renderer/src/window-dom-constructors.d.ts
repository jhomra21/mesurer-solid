export {};

declare global {
  interface Window {
    readonly ShadowRoot: typeof ShadowRoot;
    readonly CSS: typeof CSS;
  }
}
