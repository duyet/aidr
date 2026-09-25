# Telegram Instant View decision record

- **Issue:** [#146](https://github.com/duyet/aidr/issues/146)
- **Status:** **No live IV; manual proof of concept only; production no-go for now**
- **Checked:** 2026-09-25 against `origin/master` (`94bd26ce667f7de0bfbe2fa9ce234e64e18f5c19`)
- **Scope:** one public, stable **story** page per language, not the homepage or digest list
- **Current state:** locale/canonical URLs and locale-aware Telegram link generation are implemented in source/master; public-channel output is unverified/legacy; Instant View is not live

This is a decision record and operator checklist, not a claim that Instant View
(IV) is enabled. The current master source has a shared `lang=vi|lang=en` URL
contract, explicit story canonicals, and flat locale-aware Telegram link
builders, but it still has no IV template, editor-generated `rhash`, or code path
that creates or sends an IV link. These are source/adapter contracts, not
evidence of what the current public channel has emitted; the channel may still
run a legacy deployment. No live channel audit or rollout evidence is attached
to this PR. This change adds no Telegram sending code, credentials, channel
target, template, `rhash`, WAF rule, or deployment/configuration change.

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

| IV property | aidr contract | Gate |
| --- | --- | --- |
| `title` | The title actually rendered for the requested language (`title` for EN, `title_vi` for VI when present) | Required. If VI falls back to English, record that fact; escape/render as content, never as instructions. |
| `body` | The localized public story summary/body and its source links, as rendered on the story page | Required. Do not claim this is the full original article when the page only has a summary. No interactive widgets or untrusted instructions. |
| `published_date` | `published_at` as Unix **seconds** | Required for news stories by the aidr gate; do not send milliseconds. |
| `image_url` | A manually selected, public HTTPS primary image | Required for this POC. The operator must verify size, format/MIME, dimensions, and reachability; current master does not provide the full media validation described here. |
| `site_name` | **Unresolved here:** current metadata emits `AI News`, while the visible header brand is `AI;DR`; verify the name shown on the homepage in the IV Editor | Telegram's format property is optional, but its link-preview checklist requires a matching visible site name. Do not append the Telegram handle or silently freeze either brand value. |
| `description` | The short description actually available for the rendered language, normally the first summary paragraph | Required for a useful Telegram link preview; never invent a translation or copy. |

The official [template checklist](https://instantview.telegram.org/checklist)
also requires the publication date for news, a suitable link-preview photo, and
a `site_name` matching the name shown on the website. The current code emits
`AI News` in [`SITE_NAME`/`og:site_name`](../../apps/web/src/lib/site.ts), but
that is not enough to settle the product decision because the visible header
brand is `AI;DR`. Record the editor-approved value and the visible page used to
justify it; do not treat the current metadata constant as final IV truth. A
`cover` may be added when it is a real, non-duplicated cover; it is not a
substitute for the required image gate.

**No automated media gate is claimed here.** While [#145](https://github.com/duyet/aidr/issues/145)
and [#160](https://github.com/duyet/aidr/pull/160) remain open, the current
source path only performs limited URL syntax/protocol handling and passes an
`image_url` URL to the Telegram adapter's `sendPhoto` path
([`telegram.ts`](../../apps/web/worker/notify/telegram.ts)). It does not prove
byte size, MIME/format,
dimensions, public reachability, hotlink behavior, or Telegram acceptance.
Those are manual operator checks for this record, not runtime guarantees.

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
  "media_validation": "manual-only-until-145-and-160-merge",
  "http_url_photo_limit": "5 MB",
  "multipart_upload_photo_limit": "10 MB",
  "site_name": null,
  "site_name_status": "unresolved-verify-visible-brand-in-editor",
  "rhash": "editor-generated-only"
}
```

`source_url_template` describes the aidr source URL only. `iv_link_shape` is a
shape for the editor-produced wrapper, not a query template to commit or a
promise that the editor will match both language variants.
`editor_query_template: null` records that uncertainty explicitly; the editor
review must establish the query scope and exact `View in Telegram` output.
`site_name: null` means the decision is deliberately unresolved: current
metadata says `AI News`, the visible header says `AI;DR`, and the
editor/reviewer must record the final link-preview value. The media limit fields
are operator reference values only: the current HTTP-URL photo path is bounded
at 5 MB for this checklist, while a multipart upload path is bounded at 10 MB.
Neither limit is an automated aidr validation, and no locale implementation,
Telegram adapter, or live IV surface is changed by this record.

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
- **Media limits (reference only):** the [IV checklist](https://instantview.telegram.org/checklist#6-2-1-image-quality)
  recommends images around 1280–2560px and says images over 5 MB fail to load
  in IV. That IV rendering guidance is distinct from Bot API transport limits:
  for the current HTTP-URL [`sendPhoto`](https://core.telegram.org/bots/api#sendphoto)
  path, use a **5 MB HTTP-URL photo ceiling**; a new photo uploaded through
  `multipart/form-data` is documented up to **10 MB**. Width plus height must
  be at most 10,000, aspect ratio at most 20, and captions at most 1,024
  characters. The current adapter passes the URL and does not implement these
  checks; while [#145](https://github.com/duyet/aidr/issues/145) and
  [#160](https://github.com/duyet/aidr/pull/160) remain open, treat all of these
  as manual operator reference, not automated size, format, or
  public-reachability validation.
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

## Manual approval and verification checklist

### Contract and template

- [ ] Product and operations owners approve **limited support** (or change this
      record to no-go) for one public story-per-language POC.
- [ ] Verify the current-master locale contract instead of waiting for [#139](https://github.com/duyet/aidr/issues/139)
      or [#140](https://github.com/duyet/aidr/issues/140) to close: both
      `?lang=en` and `?lang=vi` story URLs return the requested rendered
      language, canonical/hreflang rules agree, and cache keys do not cross
      languages. See [`LOCALE_URLS.md`](../../apps/web/LOCALE_URLS.md).
- [ ] For each candidate, **manually** verify the current primary image is
      public HTTPS and usable for the link preview; [#145](https://github.com/duyet/aidr/issues/145)
      / [#160](https://github.com/duyet/aidr/pull/160) remain separate media
      work. This is not an automated check. Exclude the story when the image is
      missing, unsafe, too large, unsupported, or not publicly reachable.
- [ ] Treat the 5 MB HTTP-URL photo ceiling and 10 MB multipart-upload ceiling
      as manual transport references only; do not claim that the current
      adapter measures bytes, checks MIME/format, or proves public reachability
      while [#145](https://github.com/duyet/aidr/issues/145) and
      [#160](https://github.com/duyet/aidr/pull/160) remain open.
- [ ] In the [IV Editor](https://instantview.telegram.org/), create/test a
      template only for `aidr.today/{8-hex-id}?lang=en|vi`; do not target the
      homepage, digest, legacy category paths, or arbitrary external URLs.
- [ ] Test both explicit language source URLs in the Editor. Confirm that the
      query variant reaches the intended template and that the rendered content
      matches the requested language; do not assume one query template or
      `rhash` covers both variants.
- [ ] Resolve and record `site_name`. Current metadata emits `AI News`, while
      the visible header brand is `AI;DR`; compare the homepage and editor
      preview, then record the exact accepted value rather than appending a
      Telegram handle or other metadata.
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
      delivery state. This documentation-only slice adds no such behavior.
- [ ] If public availability is desired, submit the template through the IV
      approval flow and wait for approval. Until then, label the result as an
      editor/test-audience path only.

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
- [Telegram Bot API](https://core.telegram.org/bots/api) — available methods, `sendMessage`, `sendPhoto`, URL/multipart transport limits, and no IV lifecycle method.
- [Telegram Instant View announcement](https://telegram.org/blog/instant-view) — product background.
- Internal contracts: [#139](https://github.com/duyet/aidr/issues/139), [#140](https://github.com/duyet/aidr/issues/140), [#145](https://github.com/duyet/aidr/issues/145), [`LOCALE_URLS.md`](../../apps/web/LOCALE_URLS.md), [`ALGORITHM.md`](../../apps/web/ALGORITHM.md), [`site.ts`](../../apps/web/src/lib/site.ts), [`telegram.ts`](../../apps/web/worker/notify/telegram.ts), and [`notifications` migration](../../apps/web/migrations/0014_notifications.sql).
