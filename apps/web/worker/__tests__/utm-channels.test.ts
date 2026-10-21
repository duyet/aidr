import { describe, expect, it } from "vitest";
import { readCampaign } from "../../src/lib/analytics/landing.js";
import {
  renderDigestEmail,
  renderNoteEmail,
  settingsUrl,
  unsubscribeUrl,
} from "../mail/render.js";
import { buildFacebookDigest, buildFacebookStory } from "../notify/facebook.js";
import {
  buildAlbumCaption,
  buildDigestMessage,
  buildDigestReplyMarkup,
  buildStoryReplyMarkup,
} from "../notify/telegram.js";
import type { DailyDigest, StoryPayload } from "../notify/types.js";
import { digestCampaign, postContent, withUtm } from "../utm.js";

const OWN = "https://aidr.today/abcdef12";
const THIRD_PARTY = "https://techcrunch.com/2026/10/14/post?id=1";

function params(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams);
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) =>
    m[1].replaceAll("&amp;", "&")
  );
}

const story: StoryPayload = {
  id: "abcdef1234567890",
  url: THIRD_PARTY,
  title: "A lab ships a small model",
  summary: "The weights are public. The benchmark is narrow.",
  image_url: null,
  category: "models",
  points: 10,
  comments: 2,
  rank_score: 8,
  llm_importance: 8,
  lang: "vi",
};

describe("withUtm", () => {
  const tag = {
    source: "telegram",
    medium: "social",
    campaign: "story",
    content: "button",
  } as const;

  it("tags an aidr.today link with all four params", () => {
    expect(params(withUtm(OWN, tag))).toEqual({
      utm_source: "telegram",
      utm_medium: "social",
      utm_campaign: "story",
      utm_content: "button",
    });
  });

  it("leaves third-party links alone unless the caller opts in", () => {
    expect(withUtm(THIRD_PARTY, tag)).toBe(THIRD_PARTY);
    expect(params(withUtm(THIRD_PARTY, tag, { external: true }))).toMatchObject(
      { utm_source: "telegram", id: "1" }
    );
  });

  it("does not double-tag a URL that already has utm params", () => {
    const tagged = `${OWN}?utm_source=twitter`;
    expect(withUtm(tagged, tag)).toBe(tagged);
  });

  it("never touches links that carry a subscriber token", () => {
    for (const url of [
      "https://aidr.today/subscribe?unsubscribe=abc",
      "https://aidr.today/subscribe?settings=abc",
      "https://aidr.today/api/subscribe?token=abc",
      "https://aidr.today/feedback?d=2026-10-14&v=up&t=abc",
    ]) {
      expect(withUtm(url, tag)).toBe(url);
    }
  });

  it("returns non-http and invalid input unchanged", () => {
    expect(withUtm("mailto:a@b.c", tag)).toBe("mailto:a@b.c");
    expect(withUtm("not a url", tag)).toBe("not a url");
  });
});

describe("Telegram UTMs", () => {
  const digest: DailyDigest = {
    lang: "vi",
    date: "2026-10-14",
    bullets: [
      { text: "Own story", url: OWN },
      { text: "Publisher story", url: THIRD_PARTY },
    ],
  };

  it("tags digest bullet links with the edition campaign and keeps lang", () => {
    const links = hrefs(buildDigestMessage(digest));
    expect(params(links[0])).toEqual({
      lang: "vi",
      utm_source: "telegram",
      utm_medium: "social",
      utm_campaign: "digest-2026-10-14",
      utm_content: "link",
    });
    expect(links[1]).toBe(THIRD_PARTY);
  });

  it.each(["vi", "en"] as const)("tags the %s digest button", (lang) => {
    const markup = buildDigestReplyMarkup({ ...digest, lang }) as {
      inline_keyboard: { url: string }[][];
    };
    expect(params(markup.inline_keyboard[0][0].url)).toEqual({
      lang,
      utm_source: "telegram",
      utm_medium: "social",
      utm_campaign: "digest-2026-10-14",
      utm_content: "button",
    });
  });

  it("tags the story button and the album caption link", () => {
    const markup = buildStoryReplyMarkup(story) as {
      inline_keyboard: { url: string }[][];
    };
    expect(params(markup.inline_keyboard[0][0].url)).toEqual({
      lang: "vi",
      utm_source: "telegram",
      utm_medium: "social",
      utm_campaign: "story",
      utm_content: "button-abcdef12",
    });
    const [captionLink] = hrefs(buildAlbumCaption(story)).slice(-1);
    expect(params(captionLink)).toMatchObject({
      utm_campaign: "story",
      utm_content: "link-abcdef12",
    });
  });
});

