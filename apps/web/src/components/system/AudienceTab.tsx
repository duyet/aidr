import { TabsContent } from "@aidr/ui";
import { Eye, Mail, Percent, UserCheck, UserPlus, Users } from "lucide-react";
import type {
  AudienceStats,
  Ga4AudienceView,
  SubscriberAudience,
} from "../../lib/audience-queries";
import { formatTokens } from "../../lib/format";
import { timeAgo } from "../../lib/lang";
import type { Lang } from "../../lib/types";
import { useSystemData } from "../../lib/use-system-stats";
import { BarList } from "./BarList";
import { CardData, CardSkeleton } from "./CardData";
import { ChartCard } from "./ChartCard";
import { DailyMetricChart } from "./DitherCharts";
import { API } from "./endpoints";
import { StatTile, StatTileSkeleton } from "./StatTile";
import { TAB_PANEL } from "./tab-spacing";

/**
 * Audience metrics: who reads the site (GA4 page views, DAU/MAU) and who
 * subscribes to it (email signups by channel, language, and digest size).
 *
 * The two halves come from different places and the UI never blurs them.
 * Traffic is a Google-owned snapshot the Worker pulls on a schedule, so it can
 * be unconfigured, stale, or unreadable — each of which is *stated* rather
 * than drawn as a zero audience. Subscribers are counted live from D1 and are
 * exact whenever the endpoint answers.
 */

/** Signup sources as `worker/subscribe/handlers.ts` records them, with the
 *  display wording the dashboard uses. `unknown` is the real bucket for rows
 *  that predate source capture, not a parsing failure. */
const SOURCE_LABELS: Record<string, string> = {
  blog: "Blog",
  news: "News",
  home: "Homepage",
  extension: "Extension",
  unknown: "Unknown",
};

const LANG_LABELS: Record<string, string> = {
  vi: "Vietnamese",
  en: "English",
};

/** GA4's `pagePath` is host-dependent; show the path, never the origin. */
function pageLabel(path: string): string {
  const withoutOrigin = path.replace(/^https?:\/\/[^/]+/i, "");
  const trimmed = withoutOrigin.split("?")[0] ?? "";
  return trimmed.length > 1 ? trimmed : "/";
}

function sourceLabel(name: string): string {
  return SOURCE_LABELS[name] ?? name;
}

function langLabel(name: string): string {
  return LANG_LABELS[name] ?? name;
}

function digestLabel(size: number): string {
  return size === 1 ? "1 story" : `${size} stories`;
}

/** Why a traffic tile cannot show a number, in the dashboard's own voice. */
function ga4UnavailableDetail(ga4: Ga4AudienceView): string {
  switch (ga4.status) {
    case "unconfigured":
      return "GA4 sync has not run yet";
    case "error":
      return "Snapshot could not be read";
    default:
      return "Unavailable";
  }
}

function TrafficTile({
  ga4,
  icon,
  label,
  value,
  sublabel,
  lang,
}: {
  ga4: Ga4AudienceView;
  icon: typeof Eye;
  label: string;
  value: string | null;
  sublabel: string;
  lang: Lang;
}) {
  // An unanswered GA4 is never a zero audience.
  if (
    !ga4.audience ||
    ga4.status === "unconfigured" ||
    ga4.status === "error"
  ) {
    return (
      <div role="status" aria-live="polite" className="h-full">
        <StatTile
          icon={icon}
          label={label}
          value="Unavailable"
          numeric={false}
          sublabel={ga4UnavailableDetail(ga4)}
        />
      </div>
    );
  }
  return (
    <StatTile
      icon={icon}
      label={label}
      value={value}
      sublabel={
        ga4.status === "stale"
          ? `Snapshot ${timeAgo(ga4.fetchedAt ?? 0, Date.now(), lang)}`
          : sublabel
      }
    />
  );
}

function TrafficTiles({ ga4, lang }: { ga4: Ga4AudienceView; lang: Lang }) {
  const audience = ga4.audience;
  return (
    <>
      <TrafficTile
        ga4={ga4}
        icon={Eye}
        label="Page views"
        value={audience ? formatTokens(audience.views28d) : null}
        sublabel="Last 28 days"
        lang={lang}
      />
      <TrafficTile
        ga4={ga4}
        icon={UserCheck}
        label="Active today"
        value={audience?.dau != null ? String(audience.dau) : "—"}
        sublabel="DAU, latest day"
        lang={lang}
      />
      <TrafficTile
        ga4={ga4}
        icon={Users}
        label="Monthly users"
        value={audience ? formatTokens(audience.mau) : null}
        sublabel="MAU, last 28 days"
        lang={lang}
      />
      <TrafficTile
        ga4={ga4}
        icon={Percent}
        label="Stickiness"
        value={audience?.stickiness != null ? `${audience.stickiness}%` : "—"}
        sublabel="DAU / MAU"
        lang={lang}
      />
    </>
  );
}

