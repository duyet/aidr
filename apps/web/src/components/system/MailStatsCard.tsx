import { Skeleton } from "@aidr/ui";
import type { SystemMailStats } from "../../lib/mail-stats-query";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";

const LANG_LABEL: Record<string, string> = {
  vi: "Vietnamese",
  en: "English",
};

const COLUMNS = [
  ["sent", "Sent"],
  ["failed", "Failed"],
  ["unsubscribed", "Unsubscribed"],
] as const;

export function MailStatsCard() {
  const state = useSystemData<SystemMailStats>(API.mailStats);
  return (
    <ChartCard
      title="Digest delivery"
      subtitle="Sent, failed and unsubscribed by language, last 28 days"
    >
      <CardData state={state} skeleton={<Skeleton className="h-20 w-full" />}>
        {(d) =>
          d.by_lang.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No digest sends recorded yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {d.by_lang.map((row) => (
                <li key={row.lang} className="text-xs">
                  <span className="font-medium text-muted-foreground">
                    {LANG_LABEL[row.lang] ?? row.lang}
                  </span>
                  <dl className="mt-1 grid grid-cols-3 gap-2">
                    {COLUMNS.map(([key, label]) => (
                      <div key={key}>
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="text-sm font-semibold tabular-nums">
                          {row[key]}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          )
        }
      </CardData>
    </ChartCard>
  );
}
