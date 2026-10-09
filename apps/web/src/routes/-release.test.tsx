/**
 * /release/$version renders one release from the content registry. The page
 * must paint the highlights, every change with its GitHub links, and the
 * compare link; an unknown version is the localized 404, never a blank page.
 * Head tags follow the "AI;DR vX.Y.Z — title" contract with the intro as
 * the description.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangContext } from "../lib/lang-context";
import { notFoundCopy } from "../lib/not-found";
import { releaseFilmId } from "../lib/releases/format";
import type { Release } from "../lib/releases/types";
import type { HeadMeta } from "../lib/seo";
import type { Lang } from "../lib/types";
import { Route } from "./release.$version";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      children,
      className,
    }: {
      children?: ReactNode;
      className?: string;
    }) => createElement("a", { className }, children),
  };
});

const FIXTURE: Release = {
  version: "9.9.9",
  date: "2026-10-10",
  from: "2026-10-01",
  to: "2026-10-10",
  compare: { base: "v9.9.8", head: "v9.9.9" },
  title: { en: "Fixture release", vi: "Bản phát hành thử" },
  intro: { en: "What this fixture ships.", vi: "Bản thử này có gì." },
  stats: [{ value: "2", label: { en: "features", vi: "tính năng" } }],
  highlights: [
    {
      label: { en: "Day pages", vi: "Trang theo ngày" },
      text: { en: "Every day has a page.", vi: "Mỗi ngày có một trang." },
      image: {
        src: "/releases/v9.9.9/day.png",
        width: 1200,
        height: 800,
        alt: { en: "A day page", vi: "Trang theo ngày" },
        caption: { en: "The day page.", vi: "Trang theo ngày." },
      },
    },
  ],
  cover: {
    src: "/releases/v9.9.9/cover.png",
    width: 1200,
    height: 630,
    alt: { en: "Cover", vi: "Ảnh bìa" },
  },
  changes: [
    {
      kind: "feature",
      scope: "web",
      text: { en: "Add day pages.", vi: "Thêm trang theo ngày." },
      commit: "abc1234",
      pr: 42,
    },
    {
      kind: "fix",
      text: { en: "Fix sign-in.", vi: "Sửa đăng nhập." },
      commit: "def5678",
    },
  ],
};

type Loaded =
  | { kind: "release"; release: Release }
  | { kind: "missing"; lang: Lang };

function render(data: Loaded, lang: Lang): string {
  vi.spyOn(Route, "useLoaderData").mockReturnValue(data);
  const Page = Route.options.component as () => React.ReactElement;
  return renderToStaticMarkup(
    <LangContext.Provider value={lang}>
      <Page />
    </LangContext.Provider>
  );
}

type HeadFn = (ctx: {
  loaderData: Loaded;
  match: { context: { lang: Lang }; pathname: string; status: string };
}) => { meta: HeadMeta[] };

function head(data: Loaded, lang: Lang): HeadMeta[] {
  const fn = Route.options.head as unknown as HeadFn;
  return fn({
    loaderData: data,
    match: {
      context: { lang },
      pathname: "/release/v9.9.9",
      status: "success",
    },
  }).meta;
}

function meta(tags: HeadMeta[], key: string): string | undefined {
  const hit = tags.find(
    (tag) =>
      ("name" in tag && tag.name === key) ||
      ("property" in tag && tag.property === key) ||
      (key === "title" && "title" in tag)
  );
  if (!hit) return undefined;
  if ("content" in hit) return hit.content;
  if ("title" in hit) return hit.title;
  return undefined;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("release page", () => {
  it("renders the title, highlights, grouped changes, and GitHub links", () => {
    const html = render({ kind: "release", release: FIXTURE }, "en");
    expect(html).toContain("Fixture release");
    expect(html).toContain("v9.9.9");
    expect(html).toContain("Day pages");
    expect(html).toContain('src="/releases/v9.9.9/day.png"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("The day page.");
    expect(html).toContain("Features");
    expect(html).toContain("Fixes");
    expect(html).toContain("https://github.com/duyet/aidr/commit/abc1234");
    expect(html).toContain("https://github.com/duyet/aidr/pull/42");
    expect(html).toContain(
      "https://github.com/duyet/aidr/compare/v9.9.8...v9.9.9"
    );
    // No film: the cover is the hero, nothing from YouTube is referenced.
    expect(html).toContain('src="/releases/v9.9.9/cover.png"');
    expect(html).not.toContain("youtube");
  });

  it("paints Vietnamese strings from the content's .vi", () => {
    const html = render({ kind: "release", release: FIXTURE }, "vi");
    expect(html).toContain("Bản phát hành thử");
    expect(html).toContain("Trang theo ngày");
    expect(html).toContain("Thêm trang theo ngày.");
    expect(html).toContain("Điểm nổi bật");
    expect(html).not.toContain("Fixture release");
  });

  it("puts a click-to-play film facade at the top when a youtubeId is present", () => {
    const html = render(
      { kind: "release", release: { ...FIXTURE, youtubeId: "dQw4w9WgXcQ" } },
      "en"
    );
    expect(html).toContain('aria-label="Play film: Fixture release"');
    // Poster is the cover; the player loads only after the click.
    expect(html).not.toContain("youtube-nocookie");
    expect(html.indexOf("Play film")).toBeLessThan(html.indexOf("<h1"));
  });

  it("prefers the Vietnamese cut on the vi page and falls back to the English one", () => {
    const both = { ...FIXTURE, youtubeId: "en0", youtubeIdVi: "vi0" };
    expect(releaseFilmId(both, "vi")).toBe("vi0");
    expect(releaseFilmId(both, "en")).toBe("en0");
    expect(releaseFilmId({ ...FIXTURE, youtubeId: "en0" }, "vi")).toBe("en0");
    expect(releaseFilmId(FIXTURE, "vi")).toBeUndefined();
  });

  it("renders the localized 404 for an unknown version", () => {
    const html = render({ kind: "missing", lang: "vi" }, "vi");
    expect(html).toContain(notFoundCopy("vi").body);
    expect(html).not.toContain("Fixture release");
  });

  it("resolves a known version and reports an unknown one", () => {
    const loader = Route.options.loader as (ctx: {
      params: { version: string };
      context: { lang: Lang };
    }) => Loaded;
    const ctx = { context: { lang: "en" as Lang } };
    expect(loader({ ...ctx, params: { version: "v0.0.0-nope" } })).toEqual({
      kind: "missing",
      lang: "en",
    });
  });
});

describe("release head", () => {
  it("titles the document AI;DR vX.Y.Z — title with the intro and cover", () => {
    const tags = head({ kind: "release", release: FIXTURE }, "en");
    expect(meta(tags, "title")).toBe("AI;DR v9.9.9 — Fixture release");
    expect(meta(tags, "description")).toBe("What this fixture ships.");
    expect(meta(tags, "og:image")).toBe(
      "https://aidr.today/releases/v9.9.9/cover.png"
    );
  });

  it("uses the Vietnamese title for vi", () => {
    const tags = head({ kind: "release", release: FIXTURE }, "vi");
    expect(meta(tags, "title")).toBe("AI;DR v9.9.9 — Bản phát hành thử");
    expect(meta(tags, "description")).toBe("Bản thử này có gì.");
  });

  it("marks an unknown version noindex", () => {
    const tags = head({ kind: "missing", lang: "en" }, "en");
    expect(meta(tags, "title")).toBe(notFoundCopy("en").documentTitle);
    expect(meta(tags, "robots")).toBe("noindex, follow");
  });
});
