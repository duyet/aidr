import { Badge } from "@aidr/ui";
import { anyrouterModelUrl } from "../../lib/anyrouter";
import { GITHUB_ALGORITHM_PATH, GITHUB_ALGORITHM_URL } from "../../lib/site";
import type { ModelChains } from "../../lib/system-queries";

interface RankingExplainerProps {
  models: ModelChains;
}

/** Surfaces the live ranking formula and model chains for operators. This is
 *  the single place the chains render on this tab — the AnyRouter card beside
 *  it deliberately repeats nothing. */
export function RankingExplainer({ models }: RankingExplainerProps) {
  return (
    <div className="space-y-2.5 text-sm">
      <p className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-foreground">
        rankScore = importance × qualityFactor × decay × engagement × sources
      </p>
      <ul className="grid gap-x-4 gap-y-1 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-2">
        <li>
          <span className="font-medium text-foreground">qualityFactor</span> =
          0.6 + 0.4 × (quality / 10)
        </li>
        <li>
          <span className="font-medium text-foreground">decay</span> =
          exp(−ageHours / 36)
        </li>
        <li>
          <span className="font-medium text-foreground">engagement</span> = 1 +
          log10(1 + points + 0.5 × comments)
        </li>
        <li>
          <span className="font-medium text-foreground">sources</span> = 1 +
          0.12 × min(sourceCount, 8)
        </li>
      </ul>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Same-story outlets merge first; corroboration lifts rank and trending.
        Full pipeline:{" "}
        <a
          href={GITHUB_ALGORITHM_URL}
          className="font-medium text-accent underline underline-offset-2 hover:no-underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {GITHUB_ALGORITHM_PATH}
        </a>
      </p>

      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        <ModelChain label="scoring" chain={models.scoring} />
        <ModelChain label="translation" chain={models.translation} />
        <ModelChain label="tldr" chain={models.tldr} />
        <ModelChain label="decisions" chain={models.decisions} />
      </div>
    </div>
  );
}

function ModelChain({ label, chain }: { label: string; chain: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {chain.length === 0 ? (
        <span className="font-mono text-xs text-muted-foreground">—</span>
      ) : (
        chain.map((model, i) => (
          <span
            key={`${label}-${model}-${i}`}
            className="inline-flex items-center gap-1"
          >
            {i > 0 ? (
              <span className="text-xs text-muted-foreground" aria-hidden>
                →
              </span>
            ) : null}
            <a
              href={anyrouterModelUrl(model)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={`Open ${model} on AnyRouter`}
            >
              <Badge
                variant="outline"
                className="font-mono text-[10px] font-normal transition-colors hover:border-accent hover:text-accent"
              >
                {model}
              </Badge>
            </a>
          </span>
        ))
      )}
    </div>
  );
}
