import {
  createFileRoute,
  useHydrated,
  useLocation,
} from "@tanstack/react-router";
import { DeliverPage } from "../components/subscribe/DeliverPage";
import { SettingsView } from "../components/subscribe/SettingsView";
import { UnsubscribeView } from "../components/subscribe/UnsubscribeView";
import {
  type SubscribeLink,
  subscribeLinkToRender,
} from "../lib/analytics/url-privacy";
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
  head: ({ match }) => {
    const lang = match.context.lang;
    return localizedPageHead({
      path: "/subscribe",
      title:
        lang === "vi"
          ? "Nhận AI;DR | Chrome, Telegram, Email, RSS"
          : "Get AI;DR | Chrome, Telegram, Email, RSS",
      description:
        lang === "vi"
          ? "Nhận bản tin AI đã xếp hạng qua email, Telegram, RSS hoặc tiện ích tab mới trên Chrome."
          : "Get the ranked AI news digest by email, on Telegram, over RSS, or in the Chrome new-tab extension.",
      lang,
      route: headRouteInput(match),
    });
  },
  component: SubscribePage,
});

function SubscribePage() {
  const lang = useLang();
  const navigate = Route.useNavigate();
  const { tab, freq, unsubscribe, settings } = Route.useSearch();
  const historyState = useLocation({ select: (location) => location.state });
  const hydrated = useHydrated();
  // The server sees the emailed token in the URL. In the browser the head
  // boot script has already moved it out, before any analytics vendor reads
  // the URL, onto the history entry it arrived on.
  const link: SubscribeLink | undefined = unsubscribe
    ? { kind: "unsubscribe", token: unsubscribe }
    : settings
      ? { kind: "settings", token: settings }
      : subscribeLinkToRender(historyState, hydrated);

  if (link?.kind === "unsubscribe") {
    return <UnsubscribeView token={link.token} lang={lang} />;
  }
  if (link?.kind === "settings") {
    return <SettingsView token={link.token} lang={lang} />;
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
