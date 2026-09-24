import { Skeleton, TabsContent } from "@aidr/ui";
import { categoryLabel, statusLabel } from "../../lib/lang";
import type { SystemActivity, SystemOverview } from "../../lib/system-queries";
import { categoryColor } from "../../lib/topic-color";
import type { Lang } from "../../lib/types";
import { useSystemData } from "../../lib/use-system-stats";
import { BarList } from "./BarList";
import { CardData, CardSkeleton } from "./CardData";
import { ChartCard } from "./ChartCard";
import { CategoryDonut } from "./DitherCharts";
import { API } from "./endpoints";

function CategoryShareCard() {
  const state = useSystemData<SystemActivity>(API.activity);
  return (
    <ChartCard title="Category share" subtitle="Top categories">
      <CardData state={state} skeleton={<CardSkeleton tall />}>
        {(a) => (
          <CategoryDonut data={a.itemsByCategory} emptyLabel="No data yet." />
        )}
      </CardData>
    </ChartCard>
  );
}

function StatusCard({ lang }: { lang: Lang }) {
  const state = useSystemData<SystemActivity>(API.activity);
  return (
    <ChartCard title="By status" subtitle="Pipeline outcome">
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(a) => (
          <BarList
            data={a.itemsByStatus.map((s) => ({
              ...s,
              name: statusLabel(s.name, lang),
            }))}
            emptyLabel="No data yet."
          />
        )}
      </CardData>
    </ChartCard>
  );
}

function SourceVolumeCard() {
  const state = useSystemData<SystemActivity>(API.activity);
  return (
    <ChartCard title="By source" subtitle="Top 10 story counts">
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(a) => <BarList data={a.itemsBySource} emptyLabel="No data yet." />}
      </CardData>
    </ChartCard>
  );
}

function CatalogCard() {
  const state = useSystemData<SystemOverview>(API.overview);
  return (
    <ChartCard title="Catalog" subtitle="Translations, digests, sources">
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(o) => (
          <dl className="divide-y divide-border text-sm">
            {(
              [
                ["Translations", o.totals.translations],
                ["AI;DR digests", o.totals.tldrSnapshots],
                ["Latest digest", o.latestTldrDate ?? "—"],
                ["Configured sources", o.totals.sources],
                ["Key-source citations", o.totals.itemSourcesRows],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 py-1.5 first:pt-0 last:pb-0"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardData>
    </ChartCard>
  );
}

function ByCategoryCard({ lang }: { lang: Lang }) {
  const state = useSystemData<SystemActivity>(API.activity);
  return (
    <ChartCard title="By category" subtitle="Top 10" className="md:col-span-2">
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(a) => (
          <BarList
            data={a.itemsByCategory.map((c) => ({
              ...c,
              name: categoryLabel(c.name, lang),
              color: categoryColor(c.name),
            }))}
            emptyLabel="No data yet."
          />
        )}
      </CardData>
    </ChartCard>
  );
}

export function ContentTab({ lang }: { lang: Lang }) {
  return (
    <TabsContent value="content" className="mt-0">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CategoryShareCard />
        <StatusCard lang={lang} />
        <SourceVolumeCard />
        <CatalogCard />
        <ByCategoryCard lang={lang} />
      </div>
    </TabsContent>
  );
}
