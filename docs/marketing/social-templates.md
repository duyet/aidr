# Social templates

Fill every `<placeholder>`. Keep numbers in sync with `positioning.md`.

## Launch

### X

```
AI;DR reads AI news every 30 minutes, removes duplicates, and ranks it. No editor.

One daily edition, up to 16 bullets, in English and Vietnamese. Every item links to the source.

Web, email, Telegram, RSS, Chrome new tab, and MCP for agents.

https://aidr.today
```

### LinkedIn

```
I built AI;DR so I don't need ten tabs to follow AI news.

Every 30 minutes it pulls stories from Hacker News, Hugging Face, GitHub releases, and RSS feeds, merges duplicates, scores them with an LLM, and ranks them with plain code. The ranking rules are public on GitHub.

Each day becomes one edition of up to 16 bullets, in English and in Vietnamese, each linked to the original post.

Read it on the web, by email (3, 5, or 10 stories, from 07:00 your time), on Telegram, over RSS, or in a Chrome new tab. Agents can read it through a public MCP server.

https://aidr.today
```

### Hacker News (Show HN)

```
Title: Show HN: AI;DR, AI news ranked every 30 minutes in English and Vietnamese

AI;DR fetches AI news from HN, Hugging Face, GitHub releases, Lobsters, and RSS every 30 minutes. It dedupes and merges stories, checks that each is about AI, scores it with an LLM, and ranks with pure code (rules in ALGORITHM.md). The top of the last 24 hours becomes a daily edition of up to 16 bullets, with at most 5 per topic family.

It runs on one Cloudflare Worker with D1. Outputs are the site, email, Telegram, RSS, a Chrome new tab, and a public MCP server whose read tools need no key.

A machine picks the order, so it makes mistakes. Feedback on the ranking is welcome.

Site: https://aidr.today
Code: <github repo url>
```

### Telegram, Vietnamese (@aihomnay)

```
AI;DR: tin AI xếp hạng mỗi 30 phút.
Mỗi sáng từ 08:00, kênh gửi 6 tin AI đáng đọc nhất, mỗi tin dẫn về bài gốc.
Xem đầy đủ: https://aidr.today
```

### Telegram, English (@aidr_today)

```
AI;DR ranks AI news every 30 minutes.
From 08:00 Vietnam time, this channel posts the day's top AI stories, each linked to the source.
Full edition at https://aidr.today
```

### Facebook

```
AI;DR ranks AI news every 30 minutes and posts the day's edition here. No editor picks the order. Every story links to the original post.

Get it by email, Telegram, RSS, or in a Chrome new tab at https://aidr.today/subscribe
```

## Daily edition

### X

```
AI;DR for <date>

1. <headline 1>
2. <headline 2>
3. <headline 3>

+<n> more, each linked to the source: https://aidr.today/date/<YYYY-MM-DD>
```

### LinkedIn

```
Top AI stories for <date>, ranked by AI;DR

- <headline 1>. <one line on why it matters>
- <headline 2>. <one line on why it matters>
- <headline 3>. <one line on why it matters>

Full edition at https://aidr.today/date/<YYYY-MM-DD>
```

### Story spotlight

```
<headline>

<one or two sentences from the bullet>

Source is <outlet>. Read today's edition at https://aidr.today/date/<YYYY-MM-DD>
```

## Chrome extension

```
AI;DR is a Chrome new tab. Each new tab shows the day's ranked AI stories, in English or Vietnamese.

Install from https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg
Version <x.y.z> adds <one line on what changed>.
```

## MCP server

```
Your agent can read AI;DR. The public MCP server at https://aidr.today/api/mcp needs no key for reading.

Read tools are latest_ai_news, search_news, get_story, get_ai_digest, and get_day_edition.

Setup for <client name> is at https://aidr.today/mcp
```

## Email signup

```
Get AI;DR by email from 07:00 in your timezone. Pick 3, 5, or 10 stories, daily or weekly, in English or Vietnamese.

https://aidr.today/subscribe?tab=email
```
