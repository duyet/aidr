# Locale URL contract

Supported locales are exactly `vi` and `en`. The canonical query parameter is
`lang`; examples are `/?lang=vi`, `/abcdef12?lang=en`, and
`/api/feed?lang=vi`.

## Request selection and rejection

All request surfaces use the shared resolver in `src/lib/lang.ts`:

1. One exact `lang` value (`vi` or `en`).
2. One exact legacy `locale` value, which is redirectable.
3. The exact `news_lang` cookie (`vi` or `en`).
4. The highest-quality supported `Accept-Language` range.
5. Vietnamese.

A single valid `locale` value redirects to one canonical `lang` value. Invalid,
repeated (`lang=vi&lang=en` or repeated `locale`), and conflicting
(`lang` + `locale`) values are rejected with `400`; they never fall through to a
cookie or header-selected language. The resolver does not use first-value wins.
The existing `news_lang` cookie name remains supported.

Locale-dependent normalization and legacy story-path redirects use `307`, never
`301`, and emit `Cache-Control: private, no-store`,
`Vary: Cookie, Accept-Language`, and the selected `Content-Language`. UTM
parameters, unrelated filters, and fragments are preserved. Error responses use
the same no-store policy. Bare `/extension` remains a permanent path-only 301,
but a locale-bearing or header/cookie-selected `/extension` request is validated
first and redirects temporarily to `/subscribe?lang=...`; malformed locale
parameters fail with `400`. The path-only `/favicon.ico` compatibility redirect
remains a permanent 301.

## SSR routes, navigation, and caching

The root route resolves locale during SSR and client navigation. Explicit root
`lang` is preserved when child routes replace search parameters. The language
toggle writes both `news_lang` and an explicit URL.

The Worker applies the locale response policy to every TanStack SSR response:

- Localized pages (`/`, story pages, `/mcp`, `/subscribe`, `/changelog`, and
  `/submit`) have explicit `vi`/`en` canonicals, hreflang links, and sitemap
  entries. Only one valid `lang` is publicly cacheable; bare and header-selected
  variants are private.
- Language-neutral public pages (`/about`, `/brand`, `/data`, `/privacy`, and
  `/terms`) render in English, canonicalize to a bare path, and use a neutral
  public policy. A locale query on those public pages is redirected to its bare
  canonical URL; an explicit valid locale is also persisted to the
  `news_lang` cookie so a following full-page request keeps the selection. When
  a cookie or `Accept-Language` selects the navigation locale used by internal
  links, the neutral response also varies by those headers. `/mail`,
  `/sign-in/*`, and `/sign-up/*` are also English and private, but retain a
  valid explicit locale so authenticated navigation does not lose the selected
  language.
- User-specific surfaces, including `/mail`, `/sign-in/*`, `/sign-up/*`, and
  tokenized `/subscribe?unsubscribe=...` or `/subscribe?settings=...`, are always
  `private, no-store` and vary by `Cookie, Accept-Language`.
- All SSR redirects and 4xx/5xx responses are private, no-store, and varied by
  cookie and `Accept-Language`. Successful explicit-locale HTML is indexable;
  bare localized variants are `noindex, follow` and remain private. Public assets,
  discovery documents, and language-neutral APIs such as freshness/extension
  metadata are not made locale variants by this policy.

The explicit query is part of every localized cache key, so Vietnamese and
English responses cannot share an edge-cache entry.

## Canonicals, hreflang, and sitemap

Homepage, story, and localized static-page canonicals use an explicit `lang`.
Each localized page emits `hreflang=vi`, `hreflang=en`, and `x-default` pointing
to Vietnamese. The sitemap lists both explicit homepage locales, both explicit
locales for each localized static page, and exactly two URLs per story. Neutral
pages appear once at their bare URL; no bare localized URL is listed.

## JSON API contract

`/api/public`, `/api/feed`, and `/api/story/{id}` use the same strict locale
resolver. One valid legacy `locale` value gets a 307 canonical redirect;
invalid/repeated/conflicting values get a bilingual JSON error with
`Content-Language: en, vi`, `private, no-store`,
`Vary: Cookie, Accept-Language`, and `X-Robots-Tag: noindex, nofollow`.
Database and not-found errors use the same headers.

Successful feed/public/story JSON remains bilingual by design. The `lang` field
selects the explicit permalink language and `available_langs` is
`["en", "vi"]`; `Content-Language: en, vi` describes the payload rather than
filtering away the other translation. CORS `Vary: Origin` is merged into, not
allowed to erase, the locale `Vary` value. The CORS preflight endpoints are the
documented exception: they do not select or return content language.

## Link producers and fallbacks

Web links, story permalinks, client feed/story helpers and caches, email,
Telegram digest/trending messages, webhooks, and the Chrome extension use the
shared URL rules. Internal links to localized or private surfaces (including
account creation, subscription settings/unsubscribe, feed, MCP, and navigation
chrome) carry the resolved navigation locale; public neutral destinations stay
at their bare canonical paths. Client feed caches are keyed by locale;
extension caches are keyed by normalized API base and locale. Form actions carry
attribution in the action while the single serialized locale comes from the
hidden `lang` field.

Telegram remains Vietnamese-first: VI content uses explicit `lang=vi`; when a
story or digest has no Vietnamese translation, its actual fallback language is
English and its Telegram controls use `lang=en`. Digest email follows the
resolved content language, preserves unsubscribe/settings tokens, and localizes
footer links. English mail/webhook examples use `lang=en`. Publisher URLs never
receive an aidr.today language parameter.
