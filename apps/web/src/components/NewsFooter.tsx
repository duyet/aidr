import { track } from "@aidr/ui/track";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  fetchFeedFreshnessOnce,
  getCachedFeedFreshness,
} from "../lib/feed-cache";
import { timeAgo } from "../lib/lang";
import { useLang } from "../lib/lang-context";
import {
  DUYET_URL,
  EXTENSION_PATH,
  GITHUB_URL,
  SITE_SLOGAN,
  TELEGRAM_URL,
} from "../lib/site";

// Footer is always English, regardless of site language.
const FOOTER_LINKS: { to: string; label: string }[] = [
  { to: "/about", label: "About" },
  { to: "/data", label: "Data / Pipeline" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
];

const linkClass =
  "text-sm text-muted-foreground transition-colors hover:text-foreground";

export function NewsFooter() {
  const navigationLang = useLang();
  const year = new Date().getFullYear();
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(() =>
    getCachedFeedFreshness()
  );

  useEffect(() => {
    const cached = getCachedFeedFreshness();
    setLastFetchedAt(cached);
    if (cached !== null) return;
    let cancelled = false;
    void fetchFeedFreshnessOnce().then((freshness) => {
      if (!cancelled && freshness !== null) setLastFetchedAt(freshness);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
                  onClick={() => track("nav_click", { to: link.to })}
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
                onClick={() => track("nav_click", { to: EXTENSION_PATH })}
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
                onClick={() => track("nav_click", { to: "telegram" })}
                className={`block ${linkClass}`}
              >
                Telegram
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("nav_click", { to: "github" })}
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
                onClick={() => track("nav_click", { to: "duyet.net" })}
                className={`block ${linkClass}`}
              >
                duyet.net
              </a>
            </div>
          </nav>
        </div>
        <div className="flex flex-col gap-2 border-t border-border/60 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          {/* Relative "Updated …" uses Date.now() at render, so SSR text can
              differ from hydration text — suppress the mismatch warning. */}
          <span suppressHydrationWarning>
            {`© ${year} AI;DR`}
            {lastFetchedAt !== null && (
              <>
                {" · "}
                <Link
                  to="/data"
                  onClick={() => track("nav_click", { to: "/data" })}
                  className="underline-offset-2 hover:text-foreground hover:underline"
                  title="Pipeline stats"
                >
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
