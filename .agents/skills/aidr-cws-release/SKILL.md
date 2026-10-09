---
name: aidr-cws-release
description: Release the aidr Chrome extension and resubmit it to the Chrome Web Store — release-please PR, store zip, listing copy, screenshots, promo tiles, upload, publish, review status. Use when asked to "release the extension", "resubmit to the Chrome Web Store", "update the store listing", "new store screenshots", or after extension changes merge.
---

# aidr-cws-release

Store item: https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg
Dashboard (edit): https://chrome.google.com/webstore/devconsole/f3ade5ba-783b-414a-a7e3-4616458bc590/cagjehdlblcobkghgbbilnpefelbmpcg/edit
Publisher id `f3ade5ba-783b-414a-a7e3-4616458bc590`, item id `cagjehdlblcobkghgbbilnpefelbmpcg`.

`apps/extension/STORE.md` holds the listing copy, permission
justifications and privacy answers. `apps/extension/store/README.md` says how
each image is made.

## What can and cannot be automated

- **Browser tools cannot touch the dashboard.** Chrome blocks every
  extension (Claude in Chrome included) on `chrome.google.com/webstore`:
  "The extensions gallery cannot be scripted." Computer use only gets read
  access to browsers. Do not retry; plan around it.
- **Package upload + publish + status: automated** with the Chrome Web
  Store API v2 — `pnpm --filter @aidr/web cws-publish` (`scripts/cws-publish.ts`).
- **Listing text, screenshots, promo tiles: manual.** The API has no
  listing endpoints. Prepare everything, then hand the user a short
  paste/upload list.

## Steps

1. **Version.** Extension versions belong to release-please
   (`chore(extension): release X.Y.Z`, branch
   `release-please--branches--master--components--aidr`). Never bump
   `manifest.json` by hand. Never merge the release PR unless the user says
   so for this release. The store rejects an upload whose version is not
   higher than the live one.
2. **Zip.** On master after the release merge:
   `pnpm --filter @aidr/web pack-cws` →
   `apps/extension/dist/aidr-cws.zip`. Check:
   `unzip -p apps/extension/dist/aidr-cws.zip manifest.json | grep version`.
3. **Images.** `pnpm --filter @aidr/extension store-assets` regenerates,
   from the real unpacked new tab with live data (never an image model):
   - 5 global (English) + 5 localized (Vietnamese) screenshots, 1280×800
   - small promo tile 440×280
   - marquee 1400×560
   All JPEG or 24-bit PNG with **no alpha**. Verify:
   `sips -g pixelWidth -g pixelHeight -g hasAlpha apps/extension/store/*`.
   Look at every image before handing it over.
4. **Copy.** Update STORE.md: version lines, "What's new" for this release
   (from `apps/extension/CHANGELOG.md`, reader language, EN + VI), links
   (aidr.today, /changelog, /release, /privacy, GitHub issues). Short
   description ≤ 132 chars.
5. **Upload + submit** (needs `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`,
   `CWS_REFRESH_TOKEN` in the env — see "Credentials"):
   `pnpm --filter @aidr/web cws-publish` uploads the zip, submits it for
   review and prints the status. `--upload-only` leaves it as a draft so
   the user can edit the listing first and press Submit. `--status` only
   reads state.
   Without credentials: tell the user to upload the zip under
   Package → Upload new package.
6. **Hand the user the manual part**, one short list: which fields to
   paste from STORE.md (Store listing → Description per language), which
   files go in Global screenshots, Localized screenshots (Vietnamese),
   Small promo tile, Marquee promo tile, and the promo video URL (YouTube,
   if one exists). Then "Submit for review". If Google asks them to verify
   the account, that is theirs to do; never type passwords.
7. **After review**, `cws-publish --status` shows the published version.
   `EXTENSION_STORE_URL` in `apps/web/src/lib/extension-release.ts` already
   points at the listing; leave it.

## Credentials (one time, by the user)

1. Google Cloud Console → a project → enable "Chrome Web Store API".
2. OAuth consent screen (External), add the owner account as test user.
3. OAuth client ID, type Web application, redirect URI
   `https://developers.google.com/oauthplayground`.
4. OAuth Playground → "Use your own OAuth credentials" → scope
   `https://www.googleapis.com/auth/chromewebstore` → authorize →
   exchange for tokens → copy the refresh token.
5. Put `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` in
   `.env.local` and run `pnpm sync-env` if CI should have them too.
The account must own the item and have 2-step verification on.