describe("Facebook UTMs", () => {
  it("tags the digest link with the edition campaign", () => {
    const { link } = buildFacebookDigest(
      { lang: "en", date: "2026-10-14", bullets: [{ text: "One", url: null }] },
      "https://aidr.today"
    );
    expect(link).toBe(
      "https://aidr.today/date/2026-10-14?lang=en&utm_source=facebook&utm_medium=social&utm_campaign=digest-2026-10-14&utm_content=post"
    );
  });

  it("tags a story link with the story campaign", () => {
    const { link } = buildFacebookStory(
      { ...story, lang: "en" },
      "https://aidr.today"
    );
    expect(params(link)).toEqual({
      lang: "en",
      utm_source: "facebook",
      utm_medium: "social",
      utm_campaign: "story",
      utm_content: "post-abcdef12",
    });
  });
});

describe("Email UTMs", () => {
  const unsub = unsubscribeUrl("tok-secret", "en");
  const settings = settingsUrl("tok-secret", "en");
  const edition = {
    utm_source: "email",
    utm_medium: "digest",
    utm_campaign: "digest-2026-10-14",
  };

  const digest = renderDigestEmail({
    date: "2026-10-14",
    lang: "en",
    unsubscribeUrl: unsub,
    settingsUrl: settings,
    feedbackToken: "tok-secret",
    stories: [
      { text: "First. Detail.", url: OWN, headline: "First" },
      { text: "Second. Detail.", url: THIRD_PARTY, headline: "Second" },
    ],
  });

  it("gives every aidr.today link in the HTML the edition campaign", () => {
    const own = hrefs(digest.html).filter(
      (h) =>
        new URL(h).hostname === "aidr.today" &&
        !/unsubscribe=|settings=|\/feedback/.test(h)
    );
    expect(own.length).toBeGreaterThan(4);
    for (const h of own) {
      expect(params(h)).toMatchObject(edition);
      expect(params(h).utm_content).toBeTruthy();
    }
  });

  it("tags the plain-text story and CTA links, with no data or subscribe footer links", () => {
    expect(digest.text).toContain("utm_content=lead");
  });

  it("leaves token links and publisher URLs untagged in HTML and text", () => {
    for (const out of [digest.html.replaceAll("&amp;", "&"), digest.text]) {
      expect(out).toContain(unsub);
      expect(out).toContain(settings);
    }
    const feedback = hrefs(digest.html).filter((h) => h.includes("/feedback"));
    expect(feedback.length).toBeGreaterThan(0);
    for (const h of feedback) expect(h).not.toContain("utm_");
    expect(digest.html).not.toContain(`${THIRD_PARTY}&amp;utm_`);
  });

  it("uses a weekly campaign for the weekly edition", () => {
    const weekly = renderDigestEmail({
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
    expect(weekly.text).toContain("utm_campaign=weekly-2026-W42");
    expect(weekly.text).not.toContain("utm_campaign=digest-2026-10-14");
  });

  it("tags note markdown links, footer text and the CTA; keeps others as is", () => {
    const note = renderNoteEmail({
      subject: "Welcome",
      lang: "en",
      mailKind: "welcome",
      bodyMd: `Read [the data](https://aidr.today/data) or [TechCrunch](${THIRD_PARTY}) or [settings](${settings}).`,
      cta: { label: "Open", url: "https://aidr.today/" },
      unsubscribeUrl: unsub,
      settingsUrl: settings,
    });
    const expected = {
      utm_source: "email",
      utm_medium: "welcome",
      utm_campaign: "welcome",
    };
    const links = hrefs(note.html);
    const data = links.find((h) => h.includes("/data") && h.includes("body"));
    expect(params(data as string)).toMatchObject({
      ...expected,
      utm_content: "body",
    });
    expect(links).toContain(THIRD_PARTY);
    expect(links).toContain(settings);
    expect(links).toContain(unsub);
    expect(note.text).toContain(
      "the data (https://aidr.today/data?lang=en&utm_source=email"
    );
    expect(note.text).toContain(`TechCrunch (${THIRD_PARTY})`);
    expect(note.text).toContain(`Settings: ${settings}`);
  });

  it("digestCampaign is the edition date", () => {
    expect(digestCampaign("2026-10-14")).toBe("digest-2026-10-14");
  });
});

describe("per-post utm_content", () => {
  const fullId = "0123456789abcdef".repeat(4);

  it("keys a story post by its 8-character id prefix, which the landing reader keeps", () => {
    const { link } = buildFacebookStory(
      { ...story, id: fullId, lang: "en" },
      "https://aidr.today"
    );
    expect(params(link).utm_content).toBe("post-01234567");
    expect(readCampaign(new URL(link).search)?.utm_content).toBe(
      "post-01234567"
    );
  });

  it("names the slot first so GA4 still groups by slot", () => {
    expect(postContent("button", fullId)).toBe("button-01234567");
    expect(postContent("link", fullId)).toBe("link-01234567");
  });
});
