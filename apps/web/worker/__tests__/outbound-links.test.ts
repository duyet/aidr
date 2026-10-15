/**
 * Every surface that posts a link back to aidr.today, rendered, with each
 * aidr.today link checked: it must carry utm_source, utm_medium and
 * utm_campaign, and `channel_landing` must attribute it to the surface's
 * channel. A new surface, or a builder that drops the tag, lands as
 * Direct in GA4 and as no `channel_landing` at all, which is the defect
 * this guards. Token links stay untagged on purpose (`carriesToken`).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  landingChannel,
  readCampaign,
} from "../../src/lib/analytics/landing.js";
import { buildRssXml } from "../../src/lib/rss.js";
import type { FeedItem } from "../../src/lib/types.js";
import {
  renderDigestEmail,
  renderNoteEmail,
  settingsUrl,
  unsubscribeUrl,
} from "../mail/render.js";
import { buildFacebookDigest, buildFacebookStory } from "../notify/facebook.js";
import {
  buildAlbumCaption,
  buildDayVideoReplyMarkup,
  buildDigestMessage,
  buildDigestReplyMarkup,
  buildStoryReplyMarkup,
} from "../notify/telegram.js";
import type { DailyDigest, StoryPayload } from "../notify/types.js";
import { carriesToken, type UtmSource } from "../utm.js";

const REPO = resolve(import.meta.dirname, "../../../..");
const SITE_LINK = /https:\/\/aidr\.today(?:\/[^\s<>"')\]]*)?/g;

type Surface = {
  name: string;
  source: UtmSource;
  render: () => string | Promise<string>;
};

/** aidr.today links in a rendered post, HTML-unescaped, sentence punctuation dropped. */
function siteLinks(text: string): string[] {
  return [...text.replaceAll("&amp;", "&").matchAll(SITE_LINK)].map((m) =>
    m[0].replace(/[.,;:!?]+$/, "")
  );
}

/** Untyped .mjs/.js modules outside apps/web (videos/, apps/extension). */
async function load<T>(path: string): Promise<T> {
  return (await import(/* @vite-ignore */ join(REPO, path))) as T;
}

function ytMeta(args: string[]): string {
  const out = execFileSync(
    "python3",
    [
      "-I",
      join(REPO, ".agents/skills/aidr-youtube-upload/bin/yt-meta.py"),
      ...args,
    ],
    { encoding: "utf8" }
  );
  return (JSON.parse(out) as { desc: string }).desc;
}

const OWN = "https://aidr.today/abcdef12";

const story: StoryPayload = {
  id: "abcdef1234567890",
  url: "https://techcrunch.com/2026/10/14/post",
  title: "A lab ships a small model",
  summary: "The weights are public. The benchmark is narrow.",
  image_url: null,
  category: "models",
  points: 10,
  comments: 2,
  rank_score: 8,
  llm_importance: 8,
  lang: "en",
};

const digest: DailyDigest = {
  lang: "en",
  date: "2026-10-14",
  bullets: [{ text: "Own story", url: OWN }],
};

const unsub = unsubscribeUrl("tok-secret", "en");
const settings = settingsUrl("tok-secret", "en");

const feedItem: FeedItem = {
  id: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  url: "https://news.ycombinator.com/item?id=1",
  title: "OpenAI ships a faster reasoning model",
  title_vi: null,
  summary: "A short English summary.",
  summary_vi: null,
  category: "Models",
  published_at: 1_787_000_000,
  points: 10,
  comments: 2,
  rank_score: 5,
  source_id: "hn",
  tags: [],
  sources: [],
  llm_tokens: 0,
  image_url: null,
};

const POSTS = "videos/daily-news/editions/2026-10-10/posts.md";

