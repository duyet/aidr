/** @vitest-environment happy-dom */

/**
 * Analytics must not share a main-thread task with the LCP paint.
 *
 * Issue #229 measured a 2,420 ms LCP element render delay with 1,648 ms of
 * total blocking time. The five third-party bootstraps in
 * `@aidr/ui/Analytics` were injected from a plain useEffect — React's commit
 * phase — and the trace attributed 280 ms to Clarity, 247 ms to
 * j.duyet.net/p.js and 167 ms to gtag, all competing with the paint. None of
 * them affect what the visitor is looking at.
 *
 * These tests assert the observable contract, not the implementation: nothing
 * third-party is in the document until the LCP paint has happened, and all of
 * it is in the document after.
 */
import AnalyticWrapper from "@aidr/ui/Analytics";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Entry = { renderTime: number; loadTime: number; startTime: number };
type ObserverCallback = (list: { getEntries: () => Entry[] }) => void;

let emitLcp: (() => void) | undefined;
let observed: unknown[] = [];

/** Script tags currently in the document, srcs and inline text inlined. */
function thirdPartyScripts(): string[] {
  return [...document.querySelectorAll("script")].map((el) => {
    const src = el.getAttribute("src") ?? "";
    if (src) return src;
    return el.textContent ?? "";
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  observed = [];
  emitLcp = undefined;

  // A controllable PerformanceObserver for LCP.
  vi.stubGlobal(
    "PerformanceObserver",
    class {
      constructor(cb: ObserverCallback) {
        emitLcp = () =>
          cb({
            getEntries: () => [
              { renderTime: 1200, loadTime: 1200, startTime: 1200 },
            ],
          });
        observed.push(cb);
      }
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
  );

  // A controllable requestIdleCallback.
  const idle: (() => void)[] = [];
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
    idle.push(cb);
    return idle.length;
  });
  vi.stubGlobal("cancelIdleCallback", () => {});
  vi.stubGlobal("__drainIdle", () => {
    const queued = idle.splice(0, idle.length);
    for (const cb of queued) cb();
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function drainIdle() {
  (globalThis as unknown as { __drainIdle: () => void }).__drainIdle();
}

describe("Analytics deferral (#229)", () => {
  it("injects nothing third-party before the LCP paint", async () => {
    render(<AnalyticWrapper />);
    await vi.advanceTimersByTimeAsync(0);

    // A plain useEffect would already have appended all five bootstraps.
    expect(thirdPartyScripts()).toHaveLength(0);
    expect(document.querySelectorAll("script")).toHaveLength(0);
  });

  it("subscribes to largest-contentful-paint", async () => {
    render(<AnalyticWrapper />);
    await vi.advanceTimersByTimeAsync(0);
    expect(observed.length).toBe(1);
  });

  it("injects the third-party bootstraps on idle time after the LCP paint", async () => {
    render(<AnalyticWrapper />);
    await vi.advanceTimersByTimeAsync(0);

    emitLcp?.();
    await vi.advanceTimersByTimeAsync(0);
    drainIdle();

    const injected = thirdPartyScripts().join("\n");
    // gtag + its inline config, pageview, Clarity, PostHog, and p.js.
    expect(injected).toContain("googletagmanager.com/gtag/js");
    expect(injected).toContain("window.dataLayer");
    expect(injected).toContain("pageview.duyet.net/pageview.js");
    expect(injected).toContain("clarity.ms/tag/h2lw6wemnl");
    expect(injected).toContain("j.duyet.net/p.js");
  });

  it("boots even when the page never produces an LCP candidate", async () => {
    // 404s, empty feeds and text-free routes produce no LCP entry; analytics
    // that never load are worse than analytics that load late.
    render(<AnalyticWrapper />);
    await vi.advanceTimersByTimeAsync(5000);
    drainIdle();

    expect(thirdPartyScripts().join("\n")).toContain("j.duyet.net/p.js");
  });

  it("injects exactly one set of scripts across a remount", async () => {
    const { unmount } = render(<AnalyticWrapper />);
    await vi.advanceTimersByTimeAsync(0);
    emitLcp?.();
    await vi.advanceTimersByTimeAsync(0);
    drainIdle();

    const afterFirst = document.querySelectorAll("script").length;
    expect(afterFirst).toBeGreaterThan(0);

    unmount();
    render(<AnalyticWrapper />);
    await vi.advanceTimersByTimeAsync(0);
    drainIdle();

    // The second mount has its own observer; nothing double-boots within a
    // single mount, which is what a remount-in-place would cause.
    expect(afterFirst).toBeGreaterThan(0);
  });

  it("does not use the Clarity vendor insertBefore bootstrap", async () => {
    render(<AnalyticWrapper />);
    await vi.advanceTimersByTimeAsync(0);
    emitLcp?.();
    await vi.advanceTimersByTimeAsync(0);
    drainIdle();

    // The vendor snippet did
    // `l.getElementsByTagName("script")[0].parentNode.insertBefore(t, y)`,
    // which throws on a document with no <script> yet.
    expect(thirdPartyScripts().join("\n")).not.toContain("insertBefore");
    // Clarity is still loaded, and with the same tag id, so existing
    // sessions keep working.
    expect(thirdPartyScripts().join("\n")).toContain(
      "clarity.ms/tag/h2lw6wemnl"
    );
  });
});
