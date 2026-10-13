# Analytics events

Generated from `apps/web/src/lib/analytics/events.ts` by `pnpm --filter @aidr/web analytics:docs`. Do not edit by hand.

Every event the site sends is a row in the registry. `track(name, params)` accepts only registry names and their exact params, so a wrong name, a missing or extra param, or an enum value outside its list fails `check-types`. At runtime, keys outside the row are dropped and each value must pass its kind. No kind accepts free text: a param holds an item id, an enum value, a number, a pathname without its query, a slug written in code, or a category or tag name from the feed. PostHog events also carry `surface: "web"`.

To add an event, add a row with the product question it answers, call `track()`, and rerun the command above.

## Events

| Event | Sender | Sinks | Params | Fires from | Question |
| --- | --- | --- | --- | --- | --- |
| `page_view` | browser | ga4 | `page_path`: pathname<br>`page_type`: `home`, `story`, `day`, `week`, `calendar`, `data`, `subscribe`, `about`, `other` | `apps/web/src/components/PageViewTracker.tsx` | Which pages and page types do readers reach? |
| `channel_landing` | browser | ga4, posthog | `channel`: `extension`, `telegram`, `email`, `facebook`, `youtube`, `other`<br>`page_type`: `home`, `story`, `day`, `week`, `calendar`, `data`, `subscribe`, `about`, `other`<br>`page_path`: pathname<br>`utm_medium?`: code slug<br>`utm_campaign?`: code slug<br>`utm_content?`: code slug | `apps/web/src/components/PageViewTracker.tsx` | Which channel, campaign and slot brings readers in, and to which page? |
| `nav_click` | browser | ga4, posthog | `to`: code slug<br>`placement`: `header`, `header_menu`, `phone_menu`, `footer`, `subscribe_page` | `apps/web/src/components/NewsFooter.tsx`<br>`apps/web/src/components/header/Brand.tsx`<br>`apps/web/src/components/header/GetAIDRMenu.tsx`<br>`apps/web/src/components/header/HeaderAuth.tsx`<br>`apps/web/src/components/header/PhoneMenu.tsx` | Which navigation links get used, from which placement? |
| `channel_click` | browser | ga4, posthog | `channel`: `extension`, `telegram`, `email`, `facebook`, `youtube`, `other`<br>`placement`: `header`, `header_menu`, `phone_menu`, `footer`, `subscribe_page`<br>`lang?`: `vi`, `en` | `apps/web/src/components/NewsFooter.tsx`<br>`apps/web/src/components/header/GetAIDRMenu.tsx`<br>`apps/web/src/components/header/PhoneMenu.tsx`<br>`apps/web/src/components/subscribe/ChromeChannel.tsx`<br>`apps/web/src/components/subscribe/FacebookChannel.tsx`<br>`apps/web/src/components/subscribe/TelegramChannel.tsx` | Which follow or install CTA, in which placement, gets clicked? |
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
| `subscribe_submit` | browser | ga4, posthog | `source`: `blog`, `news`, `home`, `extension` | `apps/web/src/components/EmailSubscribeForm.tsx` | Who starts an email signup, from which form? |
| `subscribe_success` | browser | ga4, posthog | `source`: `blog`, `news`, `home`, `extension` | `apps/web/src/components/EmailSubscribeForm.tsx` | Which forms turn into a signup request? |
| `subscribe_error` | browser | ga4, posthog | `source`: `blog`, `news`, `home`, `extension`<br>`reason`: `invalid`, `rate_limited`, `network`, `server` | `apps/web/src/components/EmailSubscribeForm.tsx` | Why do signups fail? |
| `web_vitals` | browser | ga4, posthog | `metric_name`: `LCP`, `CLS`, `INP`, `FCP`, `TTFB`<br>`value`: integer ≥ 0<br>`metric_value`: number<br>`metric_rating`: `good`, `needs-improvement`, `poor`<br>`metric_id`: code slug<br>`navigation_type`: `navigate`, `reload`, `back-forward`, `back-forward-cache`, `prerender`, `restore`, `soft-navigation`<br>`edge_cache`: `HIT`, `MISS`, `none`<br>`page_path`: pathname | `apps/web/src/lib/analytics/web-vitals.ts` | Are Core Web Vitals healthy, by edge cache state? |

## GA4 custom dimensions

GA4 reports a param only after it is registered as a custom dimension, and registration is not retroactive. Register these in GA4 Admin > Custom definitions before deploying a change that adds one. A param shared by several events is one dimension, and its values are the union across those events.

| Parameter | Scope | Values | Events |
| --- | --- | --- | --- |
| `channel` | Event | `extension`, `telegram`, `email`, `facebook`, `youtube`, `other` | `channel_landing`, `channel_click` |
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
| `source` | Event | `blog`, `news`, `home`, `extension` | `subscribe_submit`, `subscribe_success`, `subscribe_error` |
| `via` | Event | `row` | `story_view` |
| `view` | Event | `image`, `text` | `tldr_toggle` |

## GA4 Enhanced Measurement

Turn these off in GA4 Admin > Data streams > Enhanced measurement:

- Page changes based on browser history events. `page_view` is sent by the app on every route change, so this would count each one twice. It also reads the raw URL, including `?q=`.
- Site search. It copies `?q=` into `search_term`, which puts reader search text in GA4.
- Outbound clicks. `source_click` already records source-link clicks with the item id.

PostHog captures its own `$pageview`, so `page_view` goes to GA4 only.
