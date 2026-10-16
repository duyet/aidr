import { afterEach, describe, expect, it, vi } from "vitest";
import {
  markStage,
  markStageIfWaited,
  SERVER_TIMING_HEADER,
  withRequestTiming,
  withServerTiming,
} from "./request-timing";

const header = (response: Response) =>
  response.headers.get(SERVER_TIMING_HEADER) ?? "";

function gate() {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { released, release };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("request timing", () => {
  it("reports a stage marked deep inside the request on its response", async () => {
    const response = await withRequestTiming(async () => {
      await Promise.resolve();
      markStage("d1");
      return withServerTiming(new Response("ok"));
    });
    expect(header(response)).toMatch(
      /^d1;dur=\d+, total;dur=\d+, iso;desc=\d+;dur=\d+$/
    );
  });

  // Defect: one shared "current request" slot instead of a per-request store.
  // With both requests parked, the first one's mark lands on whichever
  // request entered last.
  it("keeps a stage mark on its own request when two overlap", async () => {
    const gateA = gate();
    const gateB = gate();
    const first = withRequestTiming(async () => {
      await gateA.released;
      markStage("first");
      return withServerTiming(new Response("a"));
    });
    const second = withRequestTiming(async () => {
      await gateB.released;
      markStage("second");
      return withServerTiming(new Response("b"));
    });
    gateA.release();
    const a = await first;
    gateB.release();
    const b = await second;
    expect(header(a)).toMatch(/^first;dur=\d+, total;dur=/);
    expect(header(a)).not.toContain("second");
    expect(header(b)).toMatch(/^second;dur=\d+, total;dur=/);
    expect(header(b)).not.toContain("first");
  });

  // Defect: the isolate age stamped at module load. On Workers the clock
  // reads 0 there, so `iso;dur` came out as milliseconds since 1970.
  it("measures isolate age from the first request, not module load", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.resetModules();
    const fresh = await import("./request-timing");
    const t0 = Date.UTC(2026, 9, 16);
    vi.setSystemTime(t0);
    await fresh.withRequestTiming(async () => new Response("1"));
    vi.setSystemTime(t0 + 5000);
    const response = await fresh.withRequestTiming(async () => {
      vi.setSystemTime(t0 + 5040);
      return fresh.withServerTiming(new Response("2"));
    });
    expect(header(response)).toBe("total;dur=40, iso;desc=2;dur=5040");
  });

  it("keeps an existing Server-Timing value and leaves the body intact", async () => {
    const response = await withRequestTiming(async () =>
      withServerTiming(
        new Response("body", {
          headers: { "server-timing": "aidr-cache;desc=MISS" },
        })
      )
    );
    expect(header(response)).toMatch(/^aidr-cache;desc=MISS, total;dur=/);
    expect(await response.text()).toBe("body");
  });

  // Defect: #896, a catch-all `ssr` stage after pure CPU printed `ssr;dur=0`
  // on every homepage miss.
  it("omits a stage that waited on no I/O and keeps one that did", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 16));
    const response = await withRequestTiming(async () => {
      markStageIfWaited("idle");
      vi.advanceTimersByTime(30);
      markStageIfWaited("waited");
      markStageIfWaited("idle-again");
      return withServerTiming(new Response("ok"));
    });
    expect(header(response)).toMatch(/^waited;dur=30, total;dur=30, iso/);
  });

  it("is a no-op outside a request", () => {
    markStage("orphan");
    const response = withServerTiming(new Response("ok"));
    expect(response.headers.has(SERVER_TIMING_HEADER)).toBe(false);
  });
});
