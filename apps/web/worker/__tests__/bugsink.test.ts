import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bindSentry,
  bugsinkEnvelope,
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

  // A deploy resets the Workflow's Durable Object mid-step and the engine
  // replays it; reporting that opens a Bugsink issue on every release.
  it.each([
    "Durable Object reset because its code was updated.",
    "Attempt failed due to internal workflows error",
  ])("does not report engine interruption: %s", async (message) => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    bindSentry({ SENTRY_DSN: "https://key@bugs.example/1" });
    await reportPipelineException(new Error(message), {
      step: "close-run",
      kind: "exception",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still reports other exceptions", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    bindSentry({ SENTRY_DSN: "https://key@bugs.example/1" });
    await reportPipelineException(new Error("boom"), { step: "close-run" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
