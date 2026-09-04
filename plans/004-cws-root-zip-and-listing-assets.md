# Plan 004: CWS root-manifest zip + listing assets

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4168a5..HEAD -- apps/extension apps/web/src/lib/aidr-zip.ts apps/web/src/lib/extension-release.ts apps/extension/STORE.md`
> If those files drifted, compare excerpts before proceeding.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (store zip must not replace the public nested `aidr.zip`
  used by Load unpacked)
- **Depends on**: none (builds on `b4168a5` privacy URL + `/api/extension`)
- **Category**: direction
- **Planned at**: commit `b4168a5`, 2026-09-04

## Why this matters

Consumer Chrome **never** auto-updates unpacked zips. Auto-update only happens
after Chrome Web Store publish. First-submit rejects if:

1. You upload `https://aidr.today/aidr.zip` (files live under `aidr/`, not
   `manifest.json` at zip root).
2. Listing lacks 1280×800 screenshots / 440×280 small tile.
3. Store package still ships localhost optional hosts + a user-set API base.

`b4168a5` already added `https://aidr.today/privacy`, `GET /api/extension`,
unpacked update banner, tightened `connect-src`, and `apps/extension/STORE.md`.

## Current state

- Public zip: `apps/web/src/lib/aidr-zip.ts` prefixes entries
  `` `${AIDR_UNPACKED_DIR}/${relPosix}` `` (`aidr/manifest.json`). Correct for
  the website guide; **wrong for CWS**.
- Manifest still has `optional_host_permissions` localhost
  (`apps/extension/manifest.json`).
- Settings UI still has API base URL (`apps/extension/js/settings-panel.js`).
- `apps/extension/scripts/build.js` **requires** `http://localhost:*` in CSP.
- Search placeholder is generic “Tìm kiếm...” / “Search AI news...”.
- No 1280×800 screenshots in-repo.

Official: CWS prepare docs require manifest at zip root.
Do not set `update_url` in a CWS package.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Ext tests | `export PATH="/home/box/.local/node-v22.22.1-linux-x64/bin:$PATH"` then `pnpm --filter @aidr/extension test` | all pass |
| Ext lint | `pnpm --filter @aidr/extension lint` | exit 0 |
| Zip tests | `pnpm --filter @aidr/web test -- src/lib/aidr-zip.test.ts src/lib/extension-release.test.ts` | all pass |

## Scope

**In scope**
- `apps/web/src/lib/aidr-zip.ts` (+ tests) — add a **second** packer that
  writes `manifest.json` at zip root, e.g. `public/aidr-cws.zip` or a script
  `apps/extension/scripts/pack-cws.mjs`. Keep `aidr.zip` nested.
- `apps/extension/STORE.md` — document which zip to upload.
- Search copy in `apps/extension/js/i18n.js` + `newtab.html` placeholder:
  “Search aidr.today” / “Tìm trên aidr.today” (vertical search, not web search).
- Optional **store flavor** via env `AIDR_EXT_STORE=1` that:
  - omits `optional_host_permissions`
  - CSP `connect-src 'self' https://aidr.today` only
  - hides API base field
  Only if you can do it without breaking unpacked `pnpm --filter @aidr/extension build`.

**Out of scope**
- Paying the CWS developer fee / enabling 2SV / clicking Publish
- Generating fake screenshots with an image model (capture a real new tab)
- Changing `host_permissions` off `https://aidr.today/*` until `/api/public`
  includes categories/trending/tags (extension still reads `/api/feed`)
- Adding `update_url`

## Git workflow

- Commit: `feat(extension): pack a CWS zip with manifest at archive root`
- Do not replace `public/aidr.zip` behavior.

## Steps

### Step 1: Root-manifest packer

Add `buildCwsZip(root)` (or a flag `nested: false` on the existing builder)
that writes entry names as `manifest.json`, `newtab.html`, … with **no**
`aidr/` prefix. Call it from a script; output must **not** overwrite
`public/aidr.zip`.

**Verify**: unzip -l the CWS zip shows `manifest.json` at the first path
segment, not `aidr/manifest.json`. Existing `listUnpackedRelPaths` nested zip
tests still pass.

### Step 2: Relabel search

Change EN/VI placeholders so they cannot be read as omnibox hijack.

**Verify**: `rg "Tìm kiếm\\.\\.\\." apps/extension` is gone from user-visible
copy (HTML + i18n). Tests in `i18n` if any.

### Step 3: Store flavor (if Step 1 is done and build.js is the blocker)

If `scripts/build.js` still `fail()`s without localhost in CSP, gate that
check: unpacked build keeps localhost; `AIDR_EXT_STORE=1` forbids localhost
optional hosts.

**Verify**: default `pnpm --filter @aidr/extension build` still passes.
`AIDR_EXT_STORE=1` fails if localhost remains in the manifest.

### Step 4: Listing assets

Do **not** invent screenshots. Add `apps/extension/store/README.md` listing
required sizes (1280×800, 440×280) and that they are dashboard-only (zip
packer already skips `.md`). Operator captures from a real Load unpacked tab.

## Test plan

- Zip test: CWS archive contains `manifest.json` and does **not** contain
  `aidr/manifest.json`.
- Nested `aidr.zip` test unchanged (`aidr/manifest.json` present).
- Extension node:test suite still 26+ passing.

## Done criteria

- [ ] Two zip shapes exist and are tested
- [ ] STORE.md says upload the **root** zip to CWS, nested zip to the website
- [ ] Search copy is site-specific
- [ ] `update_url` still absent from `manifest.json`
- [ ] `plans/README.md` updated

## STOP conditions

- Changing nested `aidr.zip` layout (breaks `/extension` guide tests in
  `aidr-guide.test.ts`).
- Adding `chrome.search` or `<all_urls>`.

## Maintenance notes

- After a real CWS item exists, set `EXTENSION_STORE_URL` in
  `apps/web/src/lib/extension-release.ts` so `/api/extension` can point the
  banner at the store. Leave it empty until then.
- Reviewers: CWS zip must exclude `*.test.js` (already skipped).
