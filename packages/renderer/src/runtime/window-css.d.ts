export {};

declare global {
  interface Window {
    readonly CSS: typeof CSS;
  }
}
