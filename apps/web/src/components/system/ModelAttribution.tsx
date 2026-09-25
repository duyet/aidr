import { Card, CardContent, CardTitle, Skeleton } from "@aidr/ui";
import { ExternalLink, FileText, Gauge, Languages, Scale } from "lucide-react";
import { useId } from "react";
import { anyrouterModelUrl } from "../../lib/anyrouter";
import type { ModelChains } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { API } from "./endpoints";

const MODEL_TASKS = [
  { key: "scoring", label: "Score", Icon: Gauge },
  { key: "translation", label: "Translate", Icon: Languages },
  { key: "tldr", label: "TL;DR", Icon: FileText },
  { key: "decisions", label: "Decisions", Icon: Scale },
] as const;

/** Count + correctly inflected noun: `1 fallback hop`, `2 fallback hops`. */
function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

interface HopSummary {
  /** Visible pill text: `direct`, `1 hop`, `2 hops`. */
  text: string;
  /** Hover title with the configured fallback model ids. */
  title: string;
  /** Screen-reader phrase; must agree with the visible `text` semantics. */
  spoken: string;
  fallbackCount: number;
}

function hopSummary(chain: string[]): HopSummary {
  const fallbackCount = Math.max(0, chain.length - 1);
  if (fallbackCount === 0) {
    return {
      text: "direct",
      title: chain.length ? "No fallback models" : "No model configured",
      // Never announce "0 fallback hops": the visible pill reads `direct`.
      spoken: chain.length
        ? "direct, no fallback models"
        : "no model configured",
      fallbackCount,
    };
  }
  return {
    text: counted(fallbackCount, "hop", "hops"),
    title: `${counted(fallbackCount, "fallback", "fallbacks")}: ${chain
      .slice(1)
      .join(" → ")}`,
    spoken: counted(fallbackCount, "fallback hop", "fallback hops"),
    fallbackCount,
  };
}

/** Public model routing summary; only configured model ids are surfaced. */
export function ModelAttribution() {
  const state = useSystemData<{ models: ModelChains }>(API.models);

  if (state.data) {
    return <AttributionView models={state.data.models} />;
  }
  if (state.error) {
    return (
      <Card className="min-w-0 border-border shadow-none">
        <CardContent className="p-4">
          <div role="status" aria-live="polite" className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Model routes unavailable
            </p>
            <p className="text-xs text-muted-foreground">
              The public AnyRouter configuration could not be loaded.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <section
      aria-busy="true"
      aria-label="Loading model attribution"
      className="min-w-0"
    >
      <Skeleton className="h-[10.5rem] w-full" />
    </section>
  );
}

export function AttributionView({ models }: { models: ModelChains }) {
  // Per-instance id: the card is exported and can be rendered more than once,
  // so a hardcoded id would duplicate and break every `aria-labelledby`.
  const titleId = useId();

  return (
    <Card className="min-w-0 overflow-hidden border-border shadow-none">
      <CardContent className="p-3 sm:p-4">
        <section aria-labelledby={titleId}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle
                id={titleId}
                className="font-sans text-sm font-semibold tracking-tight text-foreground"
              >
                Powered by AnyRouter
              </CardTitle>
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                Lead model + fallback depth · public config only
              </p>
            </div>
            <a
              href="https://anyrouter.dev/?ref=aidr.today"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open AnyRouter in a new tab"
              className="inline-flex shrink-0 items-center gap-1 rounded-sm text-[11px] font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Explore AnyRouter
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>

          <dl
            aria-label="Pipeline model attribution"
            className="mt-3 grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4"
          >
            {MODEL_TASKS.map(({ key, label, Icon }) => {
              const chain = models[key] ?? [];
              const [lead, ...fallbacks] = chain;
              const hops = hopSummary(chain);
              const fullChain = chain.length
                ? chain.join(" → ")
                : "No model configured";
              return (
                <div
                  key={key}
                  className="min-w-0 rounded-lg border border-border/80 bg-muted/30 p-2.5"
                >
                  <div className="flex min-w-0 items-center justify-between gap-1.5">
                    <dt className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Icon
                        className="h-3 w-3 shrink-0 text-accent"
                        aria-hidden
                      />
                      <span className="truncate">{label}</span>
                    </dt>
                    <dd
                      title={chain.length ? hops.title : undefined}
                      className="shrink-0 rounded-full border border-border/80 px-1.5 py-0.5 text-[9px] leading-none tabular-nums text-muted-foreground"
                    >
                      {chain.length ? hops.text : "unavailable"}
                    </dd>
                  </div>
                  <dd className="mt-2 min-w-0 font-mono text-xs font-medium leading-snug text-foreground [overflow-wrap:anywhere]">
                    {lead ? (
                      <a
                        href={anyrouterModelUrl(lead)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={fullChain}
                        aria-label={`${label} lead model ${lead}, ${hops.spoken}`}
                        className="rounded-sm underline-offset-2 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {lead}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">
                        Not configured
                      </span>
                    )}
                  </dd>
                  <dd className="mt-1 min-w-0 text-[10px] leading-tight text-muted-foreground">
                    {fallbacks.length
                      ? `${counted(
                          fallbacks.length,
                          "fallback",
                          "fallbacks"
                        )} after lead`
                      : lead
                        ? "No fallback configured"
                        : "No model source available"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      </CardContent>
    </Card>
  );
}
