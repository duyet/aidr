# Telegram Instant View decision record

- **Issue:** [#146](https://github.com/duyet/aidr/issues/146)
- **Status:** **No live IV; manual proof of concept only; production no-go for now**
- **Checked:** 2026-09-25 against `origin/master` (`94bd26ce667f7de0bfbe2fa9ce234e64e18f5c19`)
- **Updated:** 2026-09-28 by [#231](https://github.com/duyet/aidr/issues/231) —
  the **no-go status is unchanged**. That pass made the *field* gate automatic,
  made the link-preview format deliberate, and made the editor checklist
  runnable. It added no template, no `rhash`, no Bot API IV lifecycle call, and
  no production rollout.
- **Scope:** one public, stable **story** page per language, not the homepage or digest list
- **Current state:** locale/canonical URLs and locale-aware Telegram link generation are implemented in source/master; public-channel output is unverified/legacy; Instant View is not live

This is a decision record and operator checklist, not a claim that Instant View
(IV) is enabled. The current master source has a shared `lang=vi|lang=en` URL
contract, explicit story canonicals, flat locale-aware Telegram link builders,
and — since [#231](https://github.com/duyet/aidr/issues/231) — an automated
**field gate** that answers "is this story IV-eligible?" as a query. It still
has no IV template, editor-generated `rhash`, or code path that creates or
sends an IV link. These are source/adapter contracts, not evidence of what the
current public channel has emitted; the channel may still run a legacy
deployment. No live channel audit or rollout evidence is attached to this
change. It adds no Telegram credentials, channel target, template, `rhash`, WAF
rule, or deployment/configuration change.

## Decision

Keep a bounded, manually approved IV proof of concept for eligible public story
URLs. The locale/canonical contract is already implemented in current master
(see [`LOCALE_URLS.md`](../../apps/web/LOCALE_URLS.md) and merged PRs
[#163](https://github.com/duyet/aidr/pull/163) / [#170](https://github.com/duyet/aidr/pull/170)).
Media normalization is still tracked separately by [#145](https://github.com/duyet/aidr/issues/145)
and [#160](https://github.com/duyet/aidr/pull/160), so every candidate still
needs a manual media/content check. Keep the source/master normal Telegram
message/photo path as the source of truth and fallback; verify the deployed
channel separately before describing its output as current.

| Flow | Decision | Reason |
| --- | --- | --- |
| Ranked story | Manual IV POC for each eligible language URL being evaluated; do not create a second normal delivery | A story permalink is relatively static, but the current page is a summary surface rather than a guaranteed full article. |
| Bilingual daily digest | No IV wrapper | It is a changing list, not an article. Keep the source adapter's HTML digest message and its story links. |
| Telegram channel | Adapter contract: normal message/photo with explicit `lang` on aidr links | The channel is an audience and delivery target, not an IV source page or a second language identity. Actual public-channel output requires a live audit. |

`lang` identifies the content and canonical source URL. It is not a delivery
identity: the existing notification key remains `digest:<local-date>` for a
digest and the story id for a trending post, and the database primary key is
`(channel, item_id)`. A manual EN/VI comparison must not send two production
posts for the same story or create a second `lang`-keyed delivery row. The
source adapter is Vietnamese-first, but a story without a Vietnamese
translation resolves to its actual English fallback and `lang=en` links. Do
not infer either behavior from the current public channel until its deployed
revision and output have been audited.

This is intentionally conservative even though the locale URL contract is
implemented now.
There is no approved template or editor-generated `rhash`, no Bot API IV
lifecycle method, and no guarantee that a summary page satisfies Telegram's
essential-content checklist. Telegram's cache can also serve stale content, so
this record chooses a manual-only path and the normal message/photo fallback
rather than claiming a completed EN/VI IV render.

## URL contract

The current web permalink is a flat `/{8-character-id}` path. Category paths,
full hashes, and title slugs are legacy or compatibility shapes, not the
preferred source URL. Locale-aware canonicals, hreflang, redirects, and cache
isolation are documented in [`LOCALE_URLS.md`](../../apps/web/LOCALE_URLS.md)
and implemented by [`slug.ts`](../../apps/web/src/lib/slug.ts),
[`seo.ts`](../../apps/web/src/lib/seo.ts), and the shared locale helpers.

For a manual IV source URL, explicitly select one of the two product languages:

```text
https://aidr.today/{story_id8}?lang=en
https://aidr.today/{story_id8}?lang=vi
```

`{story_id8}` means the first eight lowercase hexadecimal characters of the
stable story id. The source URL must be HTTPS, on `aidr.today`, have no
fragment, and contain exactly one `lang` value: `en` or `vi`. Do not use
`locale`, a language-neutral URL, a category URL, a login URL, or an external
article URL as the IV source. A `lang=vi` URL is eligible for a Vietnamese IV
only when its rendered content is actually Vietnamese; if the page falls back
to English, record the fallback and do not label it as a Vietnamese render.

The IV fetch should use the locale URL **without UTM parameters** so tracking
does not create a second cache identity. Keep attribution on the normal web
button/fallback link. The source notifier adds UTM attribution with
[`withUtm`](../../apps/web/worker/notify/telegram.ts); that adapter behavior is
not proof of the links currently visible in the public channel.

### Adapter/source link contract (not live-channel evidence)

The following describes the current source/master adapters only. It is not an
observation of the public channel, which may still emit legacy messages from a
different deployment or configuration. The public-channel output is unverified;
the channel must not be described as using these links until a live audit and
rollout record the deployed revision, target, and actual message evidence.

The source adapters use the flat locale-aware URL: the digest loader resolves
[`storyPath`](../../apps/web/worker/notify/index.ts), and the Telegram adapter's
[`storyUrl`](../../apps/web/worker/notify/telegram.ts) uses the same shape.
There is no pending category-path mismatch in source. The adapter contract is:

- A digest bullet would point to `https://aidr.today/{story_id8}?lang=vi|en&utm_source=telegram`.
- The digest's site button would point to `https://aidr.today/?lang=vi|en&utm_source=telegram`.
- A trending story's **Read** button would point to the story's publisher/source
  URL with `utm_source=telegram`; the **AI;DR** button would point to
  `https://aidr.today/{story_id8}?lang=vi|en&utm_source=telegram`.
- Publisher/source URLs are not rewritten to add an aidr `lang` parameter. The
  resolved content language is carried by aidr's canonical links and message
  copy in the source adapter.

The record does not turn the **Read**, **AI;DR**, or digest links into
`t.me/iv` links, and it does not claim that the current public channel already
contains the adapter's direct links. See the live channel audit/rollout
checklist below before making any such claim.

### URL wrapper shapes

These are illustrative shapes only. `{rhash-from-editor}` is a placeholder, not
a value to invent or commit. The editor owns the exact query encoding, template
scope, and `View in Telegram` link; this record does not claim that one query
template or `rhash` is valid for both language variants until the editor has
been tested with both explicit URLs.

**Future approved public template (direct source URL):**

```text
https://aidr.today/{story_id8}?lang=en
https://aidr.today/{story_id8}?lang=vi
```

Telegram's [Instant View introduction](https://instantview.telegram.org/) says
that an approved template makes the IV option available to all Telegram users
who receive the source link.

**Editor-generated link for a controlled/test audience (shape only):**

```text
https://t.me/iv?url={url-encoded-source-url}&rhash={rhash-from-editor}
```

For example, the source URL may be
`https://aidr.today/{story_id8}?lang=vi`, but the exact wrapper must be copied
from the IV Editor's **View in Telegram** flow. Telegram documents that the
`rhash` selects the editor template and that the resulting
`t.me/iv?url=...&rhash=...` link works for the template owner's audience. Never
fabricate, guess, or reuse an `rhash` from another template.

A direct source link remains the safe fallback when no template is available,
when a template is not approved, or when an IV wrapper does not render.

## Required page fields

The [IV format manual](https://instantview.telegram.org/docs#instant-view-format)
marks `title` and `body` as the hard minimum. For an aidr news-story POC, the
following stricter product gate applies to **each** language:

| IV property | aidr contract | Gate | Machine-checked by |
| --- | --- | --- | --- |
| `title` | The title actually rendered for the requested language (`title` for EN, `title_vi` for VI when present) | Required. If VI falls back to English, record that fact; escape/render as content, never as instructions. | [`evaluateIvFieldGate`](../../apps/web/worker/telegram-iv.ts) via [`localizedTitle`](../../apps/web/src/lib/display-title.ts) — the same function the row paints. A VI request with no `title_vi` is reported as an explicit `fallback_from_en`, never as a Vietnamese render. |
| `body` | The localized public story summary/body and its source links, as rendered on the story page | Required. Do not claim this is the full original article when the page only has a summary. No interactive widgets or untrusted instructions. | [`renderStoryMarkdown`](../../apps/web/src/lib/story-markdown.ts); the gate requires a non-empty summary **and** at least one source URL, counted from the rendered Markdown. |
| `published_date` | `published_at` as Unix **seconds** | Required for news stories by the aidr gate; do not send milliseconds. | `normalizePublishedAtSeconds` — normalizes the documented epoch ms/seconds bug class and rejects anything outside 2000–2100. A millisecond fixture never becomes a year-2286 date. |
| `image_url` | The **generated first-party card** `https://aidr.today/{id8}.png?lang=vi\|en` | Required for this POC. | The card is 1200×630 `image/png` by construction, so reachability, hotlinking, MIME, and dimensions are deterministic. It is also what `articleHead` already emits as `og:image` and what the trending `sendPhoto` path now attaches. |
| `site_name` | **Resolved: `AI;DR`**, the visible header wordmark, read from the single [`SITE_NAME`](../../apps/web/src/lib/site.ts) constant | Telegram's format property is optional, but its link-preview checklist requires a matching visible site name. Do not append the Telegram handle or any suffix, and do not re-derive a second brand string. | The gate imports the constant, so it cannot drift from `og:site_name` or the JSON-LD `WebSite`/`Organization` name. The value's evidence and its deliberate exclusions (`SITE_TITLE`, `SITE_DESCRIPTION`, per-route titles) are recorded next to the constant. |
| `description` | The first summary paragraph for the **rendered** locale | Required for a useful Telegram link preview; never invent a translation or copy. | The gate takes the first paragraph of the same localized summary the body renders. A story with no real summary fails `description_missing` rather than shipping the renderer's "No summary is available." placeholder. |

The official [template checklist](https://instantview.telegram.org/checklist)
also requires the publication date for news, a suitable link-preview photo, and
a `site_name` matching the name shown on the website. `site_name` is no longer
open: it is `AI;DR`, read from the one constant that also feeds `og:site_name`
and the site's JSON-LD entity names, so the metadata surface and the visible
brand cannot drift apart again. The check that remains is the editor-side
comparison of that value against the rendered header — not a second decision.
Re-verify it in the IV Editor if the header wordmark ever changes, and change
the constant with it — never the metadata alone. A `cover` may be added when it
is a real, non-duplicated cover; it is not a substitute for the required image
gate.

### The field gate is now automated; the acceptance proof is not

[`worker/telegram-iv.ts`](../../apps/web/worker/telegram-iv.ts) is the
machine-checkable field gate this record previously said did not exist. It
answers "is this `{id8}` + `lang` story IV-eligible?" as a small, structured,
redacted verdict (`iv_eligible`, `reason`, `reasons`, `fields`, `limits`,
`source_url`, `unresolved`), reachable two ways with **no Telegram
credential**:

- `GET /api/admin/notify/iv?id=<8hex>&lang=vi|en` — bearer-gated, operator-only.
- `verify-aidr doctor iv --id <8hex> --lang vi|en` — local, public, read-only.

What it **proves**: the six fields above, `published_date` in seconds, the
generated card's declared MIME/dimensions/ceiling margins, and — for a
candidate that is *not* the generated card — byte size, container, dimensions,
and reachability through a **byte-bounded, SSRF-checked** probe
(`isFetchableUrl` / `fetchWithSafeRedirects` with a `Range` request, a strict
byte budget, and an explicit body cancel). The Worker never downloads or
proxies a whole media file. It **fails closed** on a missing image, a
private-literal / credentialed / plain-HTTP URL, an oversized file, an
unsupported container, and an ambiguous id prefix.

What it still **does not prove**, exactly as before: Telegram's rendering or
acceptance, hotlink behaviour of third-party media, cache freshness, and
whether one editor template covers both language variants. Those remain the
manual checks below. The gate is a precondition for the editor work, not a
substitute for it.

### Encoded limits

`TELEGRAM_IV_LIMITS` in [`worker/telegram-iv.ts`](../../apps/web/worker/telegram-iv.ts)
holds the documented ceilings, each with its source:

| Constant | Value | Source |
| --- | --- | --- |
| `httpUrlPhotoBytes` | 5 MB | [Bot API `sendPhoto`](https://core.telegram.org/bots/api#sendphoto) (HTTP URL) |
| `multipartUploadPhotoBytes` | 10 MB | [Bot API `sendPhoto`](https://core.telegram.org/bots/api#sendphoto) (multipart) |
| `dimensionSumPx` | 10,000 | [Bot API `sendPhoto`](https://core.telegram.org/bots/api#sendphoto) |
| `aspectRatio` | 20 | [Bot API `sendPhoto`](https://core.telegram.org/bots/api#sendphoto) |
| `captionChars` | 1,024 | [Bot API `sendPhoto`](https://core.telegram.org/bots/api#sendphoto) |
| IV rendered image guidance | 1280–2560 px recommended, over 5 MB fails to load | [IV checklist](https://instantview.telegram.org/checklist#6-2-1-image-quality) |

The 5 MB / 10 MB pair are **transport** ceilings; the IV image guidance is a
**rendering** ceiling. Different numbers for different reasons, kept separate.

### Data-only URL contract

This is a review fixture, not executable locale code, an IV template, or a
claim that the query shape is accepted by the editor:

```json
{
  "source_url_template": "https://aidr.today/{story_id8}?lang={lang}",
  "iv_link_shape": "https://t.me/iv?url={url-encoded-source-url}&rhash={rhash-from-editor}",
  "editor_query_template": null,
  "editor_query_template_status": "unresolved-verify-both-lang-variants",
  "allowed_lang": ["en", "vi"],
  "story_id_pattern": "^[0-9a-f]{8}$",
  "utm_in_iv_source": false,
  "image_url_template": "https://aidr.today/api/og/{story_id8}.png?lang={lang}",
  "image_url_source": "generated-first-party-card",
  "field_gate": "worker/telegram-iv.ts#evaluateIvFieldGate",
  "media_validation": "automated-bounded-preflight-plus-manual-editor-acceptance",
  "http_url_photo_limit": "5 MB",
  "multipart_upload_photo_limit": "10 MB",
  "site_name": "AI;DR",
  "site_name_source": "SITE_NAME in apps/web/src/lib/site.ts",
  "site_name_status": "resolved-visible-header-brand-2026-09-27",
  "rhash": "editor-generated-only"
}
```

`source_url_template` describes the aidr source URL only. `iv_link_shape` is a
shape for the editor-produced wrapper, not a query template to commit or a
promise that the editor will match both language variants.
`editor_query_template: null` records that uncertainty explicitly; the editor
review must still establish the query scope and exact `View in Telegram` output.
`site_name` is no longer open: it is `AI;DR`, taken from the single `SITE_NAME`
constant that also feeds `og:site_name` and the site's JSON-LD entity names.
That removes the drift risk *and* settles the value; the remaining check is the
editor-side comparison against the rendered header. The media limit fields are
now encoded in `TELEGRAM_IV_LIMITS` and enforced by the bounded preflight, with
the 5 MB ceiling for the HTTP-URL photo path and 10 MB for a multipart upload.
Neither limit proves Telegram acceptance, and this record still changes no
delivery key, adds no template, and enables no live IV surface.

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
- **WAF-independent prerequisite:** verify that prerequisite from an ordinary
  independent browser/network path, without changing WAF rules, allowlists, or
  deployment settings. A challenge, login, or non-HTML response is a recorded
  blocker for the manual POC; do not work around it in this documentation-only
  slice or claim that the source is IV-ready.
- **Cache/staleness:** Telegram says IV pages are cached on its servers; the
  [checklist](https://instantview.telegram.org/checklist#2-1-pages-with-dynamic-content)
  warns that older pages update less frequently. There is no documented
  freshness SLA or guaranteed refresh in the sources linked here. Do not use
  IV for a live homepage, changing digest, or other real-time list, and keep a
  direct web link available for the freshest content.
- **Media limits (encoded, not proven):** the [IV checklist](https://instantview.telegram.org/checklist#6-2-1-image-quality)
  recommends images around 1280–2560px and says images over 5 MB fail to load
  in IV. That IV rendering guidance is distinct from Bot API transport limits:
  for the current HTTP-URL [`sendPhoto`](https://core.telegram.org/bots/api#sendphoto)
  path, use a **5 MB HTTP-URL photo ceiling**; a new photo uploaded through
  `multipart/form-data` is documented up to **10 MB**. Width plus height must
  be at most 10,000, aspect ratio at most 20, and captions at most 1,024
  characters. These five numbers are now constants in `TELEGRAM_IV_LIMITS` and
  the bounded preflight enforces them for a non-generated candidate, with each
  value asserted at its exact boundary in the unit tests. They still do **not**
  prove Telegram acceptance, and the delivery path's own image is the generated
  1200×630 card, which is inside every ceiling by construction.
- **Supported content:** preserve the story's essential text, headings, source
  links, and suitable media. If an essential element is unsupported, omit IV
  rather than silently dropping content.

## Safe fallback and delivery state

For every failed or unapproved IV path, keep the existing normal path. A future
implementation must produce exactly one result for the existing delivery key;
it must not send an IV post and a fallback post beside one another.

The source/master normal path is:

1. send the HTML digest message with its direct story links; or
2. send the source adapter's photo message, falling back to that text message if the
   photo call fails.

Both messages set `link_preview_options` explicitly rather than inheriting the
API default — see "Link-preview format" below. The photo path attaches the
**generated first-party card**, the same image the field gate approves, so a
reader's link preview can never be a 404 upstream thumb. That is a format
change only: it does not change the delivery key, add a second post, or enable
IV.

This describes adapter code, not a verified public-channel transcript. The
live channel must be audited after the relevant rollout before this fallback is
described as current channel behavior.

The source/master flat, locale-aware fallback shapes are:

```text
https://aidr.today/{story_id8}?lang=vi&utm_source=telegram
https://aidr.today/{story_id8}?lang=en&utm_source=telegram
```

For a trending post, the source adapter's **Read** button points to the
publisher source, while **AI;DR** points to the flat canonical story URL. A
manual IV test may compare both language source URLs, but it must retain this
one-message/one-delivery-key behavior. The existing
[`notifications`](../../apps/web/worker/notify/index.ts) state records status,
attempts, and the Telegram message id; a successful message is the point at
which a delivery is considered sent. A timeout can be ambiguous, so inspect the
test channel and reconcile the message id before a manual retry rather than
blindly posting twice.

## Link-preview format (no `rhash`, no template, no approval needed)

The reader-visible "plain link preview" is what most people get today, and it
is produced by Telegram from the page's own Open Graph tags. Making it
predictable needs no Telegram approval. Two things were made deliberate:

**1. `link_preview_options` is set explicitly on all three sends.** The adapter
exports `DIGEST_LINK_PREVIEW`, `STORY_PHOTO_LINK_PREVIEW`, and
`STORY_TEXT_LINK_PREVIEW`, all `{ is_disabled: true }`, with the reasoning
recorded next to them in
[`telegram.ts`](../../apps/web/worker/notify/telegram.ts):

- `is_disabled` — **set**. Both messages build their links as HTML `<a>`
  entities and inline buttons, which Telegram never previews, so a preview can
  only appear if a future copy edit pastes a bare URL into a bullet. It would
  then attach to one arbitrary bullet and misdescribe the whole message.
- `prefer_small_media` / `prefer_large_media` — **not set**. There is no
  affordance to prefer: the trending post already ships one large card, and a
  preview per digest bullet would be eight images in one message.
- `show_above_text` — **not set**. With `is_disabled` there is no preview to
  place, and on the photo path the card *is* the message.

**2. The photo path attaches the generated card.** `sendPhoto` now uses
`https://aidr.today/{id8}.png?lang=vi|en` (1200×630, first-party, 200 by
construction) instead of the upstream thumbnail, falling back to the normalized
manifest thumbnail only when the id cannot address a card. This is the same
choice `articleHead` already made for `og:image`, and it is the image the field
gate approves, so the channel post and the link preview agree.

> **Superseded in part (#202).** Album delivery has since landed: a story with
> several manifest images now goes out as one `sendMediaGroup` (2–10 items) of
> the story's own images, and `sendPhoto` is used only for a single image so
> the Read button survives — `sendMediaGroup` has no `reply_markup`, so an
> album carries that link in its caption instead. The
> `📎 +N more` line no longer means "more images exist"; it names only the
> images that did **not** fit inside the 10-item cap. Video files are still
> deferred; a poster is the image actually sent. See `worker/notify/telegram.ts`
> (`TELEGRAM_ALBUM_CAP`, `resolveStoryMedia`).
>
> The generated card is also no longer the lead image. It is the fallback: used
> when the story has no usable image, and as a one-shot retry when Telegram
> rejects the story image, because the card is first-party and 200 by
> construction where an upstream URL may be hotlink-blocked. It therefore no
> longer occupies an album slot, and on the image path the post image is no
> longer the gate-approved card — so the "post and link preview agree" claim
> above now holds only when the post falls back to the card.

Neither change touches `lang` as a delivery identity: the digest key is still
`digest:<local-date>`, a trending post is still keyed by the story id, and
`notifications` keeps its `(channel, item_id)` primary key. Exactly one message
per delivery key, and a failed media call still falls back to text **once**.

## Manual approval and verification checklist

### Run the field gate first

Every manual check below starts from a machine verdict. Run it for **both**
language variants of the same story and keep the output as evidence:

```bash
verify-aidr doctor iv --id <8hex> --lang vi
verify-aidr doctor iv --id <8hex> --lang en
```

The command prints the per-field verdict, probes the generated card over HTTP
(`200 image/png`, `1200x630`), and ends with the exact source URL to paste into
the [IV Editor](https://instantview.telegram.org/) plus the unresolved items as
labelled placeholders. It exits non-zero when the story is not eligible.

It is a **precondition**, not an approval. It does not build a `t.me/iv` link,
does not create a template, does not send anything, and needs no bot token or
channel id. The `{rhash-from-editor}` placeholder in its output is literal: the
only real `rhash` exists inside your own editor session, and `verify-aidr`
asserts in its unit tests that it can emit no other value.

### Contract and template

- [ ] Product and operations owners approve **limited support** (or change this
      record to no-go) for one public story-per-language POC.
- [ ] Verify the current-master locale contract instead of waiting for [#139](https://github.com/duyet/aidr/issues/139)
      or [#140](https://github.com/duyet/aidr/issues/140) to close: both
      `?lang=en` and `?lang=vi` story URLs return the requested rendered
      language, canonical/hreflang rules agree, and cache keys do not cross
      languages. See [`LOCALE_URLS.md`](../../apps/web/LOCALE_URLS.md).
- [ ] Run `verify-aidr doctor iv` for both language variants and confirm it
      agrees with the rendered page: title, `published_date`, and the generated
      card. A `fallback_from_en` verdict is expected for a story with no
      `title_vi`; record it, do not present it as a Vietnamese render.
- [ ] Confirm the verdict's `image_url` is the generated first-party card
      (`/api/og/{id8}.png`) and that it returns `200 image/png` at 1200×630. If
      a candidate is *not* the generated card, run the bounded preflight
      (`--image <https url>`) and record its `probe_bytes` and reason; a
      candidate that fails any gate is excluded, not repaired.
- [ ] In the [IV Editor](https://instantview.telegram.org/), create/test a
      template only for `aidr.today/{8-hex-id}?lang=en|vi`; do not target the
      homepage, digest, legacy category paths, or arbitrary external URLs.
- [ ] Test both explicit language source URLs in the Editor. Confirm that the
      query variant reaches the intended template and that the rendered content
      matches the requested language; do not assume one query template or
      `rhash` covers both variants.
- [ ] Verify the resolved `site_name` in the editor. The value is decided —
      `AI;DR` from `SITE_NAME` (see [`site.ts`](../../apps/web/src/lib/site.ts))
      — so this is a confirmation that the editor preview shows the same word
      the header paints, not a new decision. Do not append a Telegram handle or
      other metadata.
- [ ] With sanitized fixtures, verify one representative EN story and one VI
      story in the Editor: title, body, publication date, image, site name,
      description, and source links. If VI content falls back to English, record
      the fallback and use the actual language in the evidence.
- [ ] Confirm the source is public `text/html` from an independent ordinary
      browser/network path, contains no secrets or untrusted instructions, and
      has no essential interactive content. Do not change WAF, allowlists, or
      settings to make this check pass; a challenge is a recorded blocker.
- [ ] Use **View in Telegram** to obtain the exact editor link for each tested
      source URL. Keep any generated `rhash` in approved operator/runtime
      configuration; do not put a made-up value, a bot token, or a production
      channel target in this repo.
- [ ] Before any implementation, mocked Bot API tests cover success, malformed
      responses, timeouts, unsupported media, bounded retry, and idempotent
      delivery state. Those tests now exist for the parts this repository owns
      (photo path, text fallback, `notifications` upsert), but they are **not**
      evidence that an IV template renders; that is what the evidence template
      below records.
- [ ] If public availability is desired, submit the template through the IV
      approval flow and wait for approval. Until then, label the result as an
      editor/test-audience path only.

### Evidence template for the manual checks

The checks above are only meaningful if a rollout can point at what was
actually observed. Copy this block per rollout, fill it in, and attach it to
the follow-up decision. A blank field is a **blocker**, not a pass — do not
delete a row to make the template look complete.

```text
IV POC evidence — run <ISO date> by <operator handle>

Target
  disposable channel:            <disposable channel label; NEVER a production target>
  disposable bot:                <label; token stored outside this repo>
  source head / Worker revision:  <git sha or wrangler version id>
  prod channel touched?          no            <- must be "no" for a POC

Machine gate (both language variants; paste the verdict summary)
  verify-aidr doctor iv --id <id8> --lang vi   ->  ELIGIBLE / NOT ELIGIBLE (<reason>)
  verify-aidr doctor iv --id <id8> --lang en   ->  ELIGIBLE / NOT ELIGIBLE (<reason>)
  fallback_from_en:                             <yes/no, and which field fell back>
  generated card:                               <status> <content-type> <WxH>  probe_bytes=<n>
  non-generated candidate (if any):             <verdict + reason, or "n/a">

Editor (per language variant)
  editor URL used:            https://instantview.telegram.org/
  source URL pasted:          https://aidr.today/<id8>?lang=<vi|en>
  title rendered:             <exact string>
  body contains summary:      <yes/no>     body contains source links: <yes/no + count>
  published_date rendered:    <exact value; seconds, not ms>
  image_url rendered:         <exact URL>  <WxH, MIME>
  site_name rendered:         <exact value>  (visible header showed: <exact value>)
  description rendered:       <exact value>
  one query covers both langs <yes/no — if no, record two queries>

t.me/iv wrapper (transcribe from View in Telegram; do not fabricate)
  link shape observed:        https://t.me/iv?url=<...>&rhash=<...>
  rhash stored where:          <approved operator/runtime config path>   <- not this repo
  is this an editor/test-audience link only?   <yes — no public approval claimed>

Telegram client matrix (disposable target only)
  mobile  iOS / Android:      <app version>  VI: <ok/fail>  EN: <ok/fail>
  desktop Telegram Desktop:   <version>      VI: <ok/fail>  EN: <ok/fail>
  direct source URL fallback: <ok/fail>
  link preview image:         <first-party card ok / wrong image / none>

Failure matrix (each must yield ONE usable post, no duplicate)
  missing image:              <result>
  404 / source failure:        <result>
  timeout:                    <result + how the message id was reconciled>
  unsupported media:          <result>
  no template:                <result — confirm the direct link still works>

Delivery state after every attempt
  notifications row:          channel=<...> item_id=<digest:<date> | story id> status=<sent|failed> attempts=<n> message_id=<...>
  second lang-keyed row?      no            <- must be "no"
  duplicate post observed?    <no — else this is a blocker>

Decision
  outcome:                     <proceed to editor POC / remain no-go / revert to no-go>
  still unresolved:            <rhash storage, query template, site_name brand, public approval>
```

Two rules make this template usable rather than decorative:

1. **No credentials, ever.** The channel and bot are described by label only.
   A token or a channel id in this block invalidates the evidence.
2. **`lang` is not a delivery identity.** The two language variants above share
   one delivery key. If filling in the matrix created a second `notifications`
   row or a second post, stop and record a blocker instead of continuing.

### Live channel audit and rollout evidence

The source/adapter contract is not evidence of the public channel's current
output. Before calling the channel behavior current or enabling a rollout,
record all of the following:

- [ ] The deployed Worker revision/release, target channel, and relevant
      configuration, with enough evidence to compare them to the intended
      source head. If the deployed revision is older, label the output legacy
      or unverified.
- [ ] Sanitized evidence from the actual channel for one digest and one
      trending story: message IDs/timestamps, `notifications` status/attempts/
      message id, the exact link targets (publisher/source, **AI;DR**, and
      digest links), resolved `lang`, and UTM parameters.
- [ ] Evidence that the normal path remains the fallback, that retries and
      ambiguous timeouts do not duplicate posts, and that the observed output
      matches the approved source/adapter contract. Attach this evidence to the
      rollout or follow-up decision; this PR does not perform the audit.

### Disposable-channel test

- [ ] Use a disposable bot/channel selected by the operator; never use a
      production channel or commit credentials.
- [ ] Open the direct source URL and the generated IV link on mobile and
      desktop Telegram. Verify the selected language, all required fields,
      image, source link, and direct fallback.
- [ ] Exercise missing image, 404/source failure, timeout, unsupported media,
      and no-template cases. Confirm the normal message/photo path produces
      one usable post and no duplicate.
- [ ] Confirm the delivery key remains `digest:<local-date>` for a digest or
      the story id for a trending post; do not send a second EN/VI post or
      create a `lang`-keyed notification row during the comparison.
- [ ] Check `notifications` status/attempts/message id and the channel history
      after every attempt, including an ambiguous timeout.
- [ ] Re-check the official links above at implementation time and attach the
      manual evidence to the follow-up decision; this document alone is not
      production approval.

## Sources

- [Telegram Instant View introduction](https://instantview.telegram.org/) — templates, public approval, and `t.me/iv?url=...&rhash=...`.
- [Telegram Instant View format/manual](https://instantview.telegram.org/docs) — required properties, `text/html`, supported media, and IV processing.
- [Telegram Instant View template checklist](https://instantview.telegram.org/checklist) — news date, link-preview metadata, image limits, unsupported content, and cache warnings.
- [Telegram Bot API](https://core.telegram.org/bots/api) — available methods, `sendMessage`, `sendPhoto`, `link_preview_options`, URL/multipart transport limits, and no IV lifecycle method.
- [Telegram Instant View announcement](https://telegram.org/blog/instant-view) — product background.
- Internal contracts: [#139](https://github.com/duyet/aidr/issues/139), [#140](https://github.com/duyet/aidr/issues/140), [#145](https://github.com/duyet/aidr/issues/145), [#202](https://github.com/duyet/aidr/issues/202), [#224](https://github.com/duyet/aidr/issues/224), [`LOCALE_URLS.md`](../../apps/web/LOCALE_URLS.md), [`ALGORITHM.md`](../../apps/web/ALGORITHM.md), [`site.ts`](../../apps/web/src/lib/site.ts), [`telegram-iv.ts`](../../apps/web/worker/telegram-iv.ts), [`iv-gate.ts`](../../apps/web/worker/notify/iv-gate.ts), [`telegram.ts`](../../apps/web/worker/notify/telegram.ts), and [`notifications` migration](../../apps/web/migrations/0014_notifications.sql).
