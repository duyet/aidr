# Analytics and attribution

AI;DR records privacy-safe page views and campaign/channel attribution for the website, Chrome extension, email digest, and Telegram links. Search text, email addresses, tokens, and story prose are not event parameters.

## Sub-features

- `page-view` records the initial page and SPA route changes.
- `campaign-touch` preserves the first campaign landing in the session.
- `telegram-landing`, `email-click`, and `extension-landing` identify channel arrivals.
- `channel-click` records Chrome, Telegram, and Email CTA clicks.
- `extension-page-view` records the unpacked new-tab page view.

## How to get to it (user POV)

- Open a campaign URL such as `/?utm_source=telegram&utm_medium=channel&utm_campaign=verify`.
- Use the Get AI;DR menu, phone menu, or footer to choose a delivery channel.
- Open the Chrome extension new tab and click a channel link.

## Driving it with verify-aidr

Preconditions:

- `verify-aidr doctor` reports `ok: true`.
- Runtime event assertions require a real browser or the focused unit suites; HTTP alone cannot observe client-side `gtag` calls.

- **Campaign HTTP proof.** Run `.agents/skills/verify-aidr/bin/verify-aidr drive analytics`. The saved HTML must be 200 for Telegram, email, and `/subscribe` entry points, and the report must show all three channel links.
- **GA4 destination (#703).** Run `.agents/skills/verify-aidr/bin/verify-aidr drive ga4-tid` after a deploy. It loads a campaign URL in headless Chrome and reads every GA4 hit's `tid`. `ok` needs `channel_landing` on the configured id (`DEFAULT_GA_MEASUREMENT_ID`, or `VERIFY_AIDR_GA_ID`) and no app event on any other id. `searchTermHits` and `enhancedMeasurement` list Enhanced Measurement hits, which only GA4 Admin can turn off. Set `CHROME_BIN` when no system Chrome is installed.
- **Focused web tests.** Run `pnpm --filter @aidr/web exec vitest run src/lib/analytics src/components/PageViewTracker.test.tsx` (registry, `track()`, landing attribution, URL privacy, web vitals, generated doc).
- **Extension proof.** Run `pnpm --filter @aidr/extension test` (`js/track.test.js` covers the GET tagging) and `pnpm --filter @aidr/extension verify`.
- **Browser proof.** In the web and extension pages, inspect the browser analytics queue after load and after a channel click; expect `page_view`, the matching landing event, and `channel_click` with the channel name.

## Gotchas

- GA loads asynchronously; an HTTP response is not proof that a browser event fired.
- Do not add raw search queries, email addresses, tokens, or message text to event parameters.
- The extension sends campaign-tagged GETs to `/api/extension`; this is intentional and is not an analytics SDK. The route ignores the query, so these events appear only in Cloudflare request logs. They are listed under Extension events in `docs/analytics-events.md`.
- A missing Telegram token or chat ID is a configuration skip, not a public-link failure.
