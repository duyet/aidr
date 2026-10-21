/**
 * Per-request stage marks, reported as a `Server-Timing` header. Each mark
 * names the stage that just ended; its `dur` is the wall time since the
 * previous mark. Marks live in AsyncLocalStorage, so a loader or query deep
 * inside the Start handler can add one without a parameter.
 *
 * In production the Workers clock only advances when I/O completes, so a
 * stage is the wall time split at I/O boundaries: a `dur` is the I/O waited
 * on inside that stage, and CPU spent between marks never shows. Mark only
 * where an I/O wait ends: a mark after pure CPU reads 0. CPU per request
 * comes from `wrangler tail`'s `cpuTime`, not from these stages. Local
 * workerd and vitest run a live clock, so their numbers include CPU and do
 * not match production.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export const SERVER_TIMING_HEADER = "server-timing";

type Marks = { startedAt: number; lastAt: number; stages: string[] };

const marks = new AsyncLocalStorage<Marks>();

/** Stamped on the first request: module load runs before the clock starts. */
let isolateFirstRequestAt: number | undefined;
let isolateRequests = 0;

export function withRequestTiming<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  isolateFirstRequestAt ??= now;
  isolateRequests += 1;
  return marks.run({ startedAt: now, lastAt: now, stages: [] }, fn);
}

/**
 * Run `fn` with no request's mark list, for work that outlives the response
 * (a `waitUntil` render) and must not write marks into it.
 */
export function withoutRequestTiming<T>(fn: () => T): T {
  return marks.exit(fn);
}

export function markStage(name: string): void {
  const store = marks.getStore();
  if (!store) return;
  const now = Date.now();
  store.stages.push(`${name};dur=${now - store.lastAt}`);
  store.lastAt = now;
}

/**
 * End the stage `name` now, but report it only when I/O was waited on since
 * the previous mark. For a catch-all stage that is pure CPU on some routes
 * (the homepage names its D1 wait itself), where a `dur=0` would mislead.
 */
export function markStageIfWaited(name: string): void {
  const store = marks.getStore();
  if (!store || Date.now() === store.lastAt) return;
  markStage(name);
}

/**
 * Append the stages seen so far to `response`. `iso` carries this isolate's
 * request count in `desc` and the time since its first request in `dur`, so
 * a slow miss can be told apart from a cold isolate.
 */
export function withServerTiming(response: Response): Response {
  const store = marks.getStore();
  if (!store) return response;
  const now = Date.now();
  const stages = [
    ...store.stages,
    `total;dur=${now - store.startedAt}`,
    `iso;desc=${isolateRequests};dur=${now - (isolateFirstRequestAt ?? now)}`,
  ];
  const out = new Response(response.body, response);
  out.headers.append(SERVER_TIMING_HEADER, stages.join(", "));
  return out;
}
