import { AlertTriangle, Check, Circle } from "lucide-react";
import { formatSafeDetail, type safeRunSteps, stepState } from "./run-format";

/** Workflow steps with an ok / skipped / failed marker per step. */
export function RunStepList({
  steps,
}: {
  steps: ReturnType<typeof safeRunSteps>;
}) {
  return (
    <ol className="space-y-1.5 text-xs">
      {steps.map((step, index) => {
        const action = formatSafeDetail(step.action, 160);
        const state = stepState(step);
        const isSkipped = state === "skipped";
        const isFailure = state === "failed" || state === "degraded";
        return (
          <li
            key={`${step.name}-${index}`}
            className="flex min-w-0 items-start gap-1.5"
          >
            {isFailure ? (
              <AlertTriangle
                className={`mt-0.5 h-3 w-3 shrink-0 ${
                  state === "failed" ? "text-destructive" : "text-orange-500"
                }`}
                aria-hidden
              />
            ) : isSkipped ? (
              <Circle
                className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
                aria-hidden
              />
            ) : (
              <Check
                className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
            )}
            <span className="min-w-0">
              <span className="font-medium text-foreground">
                {formatSafeDetail(step.name, 80)}
              </span>
              <span className="text-muted-foreground"> — {action}</span>
              {step.reason ? (
                <span className="block text-[11px] text-muted-foreground">
                  {formatSafeDetail(step.reason, 200)}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
