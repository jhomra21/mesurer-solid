import { describe, expect, test } from "bun:test";
import { FeedbackMailbox } from "./feedback-mailbox";

type TestDelivery = { note: string };

describe("FeedbackMailbox", () => {
  test("returns already queued feedback after the requested sequence", async () => {
    const mailbox = new FeedbackMailbox<TestDelivery>();
    mailbox.publish({ note: "first" });
    const second = mailbox.publish({ note: "second" });

    const result = await mailbox.wait({ after: 1, timeoutMs: 100 });

    expect(result.status).toBe("feedback");
    if (result.status !== "feedback") throw new Error("Expected feedback result.");
    expect(result.sequence).toBe(second.sequence);
    expect(result.event.delivery.note).toBe("second");
  });

  test("resolves a pending wait when feedback is published", async () => {
    const mailbox = new FeedbackMailbox<TestDelivery>();
    const waiting = mailbox.wait({ after: 0, timeoutMs: 500 });

    queueMicrotask(() => mailbox.publish({ note: "align the cards" }));
    const result = await waiting;

    expect(result.status).toBe("feedback");
    if (result.status !== "feedback") throw new Error("Expected feedback result.");
    expect(result.sequence).toBe(1);
    expect(result.event.delivery.note).toBe("align the cards");
  });

  test("returns the latest sequence on timeout", async () => {
    const mailbox = new FeedbackMailbox<TestDelivery>();
    mailbox.publish({ note: "existing" });

    const result = await mailbox.wait({ after: 1, timeoutMs: 5 });

    expect(result).toEqual({ status: "timeout", sequence: 1 });
  });

  test("cancels a pending wait without consuming later feedback", async () => {
    const mailbox = new FeedbackMailbox<TestDelivery>();
    const controller = new AbortController();
    const waiting = mailbox.wait({ after: 0, timeoutMs: 500, signal: controller.signal });
    controller.abort();

    await expect(waiting).rejects.toThrow("cancelled");

    mailbox.publish({ note: "still available" });
    const result = await mailbox.wait({ after: 0, timeoutMs: 100 });
    expect(result.status).toBe("feedback");
    if (result.status !== "feedback") throw new Error("Expected feedback result.");
    expect(result.event.delivery.note).toBe("still available");
  });

  test("retains only the configured history window", async () => {
    const mailbox = new FeedbackMailbox<TestDelivery>(2);
    mailbox.publish({ note: "one" });
    mailbox.publish({ note: "two" });
    mailbox.publish({ note: "three" });

    const result = await mailbox.wait({ after: 0, timeoutMs: 100 });

    expect(result.status).toBe("feedback");
    if (result.status !== "feedback") throw new Error("Expected feedback result.");
    expect(result.sequence).toBe(2);
    expect(result.event.delivery.note).toBe("two");
  });
});
