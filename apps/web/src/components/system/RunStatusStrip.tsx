import type { WorkflowRunRow } from "../../lib/system-queries";

interface RunStatusStripProps {
  runs: WorkflowRunRow[];
  emptyLabel: string;
}

/** Uptime-style strip of run outcomes, oldest to newest, with an error-rate summary. */
export function RunStatusStrip({ runs, emptyLabel }: RunStatusStripProps) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const chrono = [...runs].reverse();
  const errorCount = chrono.filter((r) => r.error).length;
  const errorRate = (errorCount / chrono.length) * 100;

  return (
    <div>
      <div className="flex h-8 items-stretch gap-0.5">
        {chrono.map((r) => (
          <div
            key={r.id}
            // Hover is a declared shade, not an opacity fade: element opacity
            // composites the bar toward the page background, so the hovered
            // state had no assertable color and fell under the 3:1 non-text
            // boundary on the light reader backgrounds. The shade darkens in
            // light mode and lightens in dark so it always moves away from the
            // surface; both are checked in src/lib/contrast-tokens.test.ts.
            className={`flex-1 rounded-sm transition-colors ${
              r.error
                ? "bg-red-500 hover:bg-red-700 dark:hover:bg-red-400"
                : "bg-emerald-500/70 hover:bg-emerald-700 dark:hover:bg-emerald-400"
            }`}
            title={`${r.started_at ? new Date(r.started_at * 1000).toLocaleString("en-US") : ""}: ${
              r.error ?? "OK"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums text-foreground">
          {errorRate.toFixed(0)}%
        </span>{" "}
        error rate over last {chrono.length} runs (
        <span className="font-mono tabular-nums text-foreground">
          {errorCount}
        </span>{" "}
        failed)
      </p>
    </div>
  );
}
