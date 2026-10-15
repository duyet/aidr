# Analytics events

Generated from `apps/web/src/lib/analytics/events.ts` by `pnpm --filter @aidr/web analytics:docs`. Do not edit by hand.

Every event the app sends is a row in the registry. Two kinds are not rows in the table below: events the Chrome extension sends, listed under Extension events, and events a vendor script sends by itself, listed under Vendor automatic events. `track(name, params)` accepts only registry names and their exact params, so a wrong name, a missing or extra param, or an enum value outside its list fails `check-types`. At runtime, keys outside the row are dropped and each value must pass its kind. No kind accepts free text: a param holds an item id, an enum value, a number, a pathname without its query, a slug written in code, or a category or tag name from the feed. PostHog events also carry `surface: "web"`.

To add an event, add a row with the product question it answers, call `track()`, and rerun the command above.

## Events

| Event | Sender | Sinks | Params | Fires from | Question |
| --- | --- | --- | --- | --- | --- |
| `page_view` | browser | ga4 | `page_path`: pathname<br>`page_type`: `home`, `story`, `day`, `week`, `calendar`, `data`, `subscribe`, `about`, `other` | `apps/web/src/components/PageViewTracker.tsx` | Which pages and page types do readers reach? |
| `channel_landing` | browser | ga4, posthog | `channel`: `extension`, `telegram`, `email`, `facebook`, `youtube`, `rss`, `other`<br>`page_type`: `home`, `story`, `day`, `week`, `calendar`, `data`, `subscribe`, `about`, `other`<br>`page_path`: pathname<br>`utm_medium?`: code slug<br>`utm_campaign?`: code slug<br>`utm_content?`: code slug | `apps/web/src/components/PageViewTracker.tsx` | Which channel, campaign and slot brings readers in, and to which page? |
| `nav_click` | browser | ga4, posthog | `to`: `/`, `/weeks`, `/calendar`, `/about`, `/brand`, `/mcp`, `/data`, `/data/algo`, `/data/runs`, `/contribute`, `/release`, `/privacy`, `/terms`, `/sign-in`, `extension`, `telegram`, `github`, `duyet.net`, `anyrouter.dev`<br>`placement`: `header`, `header_menu`, `phone_menu`, `footer`, `subscribe_page` | `apps/web/src/components/NewsFooter.tsx`<br>`apps/web/src/components/header/Brand.tsx`<br>`apps/web/src/components/header/GetAIDRMenu.tsx`<br>`apps/web/src/components/header/HeaderAuth.tsx`<br>`apps/web/src/components/header/PhoneMenu.tsx` | `to` is one of `NAV_TARGETS` (route path like `/weeks`, or a bare name like `github`, never an href or query). Which navigation links get used, from which placement? |
| `channel_click` | browser | ga4, posthog | `channel`: `extension`, `telegram`, `email`, `facebook`, `youtube`, `rss`, `other`<br>`placement`: `header`, `header_menu`, `phone_menu`, `footer`, `subscribe_page`<br>`lang?`: `vi`, `en` | `apps/web/src/components/NewsFooter.tsx`<br>`apps/web/src/components/header/GetAIDRMenu.tsx`<br>`apps/web/src/components/header/PhoneMenu.tsx`<br>`apps/web/src/components/subscribe/ChromeChannel.tsx`<br>`apps/web/src/components/subscribe/FacebookChannel.tsx`<br>`apps/web/src/components/subscribe/TelegramChannel.tsx` | Which follow or install CTA, in which placement, gets clicked? |
| `topic_filter` | browser | ga4, posthog | `tag`: feed label<br>`from`: `nav`, `trending`, `search` | `apps/web/src/components/CategoryNav.tsx`<br>`apps/web/src/components/SearchBox.tsx`<br>`apps/web/src/components/TrendingChips.tsx` | Which topics do readers filter by, and from where? |
| `search` | browser | ga4, posthog | `query_len`: integer ≥ 0 | `apps/web/src/components/SearchBox.tsx` | Do readers run a full search? |
| `tldr_toggle` | browser | ga4, posthog | `view`: `image`, `text` | `apps/web/src/components/TldrSection.tsx` | Do readers prefer the image or the text TL;DR? |
| `calendar_open` | browser | ga4, posthog | `placement`: `popover`, `sheet` | `apps/web/src/components/header/CalendarButton.tsx` | Do readers browse past editions? |
| `intro_video_open` | browser | ga4, posthog | `placement`: `header`, `phone_menu` | `apps/web/src/components/header/IntroVideo.tsx` | Does the intro video get opened? |
| `story_view` | browser | ga4, posthog | `item_id`: item id (hex)<br>`via`: `row`<br>`page_type`: `home`, `story`, `day`, `week`, `calendar`, `data`, `subscribe`, `about`, `other` | `apps/web/src/components/StoryRow.tsx` | Which stories get opened, how, and on which page? |
| `source_click` | browser | ga4, posthog | `item_id`: item id (hex)<br>`placement`: `row`, `dialog`, `sources` | `apps/web/src/components/StoryRow.tsx`<br>`apps/web/src/components/story-dialog/DialogHeader.tsx`<br>`apps/web/src/components/story/StorySources.tsx` | Is the summary enough, or do readers go to the source? |
| `media_open` | browser | ga4, posthog | `item_id?`: item id (hex)<br>`media`: `thumb`, `image`, `video`<br>`index?`: integer ≥ 0 | `apps/web/src/components/StoryThumb.tsx`<br>`apps/web/src/components/story/MediaGallery.tsx` | Is story media worth its bytes? |
| `prefs_change` | browser | ga4, posthog | `pref`: `bg`, `theme`, `font`, `fontSize`, `density`, `reset`, `tldrCount`, `bilingualDialog`, `sections.trending`, `sections.tldr`, `sections.days`, `sections.categories`<br>`pref_value?`: `default`, `cream`, `gray`, `dark`, `black`, `light`, `sans`, `serif`, `dense`, `compact`, `medium`, `comfortable`, `relaxed`, `spacious`, `airy`, `8`, `12`, `16`, `on`, `off` | `apps/web/src/components/TldrSection.tsx`<br>`apps/web/src/components/prefs/SettingsTab.tsx`<br>`apps/web/src/components/prefs/ThemeTab.tsx`<br>`apps/web/src/components/story-dialog/DialogHeader.tsx` | Which reader settings get changed, and to what? |
| `lang_change` | browser | ga4, posthog | `lang`: `vi`, `en` | `apps/web/src/routes/__root.tsx` | How often do readers switch language, and to which? |
| `subscribe_submit` | browser | ga4, posthog | `source`: `news`, `extension` | `apps/web/src/components/EmailSubscribeForm.tsx` | Who starts an email signup, from which form? |
| `subscribe_success` | browser | ga4, posthog | `source`: `news`, `extension` | `apps/web/src/components/EmailSubscribeForm.tsx` | Which forms turn into a signup request? |
| `subscribe_error` | browser | ga4, posthog | `source`: `news`, `extension`<br>`reason`: `invalid`, `rate_limited`, `network`, `server` | `apps/web/src/components/EmailSubscribeForm.tsx` | Why do signups fail? |
| `web_vitals` | browser | ga4, posthog | `metric_name`: `LCP`, `CLS`, `INP`, `FCP`, `TTFB`<br>`value`: integer ≥ 0<br>`metric_value`: number<br>`metric_rating`: `good`, `needs-improvement`, `poor`<br>`metric_id?`: code slug<br>`navigation_type`: `navigate`, `reload`, `back-forward`, `back-forward-cache`, `prerender`, `restore`, `soft-navigation`<br>`edge_cache`: `HIT`, `MISS`, `none`<br>`page_path`: pathname | `apps/web/src/lib/analytics/web-vitals.ts` | Are Core Web Vitals healthy, by edge cache state? |

