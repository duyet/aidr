import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { NavTarget } from "../lib/analytics/events";
import { track } from "../lib/analytics/track";
import {
  fetchFeedFreshnessOnce,
  getCachedFeedFreshness,
  getCachedLatestRun,
} from "../lib/feed-cache";
import { timeAgo } from "../lib/lang";
import { useLang } from "../lib/lang-context";
import {
  classifyRunHealth,
  type LatestRunSummary,
  RUN_HEALTH_DOT,
  RUN_HEALTH_LABEL,
} from "../lib/run-health";
import {
  ANYROUTER_URL,
  DUYET_URL,
  EXTENSION_PATH,
  GITHUB_URL,
  SITE_SLOGAN,
  TELEGRAM_URL,
} from "../lib/site";

// Footer is always English, regardless of site language.
const FOOTER_LINKS = [
  { to: "/about", label: "About" },
  { to: "/weeks", label: "Weekly edition" },
  { to: "/data", label: "Data / Pipeline" },
  { to: "/mcp", label: "MCP server" },
  { to: "/release", label: "Release notes" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
] as const satisfies readonly { to: NavTarget; label: string }[];

const linkClass =
  "text-sm text-muted-foreground transition-colors hover:text-foreground";

export function NewsFooter() {
  const navigationLang = useLang();
  const year = new Date().getFullYear();
  // Cached freshness is only read after mount — reading it in the initializer
  // would make the first client render differ from the SSR markup (#418).
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [latestRun, setLatestRun] = useState<LatestRunSummary | null>(null);

  useEffect(() => {
    const cached = getCachedFeedFreshness();
    const cachedRun = getCachedLatestRun();
    setLastFetchedAt(cached);
    setLatestRun(cachedRun ?? null);
    if (cached !== null && cachedRun !== undefined) return;
    let cancelled = false;
    void fetchFeedFreshnessOnce().then((freshness) => {
      if (cancelled) return;
      if (freshness !== null) setLastFetchedAt(freshness);
      setLatestRun(getCachedLatestRun() ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const runHealth = latestRun
    ? classifyRunHealth(latestRun, Math.floor(Date.now() / 1000))
    : null;

  return (
    <footer className="mt-10 border-t border-border/80 bg-card/40 py-12 text-sm text-muted-foreground">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="space-y-2">
            <p className="font-serif text-xl font-medium tracking-tight text-foreground">
              AI;DR
            </p>
            <p className="max-w-xs text-sm leading-relaxed">{SITE_SLOGAN}</p>
          </div>
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-3"
          >
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/90">
                Site
              </p>
              {FOOTER_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() =>
                    track("nav_click", { to: link.to, placement: "footer" })
                  }
                  className={`block ${linkClass}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/90">
                Connect
              </p>
              <Link
                to={EXTENSION_PATH}
                search={{ lang: navigationLang }}
                onClick={() =>
                  track("channel_click", {
                    channel: "extension",
                    placement: "footer",
                  })
                }
                className={`block ${linkClass}`}
                title="Get AI;DR"
                aria-label="Get AI;DR"
              >
                Get AI;DR
              </Link>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  track("channel_click", {
                    channel: "telegram",
                    placement: "footer",
                    lang: "vi",
                  })
                }
                className={`block ${linkClass}`}
              >
                Telegram
              </a>
              <Link
                to="/subscribe"
                search={{ tab: "rss", lang: navigationLang }}
                onClick={() =>
                  track("channel_click", {
                    channel: "rss",
                    placement: "footer",
                  })
                }
                className={`block ${linkClass}`}
              >
                RSS
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  track("nav_click", { to: "github", placement: "footer" })
                }
                className={`block ${linkClass}`}
              >
                GitHub
              </a>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
                More
              </p>
              <a
                href={DUYET_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  track("nav_click", { to: "duyet.net", placement: "footer" })
                }
                className={`block ${linkClass}`}
              >
                duyet.net
              </a>
              {/* The gateway behind every LLM call in the pipeline. Same
                  credited URL as the /data strip and /about, so the referral
                  cannot differ per surface. */}
              <a
                href={ANYROUTER_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  track("nav_click", {
                    to: "anyrouter.dev",
                    placement: "footer",
                  })
                }
                className={`block ${linkClass}`}
                title="LLM gateway behind AI;DR"
              >
                anyrouter.dev
              </a>
            </div>
          </nav>
        </div>
        <div className="flex flex-col gap-2 border-t border-border/60 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>
            {`© ${year} AI;DR`}
            {lastFetchedAt !== null && (
              <>
                {" · "}
                <Link
                  to="/data"
                  search={
                    latestRun
                      ? { tab: "runs", run: latestRun.id }
                      : { tab: "runs" }
                  }
                  onClick={() =>
                    track("nav_click", {
                      to: "/data/runs",
                      placement: "footer",
                    })
                  }
                  className="inline-flex items-center gap-1.5 underline-offset-2 hover:text-foreground hover:underline"
                  title={
                    runHealth ? RUN_HEALTH_LABEL[runHealth] : "Pipeline runs"
                  }
                >
                  {runHealth ? (
                    <span
                      role="img"
                      aria-label={RUN_HEALTH_LABEL[runHealth]}
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${RUN_HEALTH_DOT[runHealth]}`}
                    />
                  ) : null}
                  Updated {timeAgo(lastFetchedAt, Date.now(), "en")}
                </Link>
              </>
            )}
          </span>
        </div>
      </div>
    </footer>
  );
}
