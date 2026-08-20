export type EventMap = Record<string, unknown>;
export type EventListener<T> = (event: T) => void | Promise<void>;

export type EventBus<Events extends EventMap> = {
  on<K extends keyof Events & string>(type: K, listener: EventListener<Events[K]>): () => void;
  emit<K extends keyof Events & string>(type: K, event: Events[K]): Promise<void>;
  clear(): void;
};

export function createEventBus<Events extends EventMap>(): EventBus<Events> {
  const listeners = new Map<string, Set<EventListener<unknown>>>();
  return {
    on(type, listener) {
      const bucket = listeners.get(type) ?? new Set<EventListener<unknown>>();
      bucket.add(listener as EventListener<unknown>);
      listeners.set(type, bucket);
      return () => {
        bucket.delete(listener as EventListener<unknown>);
        if (bucket.size === 0) listeners.delete(type);
      };
    },
    async emit(type, event) {
      for (const listener of [...(listeners.get(type) ?? [])]) await listener(event);
    },
    clear() {
      listeners.clear();
    },
  };
}