## Extension events

The Chrome extension has no analytics SDK (its privacy policy forbids one). It sends each event as a GET to `/api/extension`, tagged `ref=extension` and the `utm_*` params listed under Outgoing link tags, with the event name and its params joined into `utm_content`. The route ignores the query and returns the release JSON, so these events reach no vendor and exist only in Cloudflare request logs. Rows are `EXTENSION_EVENTS` in the registry file. Where a name matches a web event, the param set is the extension's own: `prefs_change` uses `to` where the web row uses `pref_value`, and `channel_click` has no `placement`.

| Event | Params | Fires from | Question |
| --- | --- | --- | --- |
| `page_view` | none | `apps/extension/js/newtab.js` | How often is the extension's new tab opened? |
| `lang_change` | `lang`: `vi`, `en` | `apps/extension/js/newtab.js` | How often do new-tab readers switch language, and to which? |
| `prefs_change` | `pref`: `categories`, `trending`, `tldr`, `days`<br>`to`: `on`, `off` | `apps/extension/js/settings-panel.js` | Which new-tab sections do readers turn on or off? |
| `channel_click` | `channel`: `chrome`, `telegram`, `email`<br>`to`: code slug | `apps/extension/js/newtab.js`<br>`apps/extension/js/track.js` | Which follow or install link on the new tab gets clicked? |

