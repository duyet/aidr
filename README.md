<div align="center">

<a href="https://aidr.today"><img src="apps/web/public/logo.png" alt="AI;DR" width="120" height="120"></a>

# AI;DR

**What's new in AI today?** Ranked AI news with a short daily digest, in English and Vietnamese.

[![Website](https://img.shields.io/badge/Website-aidr.today-111111?style=for-the-badge)](https://aidr.today)
[![Chrome](https://img.shields.io/badge/Chrome-extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg)
[![Telegram VI](https://img.shields.io/badge/Telegram-@aihomnay-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/aihomnay)
[![Telegram EN](https://img.shields.io/badge/Telegram-@aidr__today-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/aidr_today)
[![RSS](https://img.shields.io/badge/RSS-feed.xml-FFA500?style=for-the-badge&logo=rss&logoColor=white)](https://aidr.today/feed.xml)
[![Sponsor](https://img.shields.io/badge/Sponsor-this%20project-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/duyet)

<a href="https://www.youtube.com/watch?v=tynoWx03zDc"><img src="https://img.youtube.com/vi/tynoWx03zDc/maxresdefault.jpg" alt="Watch the AI;DR introduction video" width="820"></a>

<sub>▶ <a href="https://www.youtube.com/watch?v=tynoWx03zDc">Watch the introduction video</a> (30 seconds)</sub>

</div>

## Get AI;DR

| Channel | Link |
|---|---|
| Website | [aidr.today](https://aidr.today) |
| Chrome new tab | [Chrome Web Store](https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg) |
| Telegram (Vietnamese) | [@aihomnay](https://t.me/aihomnay) |
| Telegram (English) | [@aidr_today](https://t.me/aidr_today) |
| Email digest | [aidr.today/subscribe](https://aidr.today/subscribe?tab=email) |
| RSS | [feed.xml](https://aidr.today/feed.xml) |

## Stack

Cloudflare Worker (`aidr`), TanStack Start frontend, D1 as the primary store.

## Layout

| Path | Role |
|------|------|
| `apps/web` | Site, API, ingest workflow (`@aidr/web`) |
| `apps/extension` | Chrome MV3 new-tab (`@aidr/extension`) |
| `packages/*` | Shared libs / UI |
| `videos` | Video sources, built with HyperFrames ([`videos/README.md`](videos/README.md)) |
| `.agents/skills` | Agent skills for this repo |

## Pipeline

One hourly `NewsIngestWorkflow`. The contract is [`apps/web/ALGORITHM.md`](apps/web/ALGORITHM.md).

1. **Consume** — enabled sources (`worker/sources/`) are fetched, deduped, and enriched into `items`.
2. **Rank** — score, translate, then a pure `rank_score` (`worker/ranking.ts`). The top of the last 24h becomes today's TL;DR snapshot: `bullets_en` and `bullets_vi` (`worker/tldr.ts`).
3. **Publish** — one edition per language (`worker/digest/edition.ts`). Email uses the subscriber's timezone from 07:00 and their digest size. Telegram VI and Telegram EN each post once from 08:00 `Asia/Ho_Chi_Minh`. A missing language column is skipped and retried; it is not filled from the other language. Trending posts stay on Telegram.

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill values (gitignored)
pnpm --filter @aidr/web dev  # http://localhost:3014
```

Extension (unpacked):

1. `chrome://extensions` → Developer mode
2. **Load unpacked** → `apps/extension`

## Deploy

```bash
pnpm run deploy              # build + wrangler deploy (see CLAUDE.md: cf cannot carry Workflows yet)
pnpm run cf:deploy:prod      # production env + smoke
```

CI: `.github/workflows/deploy-web.yml` on push to `main`/`master` when `apps/web`, `apps/extension`, `packages`, or lockfile change.

GitHub secrets: `CLOUDFLARE_API_TOKEN`, `VITE_CLERK_PUBLISHABLE_KEY`. Account ID comes from `apps/web/wrangler.toml` (and the workflow env). D1 queries and secret sync use `cf`, not Wrangler.

Smoke: `curl https://aidr.today/api/public`

## Secrets

One command syncs local env → **GitHub Actions** + **Cloudflare Worker**:

```bash
cp .env.example .env.local   # fill values
pnpm sync-env                # both targets
pnpm sync-env --dry-run
pnpm sync-env --workers      # Worker only
pnpm sync-env --github       # GitHub only (repo + production env)
```

Alias: `pnpm config`. Non-secret config stays in `wrangler.toml` `[vars]`. Key list: `.env.example`.

## Extension release

Zip: `https://aidr.today/aidr.zip` (built into the Worker).

1. Unzip → load unpacked → select the `aidr/` folder inside

Versioning: release-please opens **separate** release PRs from separate
manifests (`.github/.release-please-web.json` and
`.github/.release-please-extension.json`). Leave those PRs for a human to merge.

- Website (`apps/web`) → `chore(web): release X.Y.Z`, tags `web-v*`
- Chrome extension (`apps/extension`) → `chore(extension): release X.Y.Z`, tags `aidr-v*`

Commits that touch each package path (and scopes like `feat(web):` /
`feat(extension):`) feed that package’s changelog. Merge the PR to cut
the GitHub Release.

## Ingest

Primary: Durable Object alarm (`NewsIngestScheduler`).

Watchdog: `.github/workflows/ingest.yml` POSTs `/api/admin/ingest` with `NEWS_ADMIN_TOKEN`. Manual: Actions **workflow_dispatch**, or admin POST with `?force=1`.

No Worker `[triggers] crons` (Free plan limit) and no Workflow `schedules` (paid).

## Scripts

```bash
pnpm run lint
pnpm run test
pnpm run check-types
pnpm --filter @aidr/web smoke
```
