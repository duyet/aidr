import { describe, expect, it } from "vitest";
import {
  markStage,
  SERVER_TIMING_HEADER,
  withRequestTiming,
  withServerTiming,
} from "./request-timing";

const header = (response: Response) =>
  response.headers.get(SERVER_TIMING_HEADER) ?? "";

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

  it("keeps a stage mark on its own request when two overlap", async () => {
    let releaseFirst: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = withRequestTiming(async () => {
      await gate;
      markStage("first");
      return withServerTiming(new Response("a"));
    });
    const second = withRequestTiming(async () => {
      markStage("second");
      return withServerTiming(new Response("b"));
    });
    const b = await second;
    releaseFirst();
    const a = await first;
    expect(header(a)).toContain("first;dur=");
    expect(header(a)).not.toContain("second");
    expect(header(b)).not.toContain("first");
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

  it("is a no-op outside a request", () => {
    markStage("orphan");
    const response = withServerTiming(new Response("ok"));
    expect(response.headers.has(SERVER_TIMING_HEADER)).toBe(false);
  });
});
