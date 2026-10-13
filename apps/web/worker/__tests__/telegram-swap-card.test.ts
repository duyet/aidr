import { describe, expect, it } from "vitest";
import {
  auditInsert,
  buildEditPlan,
  editAuditDetail,
  editResult,
  type PlanFacts,
  type StorySend,
} from "../../scripts/telegram-swap-card.js";

const CARD = { kind: "photo", width: 1200, height: 630 } as const;
const FALLBACK_NOTE =
  'fallback ok: sendMediaGroup:Bad Request: failed to send message #1 with the error message "WEBPAGE_CURL_FAILED"; sendPhoto:Bad Request: failed to get HTTP URL content';

function send(overrides: Partial<StorySend> = {}): StorySend {
  return {
    itemId: "c920864b9d6591c743fbf5504f6697bb7701dcdbe84218359bc79976742934cd",
    lang: "vi",
    chat: "-1004420104760",
    messageId: 255,
    lastError: null,
    url: "https://example.com/story",
    title: "Story",
    imageUrl: null,
    mediaManifest: null,
    ...overrides,
  };
}

const facts = (overrides: Partial<PlanFacts> = {}): PlanFacts => ({
  edited: false,
  media: CARD,
  arxivFigure: null,
  ...overrides,
});

describe("buildEditPlan", () => {
  it("swaps a no-image arXiv post's card for the paper's first figure", () => {
    const figure = "https://arxiv.org/html/2610.13928v1/fig1_arbitrary.png";
    const plan = buildEditPlan(
      send({ url: "https://arxiv.org/abs/2610.13928" }),
      facts({ arxivFigure: figure })
    );
    expect(plan).toMatchObject({
      evidence: "no_image_at_send",
      to: figure,
      source: "arxiv_figure",
      from: "https://aidr.today/api/og/c920864b.png?lang=vi",
    });
    expect(plan.skip).toBeUndefined();
  });

  it("replaces a card that a rejected bare marketbrief URL fell back to with the suffixed URL", () => {
    const plan = buildEditPlan(
      send({
        lastError: FALLBACK_NOTE,
        imageUrl:
          "https://static.marketbrief.now/story-media/2109688834959057238/HUcez12W8AAnUqH",
      }),
      facts()
    );
    expect(plan).toMatchObject({
      evidence: "fallback_to_card",
      to: "https://static.marketbrief.now/story-media/2109688834959057238/HUcez12W8AAnUqH-large.jpg",
      source: "gallery",
    });
  });

  it("skips a post whose card also failed: it went out as text and editMessageMedia cannot add a photo", () => {
    const plan = buildEditPlan(
      send({
        lastError:
          "fallback ok: sendPhoto:Bad Request: wrong type; sendPhoto(card):Bad Request: failed to get HTTP URL content; photo:none_sent",
        imageUrl: "https://example.com/dead.jpg",
      }),
      // No forward happens for a D1 text post.
      facts({ media: undefined })
    );
    expect(plan).toMatchObject({ skip: "text_post", to: null });
  });

  it("skips a post Telegram shows without media, whatever D1 says", () => {
    const plan = buildEditPlan(send(), facts({ media: { kind: "text" } }));
    expect(plan).toMatchObject({ skip: "text_post", to: null });
  });

  it("leaves a GIF or video post alone: it already carries real media", () => {
    const plan = buildEditPlan(
      send(),
      facts({ media: { kind: "other", type: "animation" } })
    );
    expect(plan).toMatchObject({ skip: "already_real", to: null });
  });

  it("keeps the card when the only story image is a Twitter avatar", () => {
    const plan = buildEditPlan(
      send({
        lastError: FALLBACK_NOTE,
        mediaManifest: JSON.stringify({
          assets: [
            {
              type: "image",
              url: "https://pbs.twimg.com/profile_images/1712345/abc_400x400.jpg",
            },
          ],
        }),
      }),
      facts()
    );
    expect(plan).toMatchObject({
      evidence: "fallback_to_card",
      skip: "no_real_image",
      to: null,
    });
  });

  it("leaves a post alone when D1 says a real image went out", () => {
    const plan = buildEditPlan(
      send({ imageUrl: "https://example.com/real.jpg" }),
      facts({ media: undefined })
    );
    expect(plan).toMatchObject({ skip: "not_card", evidence: null });
  });

  it("is idempotent: a post no longer 1200x630, or already edited, is not edited again", () => {
    const arxiv = {
      url: "https://arxiv.org/abs/2610.13928",
    };
    const figure = "https://arxiv.org/html/2610.13928v1/fig1_arbitrary.png";
    expect(
      buildEditPlan(
        send(arxiv),
        facts({
          media: { kind: "photo", width: 1280, height: 720 },
          arxivFigure: figure,
        })
      ).skip
    ).toBe("already_real");
    expect(
      buildEditPlan(
        send(arxiv),
        facts({ edited: true, media: undefined, arxivFigure: figure })
      ).skip
    ).toBe("already_real");
  });
});

describe("edit audit row", () => {
  const plan = buildEditPlan(
    send({ lastError: FALLBACK_NOTE, imageUrl: "https://example.com/a.jpg" }),
    facts()
  );
  if (plan.skip) throw new Error("fixture must be an edit");
  const detail = editAuditDetail(
    plan,
    "failed",
    "Bad Request: can't parse 'media'",
    { runId: "run-1", gitSha: "abc1234", captionChars: 444 }
  );

  it("matches the backfilled telegram.edit_media rows", () => {
    expect(detail).toEqual({
      v: 1,
      story: "c920864b",
      lang: "vi",
      chat: "-1004420104760",
      message_id: 255,
      evidence: "fallback_to_card",
      from: "https://aidr.today/api/og/c920864b.png?lang=vi",
      to: "https://example.com/a.jpg",
      source: "gallery",
      result: "failed",
      description: "Bad Request: can't parse 'media'",
      caption_chars: 444,
      dry_run: false,
      tool: "apps/web/scripts/telegram-swap-card.ts",
      git_sha: "abc1234",
      run_id: "run-1",
    });
  });

  it("binds the detail as a parameter, so a quote cannot reach the SQL", () => {
    const insert = auditInsert("telegram.edit_media", 1791910596734, detail);
    expect(insert.sql).not.toContain("'");
    expect(insert.sql.match(/\?/g)).toHaveLength(3);
    expect(insert.params).toEqual([
      1791910596734,
      "telegram.edit_media",
      JSON.stringify(detail),
    ]);
    expect(JSON.parse(String(insert.params[2])).description).toBe(
      "Bad Request: can't parse 'media'"
    );
  });
});

describe("editResult", () => {
  it("counts Telegram's not-modified answer as already done", () => {
    expect(
      editResult({
        ok: false,
        description:
          "Bad Request: message is not modified: specified new message content and reply markup are exactly the same",
      })
    ).toBe("unchanged");
    expect(editResult({ ok: true })).toBe("ok");
    expect(editResult({ ok: false, description: "Bad Request: nope" })).toBe(
      "failed"
    );
  });
});
