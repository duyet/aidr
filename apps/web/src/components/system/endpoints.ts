/** One small endpoint per section; each is a single batched D1 round-trip.
 * Cards call them directly — concurrent calls share one request via
 * useSystemData's inflight cache. */
export const API = {
  models: "/api/system/models",
  overview: "/api/system/overview",
  activity: "/api/system/activity",
  runs: "/api/system/runs",
  llm: "/api/system/llm",
  sources: "/api/system/sources",
} as const;
