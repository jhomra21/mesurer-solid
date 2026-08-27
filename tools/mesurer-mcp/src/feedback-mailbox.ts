export type MesurerFeedbackEvent<T> = {
  sequence: number;
  receivedAt: string;
  delivery: T;
};

export type MesurerFeedbackWaitResult<T> =
  | { status: "feedback"; sequence: number; event: MesurerFeedbackEvent<T> }
  | { status: "timeout"; sequence: number };

type FeedbackWaiter<T> = {
  after: number;
  resolve(result: MesurerFeedbackWaitResult<T>): void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort?: () => void;
};

export class FeedbackMailbox<T> {
  readonly #events: MesurerFeedbackEvent<T>[] = [];
  readonly #waiters = new Set<FeedbackWaiter<T>>();
  readonly #limit: number;
  #sequence = 0;

  constructor(limit = 50) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("Feedback mailbox limit must be a positive integer.");
    }
    this.#limit = limit;
  }

  get sequence(): number {
    return this.#sequence;
  }

  publish(delivery: T): MesurerFeedbackEvent<T> {
    const event: MesurerFeedbackEvent<T> = {
      sequence: ++this.#sequence,
      receivedAt: new Date().toISOString(),
      delivery,
    };
    this.#events.push(event);
    if (this.#events.length > this.#limit) this.#events.splice(0, this.#events.length - this.#limit);

    for (const waiter of this.#waiters) {
      if (event.sequence <= waiter.after) continue;
      this.#finish(waiter, { status: "feedback", sequence: event.sequence, event });
    }
    return event;
  }

  wait(options: {
    after?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}): Promise<MesurerFeedbackWaitResult<T>> {
    const after = options.after ?? 0;
    const timeoutMs = options.timeoutMs ?? 60_000;
    if (!Number.isInteger(after) || after < 0) {
      return Promise.reject(new Error("Feedback sequence must be a non-negative integer."));
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
      return Promise.reject(new Error("Feedback wait timeout must be a positive integer."));
    }

    const existing = this.#events.find((event) => event.sequence > after);
    if (existing) {
      return Promise.resolve({ status: "feedback", sequence: existing.sequence, event: existing });
    }
    if (options.signal?.aborted) {
      return Promise.reject(new Error("Mesurer feedback wait was cancelled."));
    }

    return new Promise((resolve, reject) => {
      const waiter: FeedbackWaiter<T> = {
        after,
        resolve,
        timer: setTimeout(() => {
          this.#finish(waiter, { status: "timeout", sequence: this.#sequence });
        }, timeoutMs),
      };

      if (options.signal) {
        const onAbort = () => {
          this.#remove(waiter);
          reject(new Error("Mesurer feedback wait was cancelled."));
        };
        waiter.signal = options.signal;
        waiter.onAbort = onAbort;
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
      this.#waiters.add(waiter);
    });
  }

  #finish(waiter: FeedbackWaiter<T>, result: MesurerFeedbackWaitResult<T>): void {
    this.#remove(waiter);
    waiter.resolve(result);
  }

  #remove(waiter: FeedbackWaiter<T>): void {
    if (!this.#waiters.delete(waiter)) return;
    clearTimeout(waiter.timer);
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener("abort", waiter.onAbort);
    }
  }
}
