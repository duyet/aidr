# SEO / AEO measurement checklist

Refs #139. Record the baseline before a change ships and the result after. Owner is the person who reads the signal; for now all signals belong to the site owner (@duyet).

| Signal | Source | Baseline | Success | Failure | Owner |
| --- | --- | --- | --- | --- | --- |
| Indexed story pages vs sitemap entries | Search Console, Pages report | count both | indexed / sitemap rises, no "Duplicate, Google chose different canonical" | duplicates for `?utm_`, `?lang` or legacy URLs | owner |
| Structured data validity | Rich Results Test on one story and the homepage | errors and warnings | 0 errors; `NewsArticle` and `BreadcrumbList` detected | any error, or an `author` / rating field appears | owner |
| Search queries and clicks | Search Console, Performance | top 20 queries, 28 days | impressions and clicks up | drop after a canonical or robots change | owner |
| Crawler behaviour | Worker logs / Cloudflare analytics by user agent (Googlebot, Bingbot, GPTBot, ClaudeBot, PerplexityBot) | requests and status mix | mostly 200 on canonical URLs | 4xx or 5xx on story URLs, crawls of `noindex` routes | owner |
| Answer-engine citations | manual prompts ("latest AI news digest", a story title) in 2 to 3 engines | cited or not, link target | aidr.today cited with the canonical URL | cited with a duplicate or wrong-language URL | owner |
| Agent surfaces | `curl -i` on `/llms.txt`, `/api/story/<id>.md`, `/feed.xml`, `/sitemap.xml` | status, content type | 200 and correct type | non-200 or missing text | owner |

Manual check after each SEO change: `curl -i` the homepage, one story, a legacy URL, a `?utm_source=x` URL and `?lang=vi`; confirm status, redirects, one canonical link, and that the JSON-LD `url` equals the canonical.
