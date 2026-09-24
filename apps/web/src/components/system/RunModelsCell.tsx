import { anyrouterModelUrl, isValidAnyrouterModel } from "../../lib/anyrouter";
import type { RunLlmSummary } from "../../lib/system-queries";
import { formatSafeDetail, shortModel } from "./run-format";

export function RunModelsCell({ llm }: { llm?: RunLlmSummary }) {
  if (!llm || llm.models.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const modelsTitle = llm.models
    .map((model) => formatSafeDetail(model, 160))
    .join(" · ");
  return (
    <div className="min-w-0 max-w-[16rem]">
      <div
        className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-xs text-foreground"
        title={modelsTitle}
      >
        {llm.models.map((model, i) => (
          <span
            key={`${model}-${i}`}
            className="inline-flex min-w-0 items-center gap-1"
          >
            {i > 0 ? (
              <span className="shrink-0 text-muted-foreground" aria-hidden>
                ·
              </span>
            ) : null}
            {isValidAnyrouterModel(model) ? (
              <a
                href={anyrouterModelUrl(model)}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate underline-offset-2 hover:text-accent hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {shortModel(formatSafeDetail(model, 160))}
              </a>
            ) : (
              <span className="truncate" title={model}>
                {shortModel(formatSafeDetail(model, 160))}
              </span>
            )}
          </span>
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground">
        {llm.calls} call{llm.calls === 1 ? "" : "s"}
        {llm.failures > 0 ? ` · ${llm.failures} fail` : ""}
      </span>
    </div>
  );
}
