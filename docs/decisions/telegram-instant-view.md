# Telegram Instant View decision record

- **Issue:** [#146](https://github.com/duyet/aidr/issues/146)
- **Status:** **Limited support: manual proof of concept only; production no-go for now**
- **Checked:** 2026-09-24 against `origin/master` (`d205f31`)
- **Scope:** one public, stable **story** page per language, not the homepage or digest list

This is a contract and operator checklist, not a claim that Instant View (IV) is
enabled. This change adds no Telegram sending code, credentials, channel target,
template, or `rhash`.

## Decision

Support a bounded, manually approved IV proof of concept for a public story URL
after the locale and media contracts land. Keep the existing normal Telegram
message/photo path as the source of truth and fallback.

| Flow | Decision | Reason |
| --- | --- | --- |
| Ranked story | Manual IV POC, one story per language | A story permalink is relatively static and has a defined title, body, date, image, and source links. |
| Bilingual daily digest | No IV wrapper | It is a changing list, not an article. Use the current HTML digest message and direct story links. |
| Vietnamese channel | Normal message/photo; link to a `lang=vi` story when available | The channel is an audience, not an IV source page. Do not turn the channel or digest into a generated page. |

This is intentionally conservative. On this base, locale is still cookie-based
(`news_lang`), the canonical locale/SEO contract is tracked by [#139](https://github.com/duyet/aidr/issues/139)
and [#140](https://github.com/duyet/aidr/issues/140), and media validation is
tracked by [#145](https://github.com/duyet/aidr/issues/145). Do not call the
`?lang=` URLs below live until those changes are merged and verified.

## URL contract

The current web permalink is a flat `/{8-character-id}` path; category paths,
full hashes, and title slugs are not the preferred source URL. See
[`src/lib/slug.ts`](../../apps/web/src/lib/slug.ts) and the existing SEO
metadata in [`src/lib/seo.ts`](../../apps/web/src/lib/seo.ts).

For the pending locale contract, the IV source URL **must explicitly select one
of the two product languages**:

```text
https://aidr.today/{story_id8}?lang=en
https://aidr.today/{story_id8}?lang=vi
```

`{story_id8}` means the first eight lowercase hexadecimal characters of the
stable story id. The IV source URL must be HTTPS, on `aidr.today`, have no
fragment, and contain exactly one `lang` value: `en` or `vi`. Do not use
`locale`, a language-neutral URL, a category URL, a login URL, or an external
article URL as the IV source.

The IV fetch should use the locale URL **without UTM parameters** so tracking
does not create a second cache identity. Keep attribution on the normal web
button/fallback link. The current notifier adds UTM attribution with
[`withUtm`](../../apps/web/worker/notify/telegram.ts).

**Known current-state mismatch:** the digest loader in
[`worker/notify/index.ts`](../../apps/web/worker/notify/index.ts) still builds
a category path, while the story button in
[`telegram.ts`](../../apps/web/worker/notify/telegram.ts) uses the flat path.
This record does not change either adapter; reconcile the mismatch with the
locale/canonical work before generating IV links.

### URL wrapper shapes

These are shapes only; `{rhash-from-editor}` is a placeholder, not a value to
invent or commit.

**Approved public template (direct source URL):**

```text
https://aidr.today/{story_id8}?lang=en
https://aidr.today/{story_id8}?lang=vi
```

Telegram's [Instant View introduction](https://instantview.telegram.org/) says
that an approved template makes the IV option available to all Telegram users
who receive the source link.

**Editor-generated template for a controlled/test audience:**

```text
https://t.me/iv?url=https%3A%2F%2Faidr.today%2F{story_id8}%3Flang%3Dvi&rhash={rhash-from-editor}
```

Telegram documents that the `rhash` selects the editor template and that the
resulting `t.me/iv?url=...&rhash=...` link works for the template owner's
audience. Copy the exact value produced by the IV Editor's **View in Telegram**
flow. Never fabricate, guess, or reuse an `rhash` from another template.

A direct source link remains the safe fallback when no template is available,
when a template is not approved, or when an IV wrapper does not render.

## Required page fields

The [IV format manual](https://instantview.telegram.org/docs#instant-view-format)
marks `title` and `body` as the hard minimum. For an aidr news-story POC, the
following stricter product gate applies to **each** language:

| IV property | aidr contract | Gate |
| --- | --- | --- |
| `title` | Localized story title (`title` for EN, `title_vi` for VI when present) | Required. Escape/render as content, never as instructions. |
| `body` | Localized public story summary/body and its source links, as rendered on the story page | Required. Do not claim this is the full original article when the page only has a summary. No interactive widgets or untrusted instructions. |
| `published_date` | `published_at` as Unix **seconds** | Required for news stories by the aidr gate; do not send milliseconds. |
| `image_url` | Absolute HTTPS primary image selected by the media contract | Required for this POC. If it is missing, unsafe, too large, or unsupported, do not force an IV. |
| `site_name` | `AI News`, matching the site's current `SITE_NAME`/`og:site_name` | Required for the aidr link-preview contract; do not append the Telegram handle or other text. |
| `description` | A short localized description, normally the first summary paragraph | Required for a useful Telegram link preview; never invent copy. |

The official [template checklist](https://instantview.telegram.org/checklist)
also requires the publication date for news, a suitable link-preview photo,
and a `site_name` matching the name shown on the website. A `cover` may be
added when it is a real, non-duplicated cover; it is not a substitute for the
required image gate.

### Data-only URL contract

This is a review fixture, not executable locale code and not a test of the
pending implementation:

```json
{
  "source_url_template": "https://aidr.today/{story_id8}?lang={lang}",
  "allowed_lang": ["en", "vi"],
  "story_id_pattern": "^[0-9a-f]{8}$",
  "utm_in_iv_source": false,
  "rhash": "editor-generated-only"
}
```

No locale implementation or Telegram adapter is changed by this record.

## Platform constraints and cache

- **No Bot API IV method:** the current [Bot API reference](https://core.telegram.org/bots/api#available-methods)
  has no method to create, publish, refresh, or invalidate an IV page or
  template. The existing adapter therefore continues to use ordinary
  [`sendMessage`](https://core.telegram.org/bots/api#sendmessage) and
  [`sendPhoto`](https://core.telegram.org/bots/api#sendphoto) calls. IV is a
  Telegram link/template surface, not a delivery method in this codebase.
- **Public source requirement:** Telegram's [IV manual](https://instantview.telegram.org/docs)
  says its bot fetches a source URL with MIME type `text/html`. The story page
  must be publicly reachable without a session, contain no secrets, and not
  depend on a form, login, paywall, or interactive widget to be understood.
- **Cache/staleness:** Telegram says IV pages are cached on its servers; the
  [checklist](https://instantview.telegram.org/checklist#2-1-pages-with-dynamic-content)
  warns that older pages update less frequently. There is no documented
  freshness SLA or guaranteed refresh in the sources linked here. Do not use
  IV for a live homepage, changing digest, or other real-time list, and keep a
  direct web link available for the freshest content.
- **Media gates:** the [IV checklist](https://instantview.telegram.org/checklist#6-2-1-image-quality)
  recommends images around 1280–2560px, says images over 5 MB fail to load,
  and limits `srcset` selection to 2560px. The current Bot API
  [`sendPhoto`](https://core.telegram.org/bots/api#sendphoto) limit is 10 MB,
  width plus height at most 10,000, aspect ratio at most 20, and captions at
  most 1,024 characters. Those limits are context for [#145](https://github.com/duyet/aidr/issues/145);
  this slice does not change media sending.
- **Supported content:** preserve the story's essential text, headings, source
  links, and suitable media. If an essential element is unsupported, omit IV
  rather than silently dropping content.

## Safe fallback and delivery state

For every failed or unapproved IV path, use exactly one existing normal path:

1. send the current HTML message with the direct story link; or
2. send the current photo message, falling back to that text message if the
   photo call fails.

The locale-aware tracked fallback shape is (the current adapter still needs
the locale work in [#140](https://github.com/duyet/aidr/issues/140)):

```text
https://aidr.today/{story_id8}?lang=vi&utm_source=telegram
https://aidr.today/{story_id8}?lang=en&utm_source=telegram
```

Keep the original source link separate when it has passed the normal media/link
validation. If the IV wrapper fails, do not send a second fallback post beside
it. The existing [`notifications`](../../apps/web/worker/notify/index.ts)
state records status, attempts, and the Telegram message id; a successful
message is the point at which a delivery is considered sent. A timeout can be
ambiguous, so inspect the test channel and reconcile the message id before a
manual retry rather than blindly posting twice.

## Manual approval and verification checklist

### Contract and template

- [ ] Product and operations owners approve **limited support** (or change this
      record to no-go) for one public story-per-language POC.
- [ ] [#139](https://github.com/duyet/aidr/issues/139) and [#140](https://github.com/duyet/aidr/issues/140)
      are merged and verified: both `?lang=en` and `?lang=vi` render the
      requested language, canonical/hreflang rules agree, and cache keys do not
      cross languages.
- [ ] [#145](https://github.com/duyet/aidr/issues/145) supplies a safe primary
      image or the story is excluded from the POC.
- [ ] In the [IV Editor](https://instantview.telegram.org/), create/test a
      template only for `aidr.today/{8-hex-id}?lang=en|vi`; do not target the
      homepage, digest, legacy category paths, or arbitrary external URLs.
- [ ] With sanitized fixtures, verify one representative EN story and one VI
      story in the Editor: title, body, publication date, image, `AI News`
      site name, description, and source links.
- [ ] Confirm the source is public `text/html`, contains no secrets or
      untrusted instructions, and has no essential interactive content.
- [ ] Use **View in Telegram** to obtain the exact editor link. Keep any
      generated `rhash` in approved operator/runtime configuration; do not put a
      made-up value, a bot token, or a production channel target in this repo.
- [ ] Before any implementation, mocked Bot API tests cover success, malformed
      responses, timeouts, unsupported media, bounded retry, and idempotent
      delivery state. This documentation-only slice adds no such behavior.
- [ ] If public availability is desired, submit the template through the IV
      approval flow and wait for approval. Until then, label the result as an
      editor/test-audience path only.

### Disposable-channel test

- [ ] Use a disposable bot/channel selected by the operator; never use a
      production channel or commit credentials.
- [ ] Open the direct source URL and the generated IV link on mobile and
      desktop Telegram. Verify the selected language, all required fields,
      image, source link, and direct fallback.
- [ ] Exercise missing image, 404/source failure, timeout, unsupported media,
      and no-template cases. Confirm the normal message/photo path produces
      one usable post and no duplicate.
- [ ] Check `notifications` status/attempts/message id and the channel history
      after every attempt, including an ambiguous timeout.
- [ ] Re-check the official links above at implementation time and attach the
      manual evidence to the follow-up decision; this document alone is not
      production approval.

## Sources

- [Telegram Instant View introduction](https://instantview.telegram.org/) — templates, public approval, and `t.me/iv?url=...&rhash=...`.
- [Telegram Instant View format/manual](https://instantview.telegram.org/docs) — required properties, `text/html`, supported media, and IV processing.
- [Telegram Instant View template checklist](https://instantview.telegram.org/checklist) — news date, link-preview metadata, image limits, unsupported content, and cache warnings.
- [Telegram Bot API](https://core.telegram.org/bots/api) — available methods, `sendMessage`, and `sendPhoto`; no IV lifecycle method.
- [Telegram Instant View announcement](https://telegram.org/blog/instant-view) — product background.
- Internal contracts: [#139](https://github.com/duyet/aidr/issues/139), [#140](https://github.com/duyet/aidr/issues/140), [#145](https://github.com/duyet/aidr/issues/145), [`ALGORITHM.md`](../../apps/web/ALGORITHM.md), and [`telegram.ts`](../../apps/web/worker/notify/telegram.ts).
