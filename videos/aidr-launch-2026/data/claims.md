# Claims sheet

Every spoken or on-screen claim in the film, and where it is true. Positioning is `docs/marketing/positioning.md`; ALGORITHM is `apps/web/ALGORITHM.md`. Counts were read from production on 2026-10-21 and saved beside this file.

| Claim (as said or shown) | Source |
|---|---|
| The same story shows up everywhere, under new headlines | Positioning "The problem". Shown with real pairs from today's feed (`public-2026-10-21.json` `stories`): "The US DHS orders all federal civilian agencies to remove …" / "The US orders every civilian agency to rip out DeepSeek …"; "Mercury 3: Diffusion at scale" / "Inception launches Mercury 3 …" |
| Every 30 minutes | Positioning "What it does"; ALGORITHM "Scheduling & coalesce" |
| Hacker News, Hugging Face, GitHub releases, Lobsters, RSS | Positioning "Proof points" (adapters in `apps/web/worker/sources/`) |
| 51 sources enabled today (on screen) | `sources-2026-10-21.json`, `ingestSources` with `enabled: true` |
| Merges duplicates into one story | Positioning "What it does"; ALGORITHM §2 Dedupe, §5 Merge |
| Scores each one | Positioning; ALGORITHM §4 Score |
| No editor picks the order; the ranking is plain code; the rules are public | Positioning "How it differs" ("The rank step is pure code, and the rules are public in `ALGORITHM.md`"); ALGORITHM §7 |
| Top stories of the last 24 hours become one edition | Positioning "What it does" |
| Up to 16 bullets, English and Vietnamese | Positioning "Proof points"; ALGORITHM §10 TL;DR |
| Vietnamese written separately, no fill-in (on screen: "Written separately") | Positioning "How it differs"; ALGORITHM "Overview" |
| Email from 7 a.m., your time | Positioning "Proof points"; ALGORITHM "Overview" (07:00 in each subscriber's timezone) |
| Telegram (on screen: from 08:00 Vietnam time, @aidr_today, @aihomnay) | Positioning "Proof points"; ALGORITHM "Overview" |
| Facebook | Positioning; ALGORITHM "Overview" (`facebook-en`) |
| A daily video | `apps/web/worker/day-video-watchdog.ts` ("The daily video must reach YouTube (16:9 and Short), the Facebook Reel and Telegram"); `videos/daily-news/README.md`. Not a Worker output: drawn as a branch off the edition, not a pipeline port of its own |
| Every story links to the original | Positioning "What it does"; https://aidr.today/about |
| On-screen headlines and bullets | `public-2026-10-21.json` (`tldr.bullets_en`, `tldr.bullets_vi`) and the captures in `capture/` |

Words avoided (positioning "Voice"): revolutionary, game-changing, cutting-edge, seamless, powerful, leverage, unlock, supercharge, curated by experts, never miss anything, all the AI news, real-time, human-curated.
