import { Badge, Skeleton } from "@aidr/ui";
import { anyrouterModelUrl } from "../../lib/anyrouter";
import type { ModelChains } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData } from "./CardData";
import { API } from "./endpoints";

function ModelChip({ label, models }: { label: string; models: string[] }) {
  const lead = models[0];
  return (
    <Badge variant="secondary" className="h-6 gap-1 px-2 font-normal">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {lead ? (
        <a
          href={anyrouterModelUrl(lead)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] text-foreground underline-offset-2 hover:text-accent hover:underline"
          title={`Open ${lead} on AnyRouter`}
        >
          {lead}
        </a>
      ) : (
        <span className="font-mono text-[11px]">—</span>
      )}
      {models.length > 1 ? (
        <span className="text-[10px] text-muted-foreground">
          +{models.length - 1}
        </span>
      ) : null}
    </Badge>
  );
}

export function ModelChips() {
  const state = useSystemData<{ models: ModelChains }>(API.models);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CardData state={state} skeleton={<Skeleton className="h-6 w-48" />}>
        {(d) => (
          <>
            <ModelChip label="score" models={d.models.scoring} />
            <ModelChip label="translate" models={d.models.translation} />
          </>
        )}
      </CardData>
      <a
        href="https://anyrouter.dev/?ref=aidr.today"
        target="_blank"
        rel="noopener"
        className="text-[11px] font-medium text-accent underline underline-offset-2 hover:no-underline"
      >
        AnyRouter
      </a>
    </div>
  );
}
