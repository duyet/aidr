import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bindSentry,
  bugsinkEnvelope,
  engineInterruptionReason,
  reportPipelineException,
} from "../bugsink";

describe("bugsink envelope", () => {
  it("posts a delivery failure to the project envelope endpoint", () => {
    const built = bugsinkEnvelope("https://public-key@duyet.bugsink.com/2", {
      message: "telegram digest failed",
      tags: { channel: "telegram" },
      exception: { type: "Error", value: "telegram digest failed" },
    });
    expect(built?.url).toBe("https://duyet.bugsink.com/api/2/envelope/");
    expect(built?.key).toBe("public-key");
    const lines = built?.body.split("\n") ?? [];
    expect(JSON.parse(lines[1] ?? "").type).toBe("event");
    const event = JSON.parse(lines[2] ?? "");
    expect(event.message.formatted).toBe("telegram digest failed");
    expect(event.tags.channel).toBe("telegram");
    expect(event.exception.values[0].type).toBe("Error");
    expect(built?.body).not.toContain("public-key");
  });

  it("ignores a DSN that is not a URL", () => {
    expect(bugsinkEnvelope("not a dsn", { message: "x" })).toBeNull();
  });
});

describe("reportPipelineException", () => {
  afterEach(() => vi.unstubAllGlobals());

  // None of these is an app bug — the engine retries or replays the step — so
  // none may open a Bugsink issue. #339/#340 got through the previous filter
  // because it required `error instanceof Error`, which is false for a failure
  // that crossed the Durable Object RPC boundary; #333/#330 were never listed.
  const INTERRUPTIONS = [
    [
      "Durable Object reset because its code was updated.",
      "durable object code updated",
    ],
    [
      "Attempt failed due to internal workflows error",
      "internal workflows error",
    ],
    ["Execution timed out after 240000ms", "step timed out"],
    [
      "Connection closed: this Durable Object instance is no longer active. Reconnect or retry the request.",
      "durable object instance went away",
    ],
  ] as const;

  it.each(INTERRUPTIONS)(
    "does not report engine interruption: %s",
    async (message) => {
      const fetchMock = vi.fn(async () => new Response("ok"));
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      bindSentry({ SENTRY_DSN: "https://key@bugs.example/1" });
      await reportPipelineException(new Error(message), {
        step: "close-run",
        kind: "exception",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  // The RPC boundary hands the failure back structured-cloned, so the receiver
  // gets a plain object: `instanceof Error` is false and `String()` on it is
  // "[object Object]". Only `.message` still carries the phrase.
  it.each(INTERRUPTIONS)(
    "recognizes an interruption that arrived as a plain object: %s",
    (message, reason) => {
      expect(
        engineInterruptionReason({ name: "Error", message, stack: "" })
      ).toBe(reason);
    }
  );

  it("recognizes an interruption thrown as a bare string", () => {
    expect(engineInterruptionReason("Execution timed out after 60000ms")).toBe(
      "step timed out"
    );
  });

  it("still reports other exceptions", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    bindSentry({ SENTRY_DSN: "https://key@bugs.example/1" });
    await reportPipelineException(new Error("boom"), { step: "close-run" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["a real app error", new Error("D1_ERROR: no such table: items")],
    ["an aborted provider request", new Error("Provider request timed out")],
    ["a non-error value", { code: "ENOENT" }],
    ["nothing", null],
    ["an empty string", "   "],
  ])("does not mistake %s for an interruption", (_label, error) => {
    expect(engineInterruptionReason(error)).toBeNull();
  });
});
