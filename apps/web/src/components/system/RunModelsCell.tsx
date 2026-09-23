import { anyrouterModelUrl } from "../../lib/anyrouter";
import type { RunLlmSummary } from "../../lib/system-queries";
import { shortModel } from "./run-format";

export function RunModelsCell({ llm }: { llm?: RunLlmSummary }) {
  if (!llm || llm.models.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const chainTitle = llm.models.join(" → ");
  return (
    <div className="min-w-0 max-w-[16rem]">
      <div
        className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-xs text-foreground"
        title={chainTitle}
      >
        {llm.models.map((model, i) => (
          <span
            key={`${model}-${i}`}
            className="inline-flex min-w-0 items-center gap-1"
          >
            {i > 0 ? (
              <span className="shrink-0 text-muted-foreground" aria-hidden>
                →
              </span>
            ) : null}
            <a
              href={anyrouterModelUrl(model)}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate underline-offset-2 hover:text-accent hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {shortModel(model)}
            </a>
          </span>
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground">
        {llm.calls} call{llm.calls === 1 ? "" : "s"}
        {llm.failures > 0 ? ` · ${llm.failures} fail` : ""}
        {llm.models.length > 1 ? " · fallback" : ""}
      </span>
    </div>
  );
}
