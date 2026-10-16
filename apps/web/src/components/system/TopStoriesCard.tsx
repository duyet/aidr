import { Skeleton } from "@aidr/ui";
import {
  type SystemReads,
  TOP_STORIES_MIN_OPENS,
  TOP_STORIES_MIN_OPENS_BY_CHANNEL,
  TOP_STORIES_WINDOW_DAYS,
} from "../../lib/reads-query";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";

const SMALL_CHANNEL_NOTE = ` (${Object.entries(TOP_STORIES_MIN_OPENS_BY_CHANNEL)
  .map(([channel, min]) => `${channel} ${min}`)
  .join(", ")})`;

function ratio(outbound: number, opens: number): string {
  return `${Math.round((outbound / opens) * 100)}%`;
}

export function TopStoriesCard() {
  const state = useSystemData<SystemReads>(API.reads);
  return (
    <ChartCard
      title="Top stories by channel"
      subtitle={`Opens, outbound clicks and outbound per open, last ${TOP_STORIES_WINDOW_DAYS} days. Stories under ${TOP_STORIES_MIN_OPENS} opens are hidden${SMALL_CHANNEL_NOTE}.`}
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(d) =>
          d.top_stories.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No story has {TOP_STORIES_MIN_OPENS} opens yet.
            </p>
          ) : (
            <div className="space-y-4">
              {d.top_stories.map((c) => (
                <section key={c.channel}>
                  <h3 className="mb-1 text-xs font-medium text-foreground">
                    {c.channel}
                  </h3>
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="font-normal">Story</th>
                        <th className="w-14 text-right font-normal">Opens</th>
                        <th className="w-16 text-right font-normal">Out</th>
                        <th className="w-16 text-right font-normal">
                          Out/open
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.stories.map((s) => (
                        <tr key={s.id}>
                          <td className="max-w-0 truncate pr-2">
                            <a
                              href={`/${s.id.slice(0, 8)}`}
                              className="hover:underline"
                            >
                              {s.title}
                            </a>
                          </td>
                          <td className="text-right tabular-nums">{s.opens}</td>
                          <td className="text-right tabular-nums">
                            {s.outbound}
                          </td>
                          <td className="text-right tabular-nums">
                            {ratio(s.outbound, s.opens)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          )
        }
      </CardData>
    </ChartCard>
  );
}
