import { useState } from "react";
import type { LlmCallRow } from "../../lib/system-queries";
import { ModelLogo } from "./ModelLogo";
import { RunAttemptRows } from "./RunAttemptRows";
import { RunStepList } from "./RunStepList";
import {
  formatSafeDetail,
  groupFailedAttempts,
  type StepState,
  type safeRunSteps,
  shortModel,
  stepState,
} from "./run-format";

type Step = ReturnType<typeof safeRunSteps>[number];

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

/** LLM calls carry a task, not a step. Steps sharing a task (translate and
 *  backfill-translate) show the same calls and say so. */
const STEP_TASK: Record<string, string> = {
  dedupe: "cluster",
  score: "score",
  "backfill-score": "score",
  translate: "translate",
  "backfill-translate": "translate",
  "qa-translations": "review",
  "review-suggestions": "review",
  "review-submissions": "review",
  tldr: "tldr",
  email: "mail",
};

/** Plain-words cause for step reasons that only name the symptom. */
const STEP_HINTS: { match: RegExp; hint: string }[] = [
  {
    match: /^\w[\w-]* step failed$/,
    hint: "The workflow engine failed this step, not the step's own code: usually a deploy restarted the run mid-step. TL;DR now retries once.",
  },
  {
    match: /chain exhausted/i,
    hint: "Every model in the fallback chain failed; the step kept a fallback result.",
  },
  {
    match: /batch_failed/i,
    hint: "A translate batch failed; the backfill step retries the missing rows on later runs.",
  },
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

function sharingSteps(name: string): string[] {
  const task = STEP_TASK[name];
  return Object.keys(STEP_TASK).filter(
    (other) => other !== name && STEP_TASK[other] === task
  );
}

function StepDetail({
  name,
  step,
  state,
  attempts,
}: {
  name: string;
  step: Step | undefined;
  state: NodeState;
  attempts: LlmCallRow[];
}) {
  const task = STEP_TASK[name];
  const calls = task ? attempts.filter((a) => a.task === task) : [];
  const failed = calls.filter((a) => !a.ok);
  const hint = step?.reason
    ? STEP_HINTS.find((h) => h.match.test(step.reason ?? ""))?.hint
    : undefined;
  const shared = task ? sharingSteps(name) : [];
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span
          className={`rounded border px-1.5 font-mono text-[10px] ${NODE_STYLE[state]}`}
        >
          {NODE_MARK[state]} {name}
        </span>
        <span className="text-foreground">
          {step ? formatSafeDetail(step.action, 160) : "not recorded"}
        </span>
      </div>
      {step?.reason ? (
        <p className="break-words text-muted-foreground">
          {formatSafeDetail(step.reason, 300)}
        </p>
      ) : null}
      {hint ? (
        <p className="rounded bg-muted/60 px-2 py-1 text-[11px] text-foreground">
          <span className="font-medium">Why: </span>
          {hint}
        </p>
      ) : null}
      {task ? (
        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            LLM · {task}
            {shared.length > 0 ? ` · shared with ${shared.join(", ")}` : ""}
          </p>
          {calls.length === 0 ? (
            <p className="text-muted-foreground">No LLM calls.</p>
          ) : (
            <>
              {failed.length > 0 ? (
                <ul className="space-y-0.5">
                  {groupFailedAttempts(failed).map((g) => (
                    <li
                      key={`${g.model}-${g.errorCode}-${g.error}`}
                      className="flex items-baseline gap-2"
                    >
                      <span className="shrink-0 rounded bg-destructive/10 px-1.5 font-mono text-[10px] tabular-nums text-destructive">
                        {g.count}×
                      </span>
                      <span className="min-w-0 break-words">
                        <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                          <ModelLogo model={g.model} />
                          {shortModel(g.model)}
                        </span>
                        {" · "}
                        {g.error}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <RunAttemptRows attempts={calls} lang="en" />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** The pipeline as a compact node diagram. Click a node for its action,
 *  reason, a plain cause for known failures, and its own LLM calls. */
export function RunWorkflowGraph({
  steps,
  attempts = [],
}: {
  steps: ReturnType<typeof safeRunSteps>;
  attempts?: LlmCallRow[];
}) {
  const byName = new Map(steps.map((step) => [step.name, step]));
  const stateOf = (name: string): NodeState => {
    const step = byName.get(name);
    return step ? stepState(step) : "missing";
  };
  // Open on the first problem so the reason is visible without a click.
  const firstProblem = PHASES.flatMap((p) => p.steps).find((name) => {
    const state = stateOf(name);
    return state === "failed" || state === "degraded";
  });
  const [selected, setSelected] = useState<string | null>(firstProblem ?? null);
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="space-y-2">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
        {PHASES.map((phase, phaseIndex) => (
          <li key={phase.label} className="flex items-center gap-1.5">
            {phaseIndex > 0 ? (
              <span aria-hidden className="text-muted-foreground">
                →
              </span>
            ) : null}
            <span className="flex items-center gap-1 rounded-md border border-border/60 py-1 pl-1.5 pr-1">
              <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {phase.label}
              </span>
              {phase.steps.map((name) => {
                const step = byName.get(name);
                const state = stateOf(name);
                const calls = STEP_TASK[name]
                  ? attempts.filter((a) => a.task === STEP_TASK[name]).length
                  : 0;
                return (
                  <button
                    key={name}
                    type="button"
                    data-state={state}
                    aria-pressed={selected === name}
                    title={`${name}: ${
                      step
                        ? [step.action, step.reason]
                            .filter(Boolean)
                            .map((part) => formatSafeDetail(part, 200))
                            .join(" — ")
                        : "not recorded"
                    }`}
                    onClick={() =>
                      setSelected((current) => (current === name ? null : name))
                    }
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                      NODE_STYLE[state]
                    } ${selected === name ? "ring-2 ring-ring/60" : ""}`}
                  >
                    <span aria-hidden>{NODE_MARK[state]}</span>
                    {name}
                    {calls > 0 ? (
                      <span className="opacity-70">·{calls}</span>
                    ) : null}
                    <span className="sr-only">: {state}</span>
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ol>

      {selected ? (
        <StepDetail
          name={selected}
          step={byName.get(selected)}
          state={stateOf(selected)}
          attempts={attempts}
        />
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Click a step for its details and LLM calls.
        </p>
      )}

      <button
        type="button"
        aria-expanded={showAll}
        className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => setShowAll((value) => !value)}
      >
        {showAll ? "Hide all steps" : "All steps"}
      </button>
      {showAll ? <RunStepList steps={steps} /> : null}
    </div>
  );
}