const SURFACES: Surface[] = [
  {
    name: "email digest",
    source: "email",
    render: () => {
      const mail = renderDigestEmail({
        date: "2026-10-14",
        lang: "en",
        unsubscribeUrl: unsub,
        settingsUrl: settings,
        feedbackToken: "tok-secret",
        stories: [{ text: "First. Detail.", url: OWN, headline: "First" }],
      });
      return mail.html + mail.text;
    },
  },
  {
    name: "email weekly digest",
    source: "email",
    render: () => {
      const mail = renderDigestEmail({
        date: "2026-10-14",
        lang: "en",
        unsubscribeUrl: unsub,
        settingsUrl: settings,
        stories: [{ text: "One. Two.", url: OWN, headline: "One" }],
        weekly: {
          week: "2026-W42",
          issue: 3,
          start_date: "2026-10-12",
          end_date: "2026-10-18",
          intro: null,
        },
      });
      return mail.html + mail.text;
    },
  },
  {
    name: "email welcome note",
    source: "email",
    render: () => {
      const mail = renderNoteEmail({
        subject: "Welcome",
        lang: "en",
        mailKind: "welcome",
        bodyMd: "Read [the data](https://aidr.today/data).",
        cta: { label: "Open", url: "https://aidr.today/" },
        unsubscribeUrl: unsub,
        settingsUrl: settings,
      });
      return mail.html + mail.text;
    },
  },
  {
    name: "Telegram digest",
    source: "telegram",
    render: () =>
      buildDigestMessage(digest) +
      JSON.stringify(buildDigestReplyMarkup(digest)),
  },
  {
    name: "Telegram story",
    source: "telegram",
    render: () =>
      buildAlbumCaption(story) + JSON.stringify(buildStoryReplyMarkup(story)),
  },
  {
    name: "Telegram day video (Worker)",
    source: "telegram",
    render: () =>
      JSON.stringify(
        buildDayVideoReplyMarkup({
          date: "2026-10-14",
          lang: "vi",
          youtubeId: "abc123",
          title: null,
        })
      ),
  },
  {
    name: "Facebook digest and story",
    source: "facebook",
    render: () =>
      JSON.stringify([buildFacebookDigest(digest), buildFacebookStory(story)]),
  },
  {
    name: "RSS feed",
    source: "rss",
    // The guid is the untagged permalink on purpose (readers dedupe on it),
    // and atom:link is the feed's own address, not a click.
    render: () =>
      buildRssXml(
        {
          tldr: null,
          days: [{ date: "2026-10-14", items: [feedItem], categoryCounts: {} }],
          categories: [],
          trending: [],
          totalStories: 1,
          updatedAt: 1_787_000_000_000,
          lastFetchedAt: 1_787_000_000,
          hasMore: false,
        },
        "en"
      )
        .replace(/<guid[^>]*>[^<]*<\/guid>/g, "")
        .replace(/<atom:link[^>]*\/>/g, ""),
  },
  {
    name: "Telegram day video (videos/telegram-video.mjs)",
    source: "telegram",
    render: async () => {
      const m = await load<{
        videoReplyMarkup: (o: object) => object;
      }>("videos/daily-news/scripts/telegram-video.mjs");
      return JSON.stringify(
        m.videoReplyMarkup({
          date: "2026-10-14",
          lang: "en",
          youtubeId: "abc",
        })
      );
    },
  },
  {
    name: "Facebook Reel caption",
    source: "facebook",
    render: async () => {
      const m = await load<{
        reelCaption: (md: string, date: string, lang: string) => string;
      }>("videos/daily-news/scripts/facebook-reel.mjs");
      const md = readFileSync(join(REPO, POSTS), "utf8");
      return (
        m.reelCaption(md, "2026-10-10", "en") +
        m.reelCaption(md, "2026-10-10", "vi")
      );
    },
  },
  {
    name: "YouTube descriptions (yt-meta.py --daily)",
    source: "youtube",
    render: () =>
      ["en", "vi"]
        .flatMap((lang) =>
          ["long", "short"].map((kind) =>
            ytMeta([
              "--daily",
              join(REPO, POSTS),
              "--lang",
              lang,
              "--kind",
              kind,
            ])
          )
        )
        .join("\n"),
  },
  {
    name: "YouTube descriptions (yt-meta.py --release)",
    source: "youtube",
    render: () =>
      ["long", "short"]
        .map((kind) =>
          ytMeta([
            "--release",
            join(REPO, "videos/releases/v0.1.12/youtube.md"),
            "--lang",
            "en",
            "--kind",
            kind,
          ])
        )
        .join("\n"),
  },
  {
    name: "YouTube description (yt-meta.py --json, the visub cut)",
    source: "youtube",
    render: () => {
      const dir = mkdtempSync(join(tmpdir(), "outbound-links-"));
      try {
        const file = join(dir, "youtube.visub.json");
        writeFileSync(
          file,
          JSON.stringify({
            title: "Tin AI",
            desc: "Tóm tắt.\n\nTin hôm nay: https://aidr.today/date/2026-10-13?lang=vi\nhttps://aidr.today/?lang=vi\n\n#AI",
            tags: "AI",
          })
        );
        return ytMeta(["--json", file, "--lang", "vi", "--kind", "long"]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: "Chrome extension new tab",
    source: "extension",
    render: async () => {
      const m = await load<{
        withExtRef: (url: string, content?: string, lang?: string) => string;
      }>("apps/extension/js/ref.js");
      return [
        m.withExtRef(OWN, "story", "en"),
        m.withExtRef("https://aidr.today/date/2026-10-14", "day", "vi"),
        m.withExtRef("https://aidr.today/subscribe?tab=email", "nav", "en"),
      ].join("\n");
    },
  },
];

describe("every outbound aidr.today link is tagged for its channel", () => {
  it.each(SURFACES)("$name", async ({ source, render }) => {
    const links = siteLinks(await render()).filter(
      (link) => !carriesToken(new URL(link))
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const params = new URL(link).searchParams;
      expect(
        {
          link,
          source: params.get("utm_source"),
          medium: Boolean(params.get("utm_medium")),
          campaign: Boolean(params.get("utm_campaign")),
          channel: landingChannel(readCampaign(new URL(link).search)),
        },
        link
      ).toEqual({
        link,
        source,
        medium: true,
        campaign: true,
        channel: source,
      });
    }
  });
});