function SubscriberTiles({ subs }: { subs: SubscriberAudience }) {
  return (
    <>
      <StatTile
        icon={Mail}
        label="Subscribers"
        value={String(subs.confirmed)}
        sublabel="Confirmed email"
      />
      <StatTile
        icon={UserPlus}
        label="New subs"
        value={String(subs.new28d)}
        sublabel={`${subs.new7d} in 7 days`}
      />
    </>
  );
}

function StatTiles({ stats, lang }: { stats: AudienceStats; lang: Lang }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <TrafficTiles ga4={stats.ga4} lang={lang} />
      <SubscriberTiles subs={stats.subscribers} />
    </div>
  );
}

function StatRowSkeleton() {
  return (
    <>
      <StatTileSkeleton />
      <StatTileSkeleton />
      <StatTileSkeleton />
      <StatTileSkeleton />
      <StatTileSkeleton />
      <StatTileSkeleton />
    </>
  );
}

function TrafficCards({ ga4 }: { ga4: Ga4AudienceView }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ChartCard
        title="Page views per day"
        subtitle="GA4 screenPageViews, last 90 days"
      >
        {ga4.audience ? (
          <DailyMetricChart
            data={ga4.viewsPerDay}
            seriesKey="views"
            label="Views"
            color="blue"
            emptyLabel="No page views in this range yet."
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {ga4UnavailableDetail(ga4)}.
          </p>
        )}
      </ChartCard>
      <ChartCard
        title="Active users per day"
        subtitle="GA4 activeUsers, last 90 days"
      >
        {ga4.audience ? (
          <DailyMetricChart
            data={ga4.usersPerDay}
            seriesKey="users"
            label="Active users"
            color="purple"
            emptyLabel="No active users in this range yet."
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {ga4UnavailableDetail(ga4)}.
          </p>
        )}
      </ChartCard>
      <ChartCard title="Top pages" subtitle="Page views, last 28 days">
        <BarList
          data={ga4.topPages.map((p) => ({
            name: pageLabel(p.name),
            count: p.count,
          }))}
          emptyLabel={
            ga4.audience
              ? "No page views recorded yet."
              : ga4UnavailableDetail(ga4)
          }
        />
      </ChartCard>
      <ChartCard
        title="Acquisition channels"
        subtitle="GA4 session sources, last 28 days"
      >
        <BarList
          data={ga4.sources.map((s) => ({ name: s.name, count: s.count }))}
          emptyLabel={
            ga4.audience
              ? "No sessions recorded yet."
              : ga4UnavailableDetail(ga4)
          }
        />
      </ChartCard>
    </div>
  );
}

function SubscriberCards({ subs }: { subs: SubscriberAudience }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ChartCard
        title="Subscribers per day"
        subtitle="Confirmed signups, last 90 days"
      >
        <DailyMetricChart
          data={subs.newPerDay}
          seriesKey="signups"
          label="Signups"
          color="green"
          emptyLabel="No confirmed signups in this range yet."
        />
      </ChartCard>
      <ChartCard
        title="Subscribers by signup source"
        subtitle="Where the subscription form was used"
      >
        <BarList
          data={subs.bySource.map((s) => ({
            name: sourceLabel(s.name),
            count: s.count,
          }))}
          emptyLabel="No signup sources recorded yet."
        />
      </ChartCard>
      <ChartCard title="Subscribers by language" subtitle="Digest language">
        <BarList
          data={subs.byLang.map((l) => ({
            name: langLabel(l.name),
            count: l.count,
          }))}
          emptyLabel="No subscribers yet."
        />
      </ChartCard>
      <ChartCard title="Digest size" subtitle="Stories per email">
        <BarList
          data={subs.byDigestSize.map((d) => ({
            name: digestLabel(d.size),
            count: d.count,
          }))}
          emptyLabel="No subscribers yet."
        />
      </ChartCard>
    </div>
  );
}

/** One endpoint for the whole tab: a failing GA4 read still leaves the
 *  subscriber cards, and vice versa. */
export function AudienceTab({ lang }: { lang: Lang }) {
  const state = useSystemData<AudienceStats>(API.audience);

  return (
    <TabsContent value="audience" className={`${TAB_PANEL} space-y-4`}>
      <CardData
        className="contents"
        state={state}
        skeleton={<StatRowSkeleton />}
      >
        {(stats) => <StatTiles stats={stats} lang={lang} />}
      </CardData>
      <div className="space-y-3">
        {state.data ? (
          <>
            <TrafficCards ga4={state.data.ga4} />
            <SubscriberCards subs={state.data.subscribers} />
          </>
        ) : state.error ? (
          <p className="text-sm text-muted-foreground">
            Couldn't load audience data.
          </p>
        ) : (
          <>
            <CardSkeleton tall />
            <CardSkeleton tall />
          </>
        )}
      </div>
    </TabsContent>
  );
}
