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
      const pending: Promise<void>[] = [];
      for (const listener of queue) {
        const result = listener(event);
        if (result) pending.push(result);
      }
      for (const result of pending) await result;
    },
    clear() {
      listeners.clear();
    },
  };
}
