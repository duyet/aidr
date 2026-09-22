import { Skeleton } from "@aidr/ui";
import { ExternalLink } from "lucide-react";
import { anyrouterModelUrl } from "../../lib/anyrouter";
import type { ModelChains } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData } from "./CardData";
import { API } from "./endpoints";

const MODEL_TASKS = [
  { key: "scoring", label: "score" },
  { key: "translation", label: "translate" },
  { key: "tldr", label: "tldr" },
  { key: "decisions", label: "decisions" },
] as const;

function hopSummary(rest: string[]): { text: string; title: string } {
  if (rest.length === 0) {
    return { text: "—", title: "No fallback models" };
  }
  const hops = rest.length === 1 ? "1 hop" : `${rest.length} hops`;
  const fallbacks =
    rest.length === 1 ? "1 fallback" : `${rest.length} fallbacks`;
  return {
    text: hops,
    title: `${fallbacks}: ${rest.join(" → ")}`,
  };
}

/** Pipeline header: one AnyRouter group. Each task stacks label, lead
 * model, and hop depth instead of a pill row. */
export function ModelAttribution() {
  const state = useSystemData<{ models: ModelChains }>(API.models);
  return (
    <CardData
      state={state}
      skeleton={<Skeleton className="h-[4.5rem] w-full max-w-xl" />}
    >
      {(d) => <AttributionView models={d.models} />}
    </CardData>
  );
}

function AttributionView({ models }: { models: ModelChains }) {
  return (
    <section
      aria-label="Pipeline models"
      className="flex max-w-full flex-col gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:gap-4"
    >
      <a
        href="https://anyrouter.dev/?ref=aidr.today"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit shrink-0 items-center gap-1 text-[11px] font-medium text-accent underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Powered by AnyRouter
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
      <dl className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-2 sm:border-l sm:border-border sm:pl-4">
        {MODEL_TASKS.map(({ key, label }) => {
          const [lead, ...rest] = models[key];
          const hops = hopSummary(rest);
          const chain = lead
            ? [lead, ...rest].join(" → ")
            : "No model configured";
          return (
            <div key={key} className="min-w-0 max-w-full">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </dt>
              <dd className="font-mono text-xs leading-snug text-foreground [overflow-wrap:anywhere]">
                {lead ? (
                  <a
                    href={anyrouterModelUrl(lead)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-2 hover:text-accent hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={chain}
                  >
                    {lead}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
              <dd
                className="text-[10px] leading-tight tabular-nums text-muted-foreground"
                title={hops.title}
              >
                {hops.text}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
