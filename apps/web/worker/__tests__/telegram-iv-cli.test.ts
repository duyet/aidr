/**
 * Guards the `verify-aidr doctor iv` CLI wiring.
 *
 * The decision record forbids fabricating an `rhash`, inventing a query
 * template, or naming a channel. The lever is the operator-facing entry point
 * for that checklist, so it must stay a thin dispatcher: it must not be able to
 * grow its own link-building or credential handling.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  IV_UNRESOLVED,
  RHASH_PLACEHOLDER,
  renderIvChecklist,
  TELEGRAM_IV_EDITOR_URL,
  TELEGRAM_IV_LINK_SHAPE,
} from "../telegram-iv.js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

const lever = readFileSync(
  path.join(REPO_ROOT, ".agents/skills/verify-aidr/bin/verify-aidr"),
  "utf8"
);
const gateScript = readFileSync(
  path.join(REPO_ROOT, "apps/web/scripts/telegram-iv-gate.ts"),
  "utf8"
);
const record = readFileSync(
  path.join(REPO_ROOT, "docs/decisions/telegram-instant-view.md"),
  "utf8"
);

/** Shapes that would indicate an invented value rather than a placeholder. */
const INVENTED_RHASH = /rhash=(?!\{rhash-from-editor\})[A-Za-z0-9_-]{4,}/;
const REAL_IV_LINK =
  /https:\/\/t\.me\/iv\?url=[^"'\s]*[A-Za-z0-9]{8,}\s*rhash=/;
const CHANNEL_ID = /(?:TELEGRAM_CHAT_ID|chat_id)\s*[:=]\s*"?-100\d{5,}/;
const BOT_TOKEN = /bot\d{6,}:[A-Za-z0-9_-]{30,}/;

describe("verify-aidr doctor iv — the tool cannot bypass the record's rules", () => {
  it("dispatches to the shared gate module, not its own copy", () => {
    expect(lever).toContain("doctor iv");
    expect(lever).toContain("apps/web/scripts/telegram-iv-gate.ts");
    expect(gateScript).toContain('from "../worker/telegram-iv"');
  });

  it("never prints an invented rhash", () => {
    for (const source of [lever, gateScript, record]) {
      expect(source).not.toMatch(INVENTED_RHASH);
      expect(source).not.toMatch(REAL_IV_LINK);
    }
    // The only rhash token the code can emit is the literal placeholder.
    expect(TELEGRAM_IV_LINK_SHAPE).toContain(`rhash=${RHASH_PLACEHOLDER}`);
    expect(RHASH_PLACEHOLDER).toBe("{rhash-from-editor}");
  });

  it("never emits a credential-shaped string or a channel id", () => {
    for (const source of [lever, gateScript, record]) {
      expect(source).not.toMatch(BOT_TOKEN);
      expect(source).not.toMatch(CHANNEL_ID);
    }
  });

  it("points at the real IV Editor and never claims a template exists", () => {
    expect(TELEGRAM_IV_EDITOR_URL).toBe("https://instantview.telegram.org/");
    const verdict = IV_UNRESOLVED.find(
      (u) => u.key === "editor_query_template"
    );
    expect(verdict?.value).toBe("null");
  });

  it("the rendered checklist is safe to paste into a ticket", () => {
    const text = renderIvChecklist({
      iv_eligible: true,
      reason: "ok",
      reasons: [],
      id: "abcdef12",
      requested_lang: "en",
      rendered_lang: "en",
      fallback_from_en: false,
      fields: {
        title: { ok: true, value: "A title", reason: null },
        body: { ok: true, value: "A summary", reason: null },
        published_date: {
          ok: true,
          value: "2026-09-27T00:00:00.000Z",
          reason: null,
        },
        image_url: {
          ok: true,
          value: "https://aidr.today/api/og/abcdef12.png",
          reason: null,
        },
        site_name: { ok: true, value: "AI News", reason: null },
        description: { ok: true, value: "A description", reason: null },
      },
      limits: {
        httpUrlPhotoBytes: 5 * 1024 * 1024,
        multipartUploadPhotoBytes: 10 * 1024 * 1024,
        dimensionSumPx: 10_000,
        aspectRatio: 20,
        captionChars: 1024,
      },
      source_url: "https://aidr.today/abcdef12?lang=en",
      editor_url: TELEGRAM_IV_EDITOR_URL,
      iv_link_shape: TELEGRAM_IV_LINK_SHAPE,
      editor_query_template: null,
      unresolved: IV_UNRESOLVED.map((u) => ({ ...u })),
      checked_at: 1_757_000_000_000,
    });
    expect(text).not.toMatch(INVENTED_RHASH);
    expect(text).not.toMatch(REAL_IV_LINK);
    expect(text).not.toMatch(BOT_TOKEN);
    expect(text).not.toMatch(CHANNEL_ID);
    expect(text).toContain("STEP 1");
    expect(text).toContain("https://aidr.today/abcdef12?lang=en");
  });
});
