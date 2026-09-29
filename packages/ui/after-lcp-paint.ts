/**
 * Run a callback once the Largest Contentful Paint has happened, or once the
 * page has clearly stopped producing LCP candidates — whichever comes first.
 *
 * Why this exists: issue #229 measured a 2,420 ms LCP element render delay
 * with 1,648 ms of total blocking time, and the third-party analytics
 * bootstraps in Analytics.tsx were a big part of it. They are all injected
 * from a plain `useEffect`, which React runs during the commit phase — the
 * same main thread the paint the visitor is waiting for needs. Nothing they
 * do affects first paint.
 *
 * `requestIdleCallback` alone is not enough: it can fire before the first
 * paint on a page that never produces an LCP candidate (an empty feed, a
 * 404, a route with no text), and a callback that never runs means the
 * analytics never boot at all. So the two are raced, and a wall-clock cap
 * guarantees the bootstraps always land.
 */

/** Wall-clock cap. Long enough to be well past LCP, short enough that a page
 * with no LCP candidate still reports. */
const LCP_WAIT_CAP_MS = 4000;

/** Idle cap, so a busy main thread does not starve analytics indefinitely. */
const IDLE_TIMEOUT_MS = 2000;

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      cb: (deadline: {
        didTimeout: boolean;
        timeRemaining: () => number;
      }) => void,
      options?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

/**
 * `largest-contentful-paint` is not in TypeScript's PerformanceEntry union,
 * but that is the only entry type whose `renderTime` is the moment the
 * element actually painted.
 */
interface LargestContentfulPaintEntry extends PerformanceEntry {
  renderTime: number;
  loadTime: number;
}

/** Resolves on the first LCP candidate, or after `capMs`. Never rejects. */
function firstLcpPaintSettled(capMs: number): Promise<"lcp" | "cap"> {
  if (
    typeof window === "undefined" ||
    typeof PerformanceObserver === "undefined"
  ) {
    return Promise.resolve("cap");
  }
  return new Promise((resolve) => {
    let done = false;
    let observer: PerformanceObserver | undefined;
    const finish = (reason: "lcp" | "cap") => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      observer?.disconnect();
      resolve(reason);
    };
    const timer = setTimeout(() => finish("cap"), capMs);

    try {
      observer = new PerformanceObserver((list) => {
        // buffered:true replays the entry that already fired, so this
        // resolves immediately when LCP happened before we subscribed.
        for (const raw of list.getEntries()) {
          const entry = raw as LargestContentfulPaintEntry;
          // A finalised candidate (user input, or the browser closing the
          // window) still counts as "the page has painted".
          if (entry.renderTime || entry.loadTime || entry.startTime) {
            finish("lcp");
            return;
          }
        }
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // PerformanceObserver without LCP support (older Safari): the cap runs.
    }
  });
}

export interface AfterLcpPaintOptions {
  /** Overridable for tests. */
  capMs?: number;
}

/**
 * Schedules `cb` after the LCP paint, on idle time. Returns a cancel
 * function; use it from an effect cleanup so a remount cannot double-boot the
 * analytics.
 */
export function afterLcpPaint(
  cb: () => void,
  options: AfterLcpPaintOptions = {}
): () => void {
  if (typeof window === "undefined") return () => {};

  let cancelled = false;
  let idleHandle: number | undefined;
  let frameHandle: number | undefined;
  const idleWindow = window as IdleWindow;

  const run = () => {
    if (cancelled) return;
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleHandle = idleWindow.requestIdleCallback(
        () => {
          if (!cancelled) cb();
        },
        { timeout: IDLE_TIMEOUT_MS }
      );
      return;
    }
    // No requestIdleCallback: a rAF runs after the current frame's rendering
    // steps, which is the same "not before the paint" guarantee.
    frameHandle = requestAnimationFrame(() => {
      if (!cancelled) cb();
    });
  };

  void firstLcpPaintSettled(options.capMs ?? LCP_WAIT_CAP_MS).then(() => {
    if (!cancelled) run();
  });

  return () => {
    cancelled = true;
    if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
    if (frameHandle !== undefined) cancelAnimationFrame(frameHandle);
  };
}
