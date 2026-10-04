---
name: aidr-facebook-token
description: Mint a Facebook Page token for this install and store it in .env.local. Use when the Page token is missing, expired, or rejected, or when someone asks to reconnect the Facebook Page.
---

# Facebook Page token

The hourly notify step posts with `FACEBOOK_PAGE_ACCESS_TOKEN`. The app id and app secret only mint that token. They cannot publish by themselves.

Nothing Facebook-specific is committed. Each install fills `.env.local`:

```
FACEBOOK_PAGE_ID=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_PAGE_ACCESS_TOKEN=
```

`FACEBOOK_APP_ID` stays in `.env.local` as well as any Worker secret. Do not copy a real id into `wrangler.toml` or `.env.example`.

Optional, same file:

```
FACEBOOK_GRAPH_VERSION=v26.0
SITE_URL=https://example.com
```

Unset, the Worker posts with Graph `v26.0` and the origin in `apps/web/src/lib/site.ts`. Set `SITE_URL` when this checkout should link somewhere else. The Worker name comes from `apps/web/wrangler.toml`. GitHub environment defaults to `production`; set `GITHUB_ENVIRONMENT=repo` to write only the repository secrets.

## Mint

1. In Graph API Explorer, on this install's Meta app, grant `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`. Generate a user token. If `pages_manage_posts` is missing, add the use case **Manage everything on your Page** first.
2. Run, with the user token only in the shell, not in git:

```bash
pnpm facebook:mint --user-token "$FACEBOOK_USER_TOKEN"
```

The script exchanges that user token, calls `/me/accounts`, and writes the Page token into `.env.local`. Set `FACEBOOK_PAGE_ID` first when the user manages more than one Page. A single Page is saved on its own.

3. Upload only those Facebook keys:

```bash
pnpm facebook:mint --sync
```

Do not run a full `pnpm sync-env` just to refresh this token. That command also uploads the rest of `.env.local`.

If Cloudflare says a name is already in use, that name is still a `[vars]` binding. `--sync` leaves it, uploads the rest, and still writes GitHub. Remove the var, deploy, then run `--sync` again so the Page id exists as a secret. Until that deploy, the old var keeps the channel on.

The Page token's `expires_at` is `0`. It still dies if the admin changes their Facebook password, removes the app, or loses the Page role. Mint again when that happens. Do not print the token or the app secret.
