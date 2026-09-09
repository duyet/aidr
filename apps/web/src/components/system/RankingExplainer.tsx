import { Badge, Separator } from "@aidr/ui";
import { anyrouterModelUrl } from "../../lib/anyrouter";
import { GITHUB_ALGORITHM_PATH, GITHUB_ALGORITHM_URL } from "../../lib/site";
import type { ModelChains } from "../../lib/system-queries";

interface RankingExplainerProps {
  models: ModelChains;
}

/** Surfaces the live ranking formula and model chains for operators. */
export function RankingExplainer({ models }: RankingExplainerProps) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-mono text-xs leading-relaxed text-foreground">
        rankScore = importance × qualityFactor × decay × engagement × sources
      </p>
      <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
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
      <p className="text-xs text-muted-foreground">
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

      <Separator />

      <div className="space-y-2">
        <ModelChain label="scoring" chain={models.scoring} />
        <ModelChain label="translation" chain={models.translation} />
        <ModelChain label="tldr" chain={models.tldr} />
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
