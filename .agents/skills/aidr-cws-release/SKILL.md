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

## How the dashboard is driven

- **Claude in Chrome cannot touch it.** Chrome blocks every extension on
  `chrome.google.com/webstore` ("The extensions gallery cannot be
  scripted"). Computer use only gets read access to browsers.
- **Use the user's running Chrome over DevTools** — not a new Chrome
  window. The user turns on "Allow remote debugging for this browser
  instance" once at `chrome://inspect/#remote-debugging`; Chrome then
  writes `~/Library/Application Support/Google/Chrome/DevToolsActivePort`.
- `bin/cws-chrome "<agent-browser cmd>" ...` attaches to it, switches to
  the dashboard tab (opens one if missing) and runs the commands as one
  batch, so they never land on the tab the user has in front. Use
  `eval -b <base64>` for any non-trivial JS (quoting inside batch strings
  breaks), and wrap page-scope JS in an IIFE (re-running `const` throws).
- `bin/cws-replace-images <localized|global|small|marquee> <files...>`
  clears a slot for the **current editing language** and uploads files in
  order. File inputs in DOM order: icon, localized, global, small promo,
  marquee. Remove controls need real pointer events on the visible image
  (hover → click → "Remove" in the confirm). JS `.click()` does nothing
  but stacks hidden dialogs — if that happens, reload (the draft is safe
  once saved).
- Navigation: `edit` (Store listing), `edit/package`, `edit/privacy`,
  `edit/status`, `edit/distribution`. Use `eval 'location.href=...'`.
- The API (`pnpm --filter @aidr/web cws-publish`) covers package upload,
  publish and status only, and needs OAuth credentials (see below).

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
5. **Package.** Download the release zip:
   `gh release download aidr-vX.Y.Z -p 'aidr-cws-X.Y.Z.zip' -D <dir>`
   (release-please attaches it; else `pack-cws`). In the dashboard:
   `edit/package` → `find role button click --name 'Upload new package'`
   → `upload 'input[type=file][accept=".zip,.crx"]' <zip>`; check the Draft
   block shows the new version. Or via API
   (needs `CWS_PUBLISHER_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`,
   `CWS_REFRESH_TOKEN`):
   `pnpm --filter @aidr/web cws-publish` uploads the zip, submits it for
   review and prints the status. `--upload-only` leaves it as a draft so
   the user can edit the listing first and press Submit. `--status` only
   reads state.
   Without credentials: tell the user to upload the zip under
   Package → Upload new package.
6. **Listing** (`edit`), per language (Language combobox at the top:
   English – en (default), Vietnamese – vi):
   - `fill textarea "<Detailed description from STORE.md>"` (the summary
     line comes from the manifest, not this field)
   - `cws-replace-images localized store/en-*.jpg` (English) /
     `store/vi-*.jpg` (Vietnamese); `cws-replace-images global store/en-*.jpg`;
     `small store/promo-440x280.jpg`; `marquee store/marquee-1400x560.jpg`
   - Global promo video: the launch film unless the user names another.
   - `find role button click --name 'Save draft'` after each language;
     the button greys out when saved.
7. **Submit.** `edit/privacy` — check single purpose and permission
   justifications still match the manifest. Then click "Submit for
   review"; the dialog has "Publish automatically after it has passed
   review" (keep checked) and a "Submit For Review" button. Status then
   reads "Pending review". If Google asks the user to verify the account,
   that is theirs; never type passwords.
8. **After review**, `cws-publish --status` shows the published version.
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
5. Put `CWS_PUBLISHER_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`,
   `CWS_REFRESH_TOKEN` in `.env.local` and run `pnpm sync-env` if CI should have them too.
The account must own the item and have 2-step verification on.
