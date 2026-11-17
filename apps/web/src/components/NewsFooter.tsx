import { Link } from "@tanstack/react-router";
import {
  BookOpenText,
  Code,
  Database,
  FileText,
  Globe,
  Info,
  Plug,
  Plus,
  Rocket,
  Route,
  Rss,
  Send,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
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
  FACEBOOK_URL,
  GITHUB_URL,
  SITE_SLOGAN,
  TELEGRAM_EN_URL,
  TELEGRAM_URL,
} from "../lib/site";
import { Bi } from "./Bi";
import { ChromeMark } from "./header/ChromeMark";
import { FacebookMark } from "./header/FacebookMark";
import { LogoMark } from "./header/LogoMark";

const LINK_CLASS =
  "inline-flex items-center gap-2 py-1 transition-colors hover:text-foreground motion-reduce:transition-none [&_svg]:size-[15px] [&_svg]:shrink-0";

function Column({
  vi,
  en,
  children,
}: {
  vi: string;
  en: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Bi
        vi={vi}
        en={en}
        as="p"
        inline
        className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-foreground"
      />
      {children}
    </div>
  );
}

function External({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={LINK_CLASS}
    >
      {children}
    </a>
  );
}

export function NewsFooter() {
  const lang = useLang();
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
    // The phone tab bar is fixed over the bottom of the page, so the footer
    // ends with room for it.
    <footer className="mt-16 pt-12 pb-[calc(6rem+env(safe-area-inset-bottom))] text-[12.5px] text-muted-foreground min-[700px]:pb-14">
      <div className="mx-auto flex w-full max-w-[1080px] flex-wrap gap-x-[72px] gap-y-10 px-4 sm:px-6 lg:px-8">
        <div className="min-w-[200px] flex-1 space-y-2">
          <p className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            <LogoMark />
            AI;DR
          </p>
          <Bi
            vi="Tin AI, xếp hạng và tóm tắt"
            en={SITE_SLOGAN}
            as="p"
            className="max-w-xs leading-relaxed"
          />
          <p className="pt-2 text-[12px]">
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
                  <Bi
                    vi={`Cập nhật ${timeAgo(lastFetchedAt, Date.now(), "vi")}`}
                    en={`Updated ${timeAgo(lastFetchedAt, Date.now(), "en")}`}
                    inline
                  />
                </Link>
              </>
            )}
          </p>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap gap-x-[72px] gap-y-8"
        >
          <Column vi="Trang" en="Site">
            <Link
              to="/about"
              search={{ lang }}
              onClick={() =>
                track("nav_click", { to: "/about", placement: "footer" })
              }
              className={LINK_CLASS}
            >
              <Info aria-hidden />
              <Bi vi="Giới thiệu" en="About" inline />
            </Link>
            <Link
              to="/release"
              search={{ lang }}
              onClick={() =>
                track("nav_click", { to: "/release", placement: "footer" })
              }
              className={LINK_CLASS}
            >
              <Rocket aria-hidden />
              <Bi vi="Phát hành" en="Release" inline />
            </Link>
            <Link
              to="/data"
              onClick={() =>
                track("nav_click", { to: "/data", placement: "footer" })
              }
              className={LINK_CLASS}
            >
              <Database aria-hidden />
              <Bi vi="Dữ liệu" en="Data" inline />
            </Link>
            <Link
              to="/data"
              search={{ tab: "algo" }}
              onClick={() =>
                track("nav_click", { to: "/data/algo", placement: "footer" })
              }
              className={LINK_CLASS}
            >
              <Workflow aria-hidden />
              <Bi vi="Thuật toán" en="Algorithm" inline />
            </Link>
            <Link
              to="/weeks"
              search={{ lang }}
              onClick={() =>
                track("nav_click", { to: "/weeks", placement: "footer" })
              }
              className={LINK_CLASS}
            >
              <BookOpenText aria-hidden />
              <Bi vi="Bản tin tuần" en="Weekly edition" inline />
            </Link>
            <Link
              to="/privacy"
              onClick={() =>
                track("nav_click", { to: "/privacy", placement: "footer" })
              }
              className={LINK_CLASS}
            >
              <ShieldCheck aria-hidden />
              <Bi vi="Quyền riêng tư" en="Privacy" inline />
            </Link>
            <Link
              to="/terms"
              onClick={() =>
                track("nav_click", { to: "/terms", placement: "footer" })
              }
              className={LINK_CLASS}
            >
              <FileText aria-hidden />
              <Bi vi="Điều khoản" en="Terms" inline />
            </Link>
          </Column>
          <Column vi="Theo dõi" en="Follow">
            <External
              href={lang === "vi" ? TELEGRAM_URL : TELEGRAM_EN_URL}
              onClick={() =>
                track("channel_click", {
                  channel: "telegram",
                  placement: "footer",
                  lang,
                })
              }
            >
              <Send aria-hidden />
              Telegram
            </External>
            <External
              href={FACEBOOK_URL}
              onClick={() =>
                track("channel_click", {
                  channel: "facebook",
                  placement: "footer",
                  lang: "en",
                })
              }
            >
              <FacebookMark />
              Facebook
            </External>
            <Link
              to={EXTENSION_PATH}
              search={{ lang }}
              onClick={() =>
                track("channel_click", {
                  channel: "extension",
                  placement: "footer",
                })
              }
              className={LINK_CLASS}
            >
              <ChromeMark />
              Chrome
            </Link>
            <Link
              to="/subscribe"
              search={{ tab: "rss", lang }}
              onClick={() =>
                track("channel_click", { channel: "rss", placement: "footer" })
              }
              className={LINK_CLASS}
            >
              <Rss aria-hidden />
              RSS
            </Link>
            <Link
              to="/mcp"
              search={{ lang }}
              onClick={() =>
                track("nav_click", { to: "/mcp", placement: "footer" })
              }
              className={LINK_CLASS}
            >
              <Plug aria-hidden />
              MCP server
            </Link>
          </Column>
          <Column vi="Thêm" en="More">
            <Link
              to="/contribute"
              search={{ lang }}
              onClick={() =>
                track("nav_click", { to: "/contribute", placement: "footer" })
              }
              className={LINK_CLASS}
            >
              <Plus aria-hidden />
              <Bi vi="Đóng góp" en="Contribute" inline />
            </Link>
            <External
              href={GITHUB_URL}
              onClick={() =>
                track("nav_click", { to: "github", placement: "footer" })
              }
            >
              <Code aria-hidden />
              GitHub
            </External>
            <External
              href={DUYET_URL}
              onClick={() =>
                track("nav_click", { to: "duyet.net", placement: "footer" })
              }
            >
              <Globe aria-hidden />
              duyet.net
            </External>
            {/* The gateway behind every LLM call in the pipeline. Same
                credited URL as the /data strip and /about, so the referral
                cannot differ per surface. */}
            <External
              href={ANYROUTER_URL}
              onClick={() =>
                track("nav_click", {
                  to: "anyrouter.dev",
                  placement: "footer",
                })
              }
            >
              <Route aria-hidden />
              anyrouter.dev
            </External>
          </Column>
        </nav>
      </div>
    </footer>
  );
}
