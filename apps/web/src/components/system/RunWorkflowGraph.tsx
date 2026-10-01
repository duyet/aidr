import {
  formatSafeDetail,
  type StepState,
  type safeRunSteps,
  stepState,
} from "./run-format";

/** Pipeline order from worker/workflow.ts, grouped the way ALGORITHM.md
 *  describes it. A step a run never recorded still gets a node, so a run
 *  that died early shows where it stopped. */
const PHASES: { label: string; steps: string[] }[] = [
  { label: "Ingest", steps: ["fetch", "dedupe", "score", "translate"] },
  {
    label: "Backfill",
    steps: ["backfill-content", "backfill-translate", "backfill-score"],
  },
  {
    label: "Review",
    steps: ["qa-translations", "review-suggestions", "review-submissions"],
  },
  { label: "Publish", steps: ["tldr", "email", "notify"] },
];

type NodeState = StepState | "missing";

const NODE_STYLE: Record<NodeState, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  skipped: "border-border bg-muted/40 text-muted-foreground",
  degraded:
    "border-orange-500/50 bg-orange-500/10 text-orange-800 dark:text-orange-300",
  failed: "border-destructive/60 bg-destructive/10 text-destructive",
  missing: "border-dashed border-border text-muted-foreground/60",
};

const NODE_MARK: Record<NodeState, string> = {
  ok: "✓",
  skipped: "–",
  degraded: "!",
  failed: "✕",
  missing: "·",
};

export function RunWorkflowGraph({
  steps,
}: {
  steps: ReturnType<typeof safeRunSteps>;
}) {
  const byName = new Map(steps.map((step) => [step.name, step]));
  return (
    <ol className="flex flex-wrap items-stretch gap-2">
      {PHASES.map((phase, phaseIndex) => (
        <li key={phase.label} className="flex items-stretch gap-2">
          {phaseIndex > 0 ? (
            <span aria-hidden className="self-center text-muted-foreground">
              →
            </span>
          ) : null}
          <div className="rounded-md border border-border/60 p-1.5">
            <p className="mb-1 px-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {phase.label}
            </p>
            <ol className="flex flex-wrap gap-1">
              {phase.steps.map((name) => {
                const step = byName.get(name);
                const state: NodeState = step ? stepState(step) : "missing";
                const detail = step
                  ? [step.action, step.reason]
                      .filter(Boolean)
                      .map((part) => formatSafeDetail(part, 200))
                      .join(" — ")
                  : "not recorded";
                return (
                  <li
                    key={name}
                    data-state={state}
                    title={`${name}: ${detail}`}
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] ${NODE_STYLE[state]}`}
                  >
                    <span aria-hidden>{NODE_MARK[state]}</span>
                    {name}
                    <span className="sr-only">: {state}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </li>
      ))}
    </ol>
  );
}
