import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { ContentPage, PageSection } from "../components/ContentPage";
import { headRouteInput } from "../lib/head-route";
import type { RootSearch } from "../lib/locale-routing";
import { pageHead } from "../lib/seo";

export const Route = createFileRoute("/support")({
  search: {
    middlewares: [stripSearchParams<RootSearch>(["lang", "locale"])],
  },
  head: ({ match }) =>
    pageHead({
      path: "/support",
      title: "Support | aidr.today",
      description:
        "Help for the AI;DR website, iPhone app and Chrome extension, and how to reach us.",
      route: headRouteInput(match),
    }),
  component: SupportPage,
});

const SECTIONS: [string, string][] = [
  [
    "A summary or translation is wrong",
    "Every summary and translation is written by AI and can be wrong. Open the story and use Read source to check the original. Email us the story link and what is wrong, and we fix or remove it.",
  ],
  [
    "Remove a source or a picture",
    "Publishers can ask us to stop showing their headlines or pictures. Email the domain or the story link and we remove it.",
  ],
  [
    "iPhone app: the daily reminder does not arrive",
    "Open the app, tap Aa, turn on Daily reminder and allow notifications. Send a test now shows one right away. If it is off in iPhone Settings > Notifications > AI;DR, turn it on there. The reminder uses the edition the app saved last, so open the app now and then.",
  ],
  [
    "iPhone app: stories look old or say Offline",
    "The app shows the edition it saved last when there is no network, with the time it was saved. Pull down on Today to refresh once you are online again.",
  ],
  [
    "Your data",
    "The iPhone app and the Chrome extension have no account and keep your settings on your device only. Deleting the app or the extension deletes them. See the privacy page for what the website and the API record.",
  ],
];

function SupportPage() {
  return (
    <ContentPage
      title="Support"
      lede={
        <>
          Help for the AI;DR website, iPhone app and Chrome extension. Email{" "}
          <a href="mailto:me@duyet.net">me@duyet.net</a>. We answer within a few
          days.
        </>
      }
    >
      {SECTIONS.map(([title, body]) => (
        <PageSection key={title} title={title}>
          <p>{body}</p>
        </PageSection>
      ))}
      <p>
        <Link to="/privacy">Privacy</Link>
        {" · "}
        <Link to="/terms">Terms</Link>
        {" · "}
        <Link to="/about">About</Link>
      </p>
    </ContentPage>
  );
}
