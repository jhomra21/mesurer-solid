export type EventListener<T> = {
  bivarianceHack(event: T): void | Promise<void>;
}["bivarianceHack"];

export type EventBus<Events extends object> = {
  on<K extends keyof Events & string>(type: K, listener: EventListener<Events[K]>): () => void;
  emit<K extends keyof Events & string>(type: K, event: Events[K]): Promise<void>;
  clear(): void;
};

export function createEventBus<Events extends object>(): EventBus<Events> {
  type EventName = keyof Events & string;
  type EventValue = Events[EventName];
  const listeners = new Map<EventName, Set<EventListener<EventValue>>>();

  return {
    on(type, listener) {
      const bucket = listeners.get(type) ?? new Set<EventListener<EventValue>>();
      bucket.add(listener);
      listeners.set(type, bucket);
      return () => {
        bucket.delete(listener);
        if (bucket.size === 0) listeners.delete(type);
      };
    },
    async emit(type, event) {
      const queue = Array.from(listeners.get(type) ?? []);
      for (const listener of queue) await listener(event);
    },
    clear() {
      listeners.clear();
    },
  };
}
