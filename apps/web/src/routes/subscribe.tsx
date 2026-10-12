import { createFileRoute } from "@tanstack/react-router";
import { DeliverPage } from "../components/subscribe/DeliverPage";
import { SettingsView } from "../components/subscribe/SettingsView";
import { UnsubscribeView } from "../components/subscribe/UnsubscribeView";
import { type DeliverTab, parseDeliverTab } from "../lib/deliver-tab";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import {
  type MailFrequency,
  normalizeMailFrequency,
} from "../lib/mail-frequency";
import { localizedPageHead } from "../lib/seo";

export const Route = createFileRoute("/subscribe")({
  validateSearch: (
    search: Record<string, unknown>
  ): {
    tab?: DeliverTab;
    freq?: MailFrequency;
    unsubscribe?: string;
    settings?: string;
  } => {
    const out: {
      tab?: DeliverTab;
      freq?: MailFrequency;
      unsubscribe?: string;
      settings?: string;
    } = {};
    if (search.freq === "weekly") out.freq = "weekly";
    if (typeof search.tab === "string") out.tab = parseDeliverTab(search.tab);
    if (typeof search.unsubscribe === "string")
      out.unsubscribe = search.unsubscribe;
    if (typeof search.settings === "string") out.settings = search.settings;
    return out;
  },
  head: ({ match }) =>
    localizedPageHead({
      path: "/subscribe",
      title: "Get AI;DR | Chrome, Telegram, Email",
      description:
        "Get the ranked AI news digest by email, on Telegram, or in the Chrome new-tab extension.",
      lang: match.context.lang,
      route: headRouteInput(match),
    }),
  component: SubscribePage,
});

function SubscribePage() {
  const lang = useLang();
  const navigate = Route.useNavigate();
  const { tab, freq, unsubscribe, settings } = Route.useSearch();

  if (unsubscribe) {
    return <UnsubscribeView token={unsubscribe} lang={lang} />;
  }
  if (settings) {
    return <SettingsView token={settings} lang={lang} />;
  }

  return (
    <DeliverPage
      tab={parseDeliverTab(tab)}
      frequency={normalizeMailFrequency(freq)}
      onTabChange={(next) =>
        void navigate({
          search: {
            ...(next === "chrome" ? {} : { tab: next }),
            ...(freq ? { freq } : {}),
          },
          replace: true,
        })
      }
    />
  );
}
