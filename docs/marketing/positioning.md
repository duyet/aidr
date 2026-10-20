# Positioning

## Who it is for

People who follow AI news every day and want one short list instead of ten tabs. That includes engineers, researchers, and founders, and readers in Vietnam who want the same news in Vietnamese.

## The problem

AI news is spread across Hacker News, Hugging Face, lab blogs, GitHub releases, and RSS feeds. The same story shows up five times with five headlines. Reading all of it takes time, and a lot of it is not about AI.

## What it does

AI;DR reads AI news sources every 30 minutes, removes duplicates, scores each story, and ranks them. The top stories of the last 24 hours become one edition, written in English and in Vietnamese. That edition goes out on the site, by email, on Telegram, on a Facebook Page, over RSS, in a Chrome new tab, and to AI agents over MCP. Every item links to the original post.

## How it differs

- **No editor picks the order.** A fixed pipeline does it in steps (fetch, dedupe, enrich, score, merge, translate, rank). The rank step is pure code, and the rules are public in `ALGORITHM.md`.
- **Two languages, written separately.** The Vietnamese bullets are restated on their own. If one language is not ready, that channel waits for the next run instead of posting the other language.
- **One edition, many channels.** The site, email, Telegram, Facebook, and the extension read the same ranked edition.
- **Open to agents.** The public MCP server lets an agent read the news without an API key.
- **Open source.** The code and the ranking contract are on GitHub.

## Proof points

| Claim | Evidence |
|---|---|
| A run starts every 30 minutes | `README.md` "Pipeline", `apps/web/ALGORITHM.md` "Scheduling & coalesce" (25-minute coalesce, `INGEST_MIN_INTERVAL_MS`) |
| Sources include Hacker News, Hugging Face, GitHub releases, Lobsters, RSS | Adapters in `apps/web/worker/sources/` (`hn.ts`, `hfpapers.ts`, `hfmodels.ts`, `hftrending.ts`, `githubreleases.ts`, `lobsters.ts`, `rss.ts`), registered in `registry.ts`. The live list is at https://aidr.today/data?tab=sources |
| Duplicates are merged | `ALGORITHM.md` §2 Dedupe and §5 Merge |
| Ranking is pure code | `ALGORITHM.md` §7 Rank, `apps/web/worker/ranking.ts` |
| A JEV check and an LLM score each story | `ALGORITHM.md` §4 Score, https://aidr.today/about |
| The daily digest is up to 16 bullets per language from the last 24 hours | `ALGORITHM.md` §10 TL;DR, `apps/web/worker/tldr.ts` |
| One topic family holds at most 5 of the 16 slots | `ALGORITHM.md` §10, `apps/web/worker/digest/select.ts` |
| English and Vietnamese never fill in for each other | `CLAUDE.md`, `apps/web/worker/digest/edition.ts` |
| Email from 07:00 in the reader's timezone, 3, 5, or 10 stories, daily or weekly | `ALGORITHM.md` "Overview" publish notes, `apps/web/worker/subscribe/handlers.ts` (`DIGEST_SIZES`) |
| Telegram in Vietnamese (@aihomnay) and English (@aidr_today), from 08:00 Vietnam time | `ALGORITHM.md` "Overview" publish notes, `apps/web/src/lib/site.ts` |
| An English Facebook Page post per edition | `ALGORITHM.md` "Overview" publish notes, `apps/web/worker/notify/facebook.ts` |
| RSS feed | https://aidr.today/feed.xml (`README.md`) |
| Chrome new tab extension | `apps/extension`, Chrome Web Store link in `README.md` |
| Public MCP read tools with no auth (`latest_ai_news`, `search_news`, `get_story`, `get_ai_digest`, `get_day_edition`) | `apps/web/worker/mcp/public-tools.ts`, https://aidr.today/mcp |
| Every story links to its source | https://aidr.today/about, `SITE_DESCRIPTION` in `apps/web/src/lib/site.ts` |
| Readers can send fixes and stories | https://aidr.today/about (`submit@aidr.today`, suggest a line when signed in) |

## Voice

- Short sentences. Facts first, then the link.
- Say what the pipeline does, with its numbers ("every 30 minutes", "16 bullets", "from 07:00").
- Admit the limits. A machine picks the stories, so it makes mistakes, and readers can fix them.
- Write the name as **AI;DR** and the domain as **aidr.today**. "AI News" is the SEO title, not the brand (`SITE_NAME` note in `apps/web/src/lib/site.ts`).

Words to avoid: revolutionary, game-changing, cutting-edge, seamless, powerful, leverage, unlock, supercharge, curated by experts, never miss anything, all the AI news. Do not say "real-time", because runs are 30 minutes apart. Do not say "human-curated", because no person picks the order.
