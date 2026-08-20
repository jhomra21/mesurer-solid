export type StoreListener<T> = (snapshot: T) => void;

export type ObservableStore<T> = {
  readonly current: T;
  getSnapshot(): T;
  mutate(update: (draft: T) => void): void;
  replace(next: T): void;
  subscribe(listener: StoreListener<T>, options?: { emitCurrent?: boolean }): () => void;
  dispose(): void;
};

export function createObservableStore<T>(
  initial: T,
  snapshot: (value: T) => T,
): ObservableStore<T> {
  let current = initial;
  const listeners = new Set<StoreListener<T>>();

  const publish = () => {
    const next = snapshot(current);
    for (const listener of [...listeners]) listener(next);
  };

  return {
    get current() {
      return current;
    },
    getSnapshot: () => snapshot(current),
    mutate(update) {
      update(current);
      publish();
    },
    replace(next) {
      current = next;
      publish();
    },
    subscribe(listener, options) {
      listeners.add(listener);
      if (options?.emitCurrent) listener(snapshot(current));
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
    },
  };
}