## Vendor automatic events

These are sent by vendor scripts without a `track()` call, so they are not registry rows and app code cannot change their params. The list is `VENDOR_EVENTS` in `apps/web/src/lib/analytics/vendor-events.ts`.

| Vendor | Event | Fires | Handling |
| --- | --- | --- | --- |
| posthog | `$pageview` | On load and on every history change. | Kept; this is why `page_view` goes to GA4 only. URL properties are sanitized in `before_send`. |
| posthog | `$autocapture` | On clicks, form changes and submits on interactive elements. | Kept; link hrefs and page URLs are sanitized in `before_send`. |
| posthog | `$exception` | On uncaught errors and unhandled rejections (`capture_exceptions`). | Kept; page URLs are sanitized in `before_send`. |
| ga4 | `session_start, first_visit, user_engagement` | Sent by gtag.js on its own for every session. | Kept. They carry the sanitized `page_location`. |
| ga4 | `scroll, click, view_search_results, form_start, form_submit` | Enhanced Measurement: 90% scroll, outbound clicks, site search, form interactions. | Must be off in GA4 Admin, see GA4 Enhanced Measurement below. App code cannot change what they send. |
| ga4 | `page_view (history change)` | Enhanced Measurement: page changes based on browser history. | Must be off in GA4 Admin. The app sends its own `page_view` on every route change. |
| jitsu | `page` | Once per full page load, queued through `jitsuQ`. | p.js runs with `data-init-only`, so only the app's call with a sanitized URL is sent. |

Seline loads only when `VITE_SELINE_TOKEN` is set and records its own page views. No custom event goes to it.

## GA4 custom dimensions

GA4 reports a param only after it is registered as a custom dimension, and registration is not retroactive. Register these in GA4 Admin > Custom definitions before deploying a change that adds one. A param shared by several events is one dimension, and its values are the union across those events.

| Parameter | Scope | Values | Events |
| --- | --- | --- | --- |
| `channel` | Event | `extension`, `telegram`, `email`, `facebook`, `youtube`, `rss`, `other` | `channel_landing`, `channel_click` |
| `edge_cache` | Event | `HIT`, `MISS`, `none` | `web_vitals` |
| `from` | Event | `nav`, `trending`, `search` | `topic_filter` |
| `lang` | Event | `vi`, `en` | `channel_click`, `lang_change` |
| `media` | Event | `thumb`, `image`, `video` | `media_open` |
| `metric_name` | Event | `LCP`, `CLS`, `INP`, `FCP`, `TTFB` | `web_vitals` |
| `metric_rating` | Event | `good`, `needs-improvement`, `poor` | `web_vitals` |
| `page_type` | Event | `home`, `story`, `day`, `week`, `calendar`, `data`, `subscribe`, `about`, `other` | `page_view`, `channel_landing`, `story_view` |
| `placement` | Event | `header`, `header_menu`, `phone_menu`, `footer`, `subscribe_page`, `popover`, `sheet`, `row`, `dialog`, `sources` | `nav_click`, `channel_click`, `calendar_open`, `intro_video_open`, `source_click` |
| `pref` | Event | `bg`, `theme`, `font`, `fontSize`, `density`, `reset`, `tldrCount`, `bilingualDialog`, `sections.trending`, `sections.tldr`, `sections.days`, `sections.categories` | `prefs_change` |
| `pref_value` | Event | `default`, `cream`, `gray`, `dark`, `black`, `light`, `sans`, `serif`, `dense`, `compact`, `medium`, `comfortable`, `relaxed`, `spacious`, `airy`, `8`, `12`, `16`, `on`, `off` | `prefs_change` |
| `reason` | Event | `invalid`, `rate_limited`, `network`, `server` | `subscribe_error` |
| `source` | Event | `news`, `extension` | `subscribe_submit`, `subscribe_success`, `subscribe_error` |
| `via` | Event | `row` | `story_view` |
| `view` | Event | `image`, `text` | `tldr_toggle` |

