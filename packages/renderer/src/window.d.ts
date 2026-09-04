export {};

declare global {
  interface Window {
    ResizeObserver?: typeof ResizeObserver;
  }
}
