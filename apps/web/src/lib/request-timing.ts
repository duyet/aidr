/**
 * Per-request stage marks, reported as a `Server-Timing` header so a
 * production miss can be read off `curl -D -` next to `wrangler tail`'s CPU
 * and wall time. Each mark names the stage that just ended; its `dur` is the
 * time since the previous mark. Marks live in AsyncLocalStorage, so a loader
 * or query deep inside the Start handler can add one without a parameter.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export const SERVER_TIMING_HEADER = "server-timing";

type Marks = { startedAt: number; lastAt: number; stages: string[] };

const marks = new AsyncLocalStorage<Marks>();

const isolateStartedAt = Date.now();
let isolateRequests = 0;

/** Run `fn` with a fresh mark list. Nested calls keep the outer list. */
export function withRequestTiming<T>(fn: () => Promise<T>): Promise<T> {
  if (marks.getStore()) return fn();
  isolateRequests += 1;
  const now = Date.now();
  return marks.run({ startedAt: now, lastAt: now, stages: [] }, fn);
}

/** End the stage `name` now. A no-op outside `withRequestTiming`. */
export function markStage(name: string): void {
  const store = marks.getStore();
  if (!store) return;
  const now = Date.now();
  store.stages.push(`${name};dur=${now - store.lastAt}`);
  store.lastAt = now;
}

/**
 * Append the stages seen so far to `response`. `iso` carries this isolate's
 * request count in `desc` and its age in `dur`, so a slow miss can be told
 * apart from a cold isolate.
 */
export function withServerTiming(response: Response): Response {
  const store = marks.getStore();
  if (!store) return response;
  const now = Date.now();
  const stages = [
    ...store.stages,
    `total;dur=${now - store.startedAt}`,
    `iso;desc=${isolateRequests};dur=${now - isolateStartedAt}`,
  ];
  const out = new Response(response.body, response);
  out.headers.append(SERVER_TIMING_HEADER, stages.join(", "));
  return out;
}