## Outgoing link tags

`channel_landing` reads the UTM params below from the landing URL. Every aidr.today link we post carries all four, built by `apps/web/worker/utm.ts` (the video scripts use `videos/daily-news/scripts/site-links.mjs`, and YouTube descriptions get theirs in `yt-meta.py`). `apps/web/worker/__tests__/outbound-links.test.ts` renders each surface and fails on an untagged aidr.today link. Third-party URLs, URLs that already have `utm_*`, and links with a subscriber token (settings, unsubscribe, feedback) are never tagged. `lang` is kept as its own param.

| Channel | `utm_source` | `utm_medium` | `utm_campaign` | `utm_content` |
| --- | --- | --- | --- | --- |
| Email digest | `email` | `digest` | `digest-YYYY-MM-DD`, `weekly-YYYY-Www` | `lead`, `s2`..., `cta`, `header`, `view-in-browser`, `lang-switch`, `video`, `channel-*`, `footer-data`, `footer-subscribe` |
| Email welcome, notes | `email` | `welcome`, `notes` | same as medium | `cta`, `header`, `body`, `footer-*` |
| Telegram (posts, day videos, release videos) | `telegram` | `social` | `digest-YYYY-MM-DD`, `story`, `release-vX.Y.Z` | `button`, `link`, `preview` |
| Facebook (posts, Reels) | `facebook` | `social` | `digest-YYYY-MM-DD` or `story` | `post`, `reel` |
| YouTube descriptions | `youtube` | `video` | `digest-YYYY-MM-DD`, `weekly-YYYY-Www`, `release-vX.Y.Z` | `long`, `short` |
| RSS feed | `rss` | `feed` | `story` | `item`, `channel` |
| Extension | `extension` | `newtab` | `aidr_ext` | placement (`brand`, `tldr`, ...) |

`social` is GA4's default-channel-group medium for Organic Social, and `video` with source `youtube` is Organic Video. Email keeps the mail kind as medium, and the edition is the campaign. The RSS `<guid>` stays the untagged permalink, so readers do not re-show items. Public API, MCP and `llms.txt` permalinks stay untagged: they are canonical ids that agents cite, not links a reader clicks in a channel.

## GA4 Enhanced Measurement

Turn these off in GA4 Admin > Data streams > Enhanced measurement:

- Page changes based on browser history events. `page_view` is sent by the app on every route change, so this would count each one twice. It also reads the raw URL, including `?q=`.
- Site search. It copies `?q=` into `search_term`, which puts reader search text in GA4.
- Outbound clicks. `source_click` already records source-link clicks with the item id.
- Form interactions. `form_submit` copies the form's URL, including `?q=`, into `form_destination`.

App code cannot change what these send, because they read the browser URL themselves.

PostHog captures its own `$pageview`, so `page_view` goes to GA4 only.

## GA4 destination

Every app event goes to one measurement id, `GA_MEASUREMENT_ID` (`VITE_MEASUREMENT_ID`, default `G-HXJPPQVYQN`, in `apps/web/src/lib/analytics/measurement-id.ts`). The app configures it with `send_page_view: false` and names it in each event's `send_to`.

The Cloudflare Google tag gateway, when it is on for the zone, puts its own `gtag('config', '<id>')` at the top of `<head>`. That id gets gtag.js's automatic hits (its page_view, `session_start`, `user_engagement`, and the Enhanced Measurement events its stream has on), but none of the app's events. To use one property for everything, point the gateway and `VITE_MEASUREMENT_ID` at the same id, or turn the gateway off. `GA4_PROPERTY_ID`, which the /data Audience sync reads, must be the property that owns this measurement id.

After a deploy, check the `tid` of the app's hits with `.agents/skills/verify-aidr/bin/verify-aidr drive ga4-tid`. It loads a campaign URL in headless Chrome and fails unless `channel_landing` goes to `GA_MEASUREMENT_ID` and no app event goes to another id.

## Page URLs

The app hands every vendor a sanitized page URL. GA4 `page_location` and `page_referrer`, PostHog URL properties and autocaptured link hrefs, and the Jitsu page event keep only the query params in `SAFE_PARAMS` (`apps/web/src/lib/analytics/url-privacy.ts`). Search text (`q`) and the subscribe tokens are dropped. An inline `<head>` script moves a subscribe token out of the URL before any vendor script runs.
