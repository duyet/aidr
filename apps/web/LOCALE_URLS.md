# Locale URL contract

Supported locales are exactly `vi` and `en`. The canonical query parameter is
`lang`; examples are `/?lang=vi` and `/abcdef12?lang=en`.

## Request selection

Locale selection uses this order:

1. The first `lang` value (`lang` wins if `locale` is also present).
2. The first legacy `locale` value.
3. The exact `news_lang` cookie (`vi` or `en`).
4. The highest-quality supported `Accept-Language` range.
5. Vietnamese.

Unsupported explicit values do not select a new locale. They fall through to
the cookie, `Accept-Language`, and Vietnamese default. Repeated parameters are
deterministic: only the first value is considered.

Bare URLs and legacy `locale` URLs remain routable. A request carrying a locale
parameter is normalized with a temporary redirect to exactly one `lang=vi` or
`lang=en` parameter while preserving unrelated parameters such as UTM and the
fragment. Canonical story redirects preserve the same locale and attribution.

## SSR and navigation

The root route resolves locale during SSR from the request, rather than relying
on client-only cookie state. Client navigation preserves an explicit root
`lang`, and the language toggle writes both the cookie and an explicit URL.

## Caching

Only URLs with exactly one valid `lang` and no `locale` alias are publicly
edge-cacheable. Bare, legacy, invalid, and repeated locale URLs use
`private, no-store` because cookie or `Accept-Language` can select the rendered
language. The explicit query is part of the cache key, so `vi` and `en` cannot
share a response. Successful localized responses also emit `Content-Language`.

## Canonicals, hreflang, and sitemap

Homepage and story canonicals always use an explicit locale. Each page emits
`hreflang=vi`, `hreflang=en`, and `x-default` pointing to Vietnamese. The
sitemap lists the two explicit homepage locales and exactly two URLs per story
(`?lang=vi` and `?lang=en`); it never lists bare story locale URLs.

## Link producers

Web links, story permalinks, email, Telegram digest/trending messages, generic
notification webhooks, and the Chrome extension all use the shared locale URL
rules. Telegram is Vietnamese-first, so its aidr.today links always include
`lang=vi`. English mail or webhook payloads use `lang=en`. Publisher URLs never
receive an aidr.today language parameter.
