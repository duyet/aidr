---
name: aidr-youtube-upload
description: Upload an AI;DR video (release film, daily brief, launch cut, Short) to the owner's YouTube channel through YouTube Studio in the user's own Chrome — file, marketing title with version, description with links and chapters, tags, playlist, thumbnail, visibility — then return the video id. Use when asked to "upload to YouTube", "post the release video", "publish the Short", or after a video render is approved.
---

# aidr-youtube-upload

Channel: **https://studio.youtube.com/channel/UCGDB5uD8znydgMg2XLOj04w**
(always this one; check the id in the Studio URL before uploading).

## Rules

- **Only upload finished renders.** Wait until the video review
  (`aidr-video-review`) passes and the user hasn't asked for more changes.
  YouTube cannot replace a file; a fix means a new upload.
- **Use the user's running Chrome** over DevTools — never open a separate
  Chrome. The user enables "Allow remote debugging for this browser
  instance" once at `chrome://inspect/#remote-debugging`.
  `bin/yt-chrome "<agent-browser cmd>" ...` pins every batch to the Studio
  tab for this channel (opens one if missing).
- Never type passwords. If Google asks to verify, stop and ask the user.
- Visibility **Public** for release films and daily briefs unless the user
  says otherwise. "No, it's not made for kids."

## Metadata (marketing, not a commit log)

Write it in `videos/<project>/youtube.md` first, then paste from there.

- **Title** (≤ 100 chars): `AI;DR v0.1.12 — <one benefit hook>`. Lead
  with the version for releases, then what the viewer gets
  ("Every day gets a page, and you get a vote"). Vietnamese cut:
  `AI;DR v0.1.12 — <hook tiếng Việt>`. No clickbait, no ALL CAPS.
- **Description**:
  1. One or two punchy sentences on what's new and why it matters.
  2. `▶ Release notes: https://aidr.today/release/vX.Y.Z`
     `▶ Read AI;DR: https://aidr.today`
     `▶ Chrome extension: https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg`
     `▶ Telegram: https://t.me/aidr_today (EN) · https://t.me/aihomnay (VI)`
  3. Chapters, first at `0:00`, every chapter ≥ 10 s (YouTube drops all
     chapters if one is shorter), at least three.
  4. 3–5 hashtags at the end: `#AI #AInews #AIDR` (+ `#tinAI` for VI).
- **Tags**: AI;DR, aidr.today, AI news, AI digest, release notes, plus
  the release's feature words; VI cut adds Vietnamese terms.
- **Playlist**: the channel's existing **"AI;DR"** playlist for every
  AI;DR video (release films, daily briefs, Shorts). Don't create new
  playlists unless the user asks.
- **Thumbnail**: the cover still from `renders/*-cover.png` (1920×1080
  works, must be < 2 MB; downscale with `sips -Z 1920` if needed). Daily
  covers are 4K PNGs (~2.8 MB): convert a copy in a scratch dir with
  `sips -s format jpeg -s formatOptions 90 … --out x.jpg && sips -Z 1920
  x.jpg` (~260 KB). Shorts get no custom thumbnail.
- **Daily brief**: metadata is in `videos/daily-news/editions/<date>/posts.md`
  (`<!-- posts:en -->` / `<!-- posts:vi -->` blocks, "YouTube (16:9)" and
  "YouTube Shorts (9:16)" sections). Upload the file named in that cut's
  `STATUS.json` row (`path`), not the "Files:" line in posts.md, which can
  go stale after a re-render. Add the Chrome / Telegram / Facebook link
  lines after the aidr.today links.
- **Language**: video language English or Vietnamese to match the cut;
  category Science & Technology.
- 9:16 renders ≤ 3 min upload as Shorts automatically; give them the same
  title with `#Shorts` and a two-line description with the release link.

## Upload: run `bin/yt-upload`

```bash
bin/yt-upload <mp4> --meta <youtube.md|posts.md> --lang en|vi --kind long|short \
  [--cover <png>] [--resume-from thumb|playlist] [--no-publish] [--publish-anyway]
```

Examples (from the repo root, one upload at a time, never two on the same Chrome):

```bash
S=.agents/skills/aidr-youtube-upload/bin/yt-upload
$S videos/releases/v0.1.12/renders/aidr-v0.1.12-en-16x9.mp4 --meta videos/releases/v0.1.12/youtube.md --lang en --kind long --cover videos/releases/v0.1.12/renders/aidr-v0.1.12-en-16x9-cover.png
$S videos/releases/v0.1.12/renders/aidr-v0.1.12-vi-9x16.mp4 --meta videos/releases/v0.1.12/youtube.md --lang vi --kind short
$S <daily mp4> --meta videos/daily-news/editions/<date>/posts.md --lang en --kind long --cover <cover>
```

What it does, in order: reads the metadata with `bin/yt-meta.py`
(`--release youtube.md` or `--daily posts.md`, picked from the file) →
opens the upload dialog in the Studio tab → uploads the file → title and
description → thumbnail → playlist **AI;DR** (retries once by reopening
the picker) → "not made for kids", paid promotion No, AI-content No →
tags → video language (set, read back, up to 3 tries) → prints a `CHECK:`
line → Next ×3 → waits until the footer says "Checks complete" → Public →
Publish → reads the "Video published" dialog → `curl` oEmbed.

It prints `ID=<id>`, `URL=<link>` and `OEMBED=200 public`, and exits 1 if
oEmbed is not 200 after about a minute (403 = still private). Read the
`CHECK:` line: title, category (Science & Technology), language,
playlist, tags. A failure prints `FAIL: <step>` and saves a screenshot to
`$YT_FAIL_DIR` (default `$TMPDIR`).

- **Checks.** Publishing while YouTube is still checking raises "We're
  still checking your content" (Publish anyway / Go back). The tool waits
  for the footer (`ytcp-uploads-dialog ytcp-video-upload-progress`, ends
  with "Checks complete. No issues found."). The wait is a positive test:
  it polls every 30 s (up to 18 min) until the text contains "Checks
  complete"; an empty text or an eval error counts as not done yet (a
  "no longer says Checking" test once published mid-check and left the
  video "Saved as private"). If the modal still appears after Publish, it
  clicks **Go back**, waits 30 s and publishes again. It never clicks
  "Publish anyway" unless you pass `--publish-anyway` (only when the owner
  agrees to publish before checks finish).
- **Time.** Expect 5–10 minutes of checks per upload (the copyright check on
  a Short took about 10 min). Uploading the next cut meanwhile is not
  possible in the same Studio tab, so the release flow should render or
  review the next cut while the upload waits.
- **Resume.** After a failure the upload dialog is still open in Studio.
  `--resume-from thumb` skips the file and text steps and continues from the
  thumbnail; `--resume-from playlist` continues from the playlist.
  `--no-publish` stops after the `CHECK:` line so you can look first.
- **Shorts** (`--kind short`) take title and caption from the "Vertical"
  section with `#Shorts`; no thumbnail unless you pass `--cover`. Their
  link only appears in the final dialog, so `ID` is read there.
- **Cover.** PNG under 2 MB; convert big covers first (see Thumbnail
  above).
- After the id is printed, put it where it belongs: release `STATUS.json`
  row (`youtubeId`/`youtubeUrl`/`uploaded`), release file `youtubeId` /
  `youtubeIdVi`, Web Store promo video if asked.

## Headless (API) upload: `bin/yt-upload-api.mjs`

For sandboxes with no Chrome (Claude Managed Agents). Node 22, no deps. Same
args and output as `bin/yt-upload`, plus `--privacy private|unlisted|public`
(default public):

```bash
bin/yt-upload-api.mjs <mp4> --meta <youtube.md|posts.md> --lang en|vi --kind long|short [--cover <png>] [--privacy ...]
```

Env: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`.
It reads metadata with `bin/yt-meta.py`, uploads (category 28, language,
not made for kids, `containsSyntheticMedia: false` like the Studio "No"),
sets the thumbnail for long cuts (a cover of 2 MB or more is converted to a
1920-wide JPEG with `ffmpeg` in a temp dir), adds the video to the **AI;DR**
playlist, and prints `ID=`, `URL=`, `OEMBED=`. Errors print `FAIL: <step>`
and exit 1; after the upload step the message names the uploaded video id so
nothing is uploaded twice. `publish.mjs --uploader api|chrome` picks it
(default `api` when `YOUTUBE_REFRESH_TOKEN` is set).

One-time OAuth setup (owner):

1. Google Cloud project, enable **YouTube Data API v3**, OAuth consent
   screen, create an OAuth client of type **Desktop app**.
2. Put `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` in `.env.local`, run
   `node .agents/skills/aidr-youtube-upload/bin/yt-oauth.mjs` from the repo
   root, open the printed URL signed in as the channel owner, approve
   (`youtube.upload` + `youtube`). It writes `YOUTUBE_REFRESH_TOKEN` into
   `.env.local` (`--print` prints it instead). Copy all three to the sandbox
   secrets.
3. Publish the consent screen (**In production**). In **Testing** status the
   refresh token expires after 7 days.

Caveats: Google's docs once said videos from unverified API projects (created
after 28 Jul 2020) are locked to private until a compliance audit. The current
`videos.insert` page says they are not restricted. Do the first run with
`--privacy private`, check the video in Studio, then rely on public. If a
video comes back locked, request the audit via the YouTube API Services
audit form. The default quota is 10,000 units/day plus a separate bucket of
100 `videos.insert` calls/day; four uploads/day with thumbnail and playlist
cost about 400 units.

## Troubleshooting (hard-won Studio notes)

Drive Studio through `bin/yt-chrome "<agent-browser cmd>" …`. Prefer
`find role … click --name` or tagging an element from JS (`eval -b
<base64>` → set `data-x`) and then a real `click [data-x=…]`; Studio's
buttons ignore JS `.click()` in places. Selectors drift: if one is missing,
`screenshot <path>`, read the page with `snapshot -i`, fix `bin/yt-upload`
and this list.

- **The Studio tab is usually hidden** (`document.visibilityState ===
  "hidden"`). Animations stall, so closed menus and dialogs stay painted on
  top and swallow clicks. If a click doesn't change `aria-checked`, check
  `document.elementFromPoint`: a closed `ytcp-text-menu` /
  `ytcp-playlist-dialog` `tp-yt-paper-dialog` (`opened=false`) or a
  `tp-yt-iron-overlay-backdrop` is on top. `bin/js/unghost.js` sets those to
  `display:none`; `bin/js/reghost.js` clears it again. Run reghost before
  opening the playlist picker or the language menu, unghost before clicking
  form controls. Never bring the tab to the front.
- Start from a fresh load and `set viewport 1600 1000` (the user's window
  may be phone-narrow). `scrollIntoView` a control from JS before clicking
  it (the dialog scrolls inside its own container).
- Trust DOM reads (`aria-checked`, `textContent`) over screenshots. In
  `batch --bail` a failed step silently skips the rest; check each result.
- Build JS in a shell variable and pass `eval -b "$(printf '%s' "$JS" |
  base64)"`; nesting quotes inside `$( … )` inside `"…"` mangles the JS.
  `eval` prints strings quoted, numbers and booleans bare.
- **Create menu.** Right after a load a real click on Create does nothing;
  JS `.click()` the `<button>` whose text or `aria-label` is `Create`, wait
  ~2.5 s, then JS `.click()` the `tp-yt-paper-item` containing "Upload
  videos". Check `input[name=Filedata]` exists. The `?d=ud` URL does not
  open the dialog.
- **Upload.** `upload input[name=Filedata] <mp4>`; the Details step can take
  ~20 s to render in a background tab. 16:9 shows `youtu.be/<id>` there; a
  Short only gets `youtube.com/shorts/<id>` in the final dialog (and the
  Details link is not proof of publishing).
- **Title / description** are contenteditable (`#title-textarea #textbox`,
  `#description-textarea #textbox`): `el.focus();
  document.execCommand('selectAll'); document.execCommand('insertText',
  false, text)` keeps newlines. Read `innerText` back; for the first
  seconds of an upload the insert does nothing (title stays the file name),
  so retry.
- **Thumbnail**: `upload input#file-loader <cover.png>`.
- **Playlist.** Click `ytcp-video-metadata-playlists ytcp-dropdown-trigger`,
  wait until the list loads (up to ~20 s), find the innermost element whose
  text is exactly `AI;DR` inside `ytcp-playlist-dialog` (there is also a
  playlist named `AI`), click its `ytcp-checkbox-lit`, then `find role button
  click --name Done`. On the first try the list can fail to load (`labels=0`
  or `at <anonymous>`); close with Done and open again. Verify
  `ytcp-video-metadata-playlists` reads `AI;DR`.
- **Show more** is `ytcp-button#toggle-button`. It reveals paid promotion
  (`[name=VIDEO_PAID_PRODUCT_PLACEMENT_NO]`, required) and AI use
  (`[name=VIDEO_HAS_ALTERED_CONTENT_NO]` / `_YES`, required). The AI question
  covers making a real person say/do something, altering real footage, a
  realistic fake scene, or AI music as the focus — not AI voice-over on
  motion graphics. Answer No for AI;DR films unless the owner says otherwise.
  Audience is `[name=VIDEO_MADE_FOR_KIDS_NOT_MFK]`.
- **Tags.** Focus `#tags-container input` from JS, `keyboard inserttext
  "<comma list>"`, then `press Enter` — Enter splits the list into chips.
  Don't `click` the input (it opens a chip for editing) and don't press
  Backspace in it (it deletes chips). The `type <sel> <text>` command
  mis-parses selectors with spaces.
- **Language.** Studio remembers the last language, so always set and verify
  it (`ytcp-form-language-input` must read `Video language English` /
  `Vietnamese`). Reghost, JS-`.click()` `ytcp-form-language-input
  ytcp-text-dropdown-trigger`, wait ~3 s, then in the `ytcp-text-menu` whose
  `tp-yt-paper-dialog` is `opened` dispatch `pointerdown, mousedown,
  pointerup, mouseup, click` on the `tp-yt-paper-item` with text exactly
  `English` / `Vietnamese`. Real clicks, arrow keys and type-ahead don't reach
  the list in a hidden tab. If the menu is still ghosted from earlier steps
  the pick silently does nothing, which is why the tool retries the whole
  reghost → open → pick sequence. Category (`ytcp-form-select#category`)
  stays Science & Technology once set; `find text 'Science & Technology'
  click --exact` worked the first time.
- **Publish.** `click #next-button` three times (Video elements → Checks →
  Visibility), `click [name=PUBLIC]`, `click #done-button` (label
  "Publish"). `ytcp-video-share-dialog` then shows "Video published" and the
  link.

## Captions (manual, optional)

AI;DR films have burned-in captions, so a separate subtitle track is
optional. **Don't try it from a background tab, and never bring the tab
to the front** (that changes the user's active tab). The subtitle editor
(`ytve-captions-editor-upload-dialog`, under Languages → "Upload manual" →
"With timing" → Continue) needs a foreground tab: in a hidden tab the SRT
reaches `youtubei/v1/globalization/parse_captions`, but the editor with
its Publish button never renders. The Continue button calls
`#captions-file-loader.click()`, which opens a native file chooser; to feed
it, patch `HTMLInputElement.prototype.click` from JS to tag the input
instead of opening the chooser, then `upload [data-x=…] <srt>`. Leave
captions for the user to add by hand in Studio if wanted
(`videos/releases/<v>/captions-{en,vi}.srt`, daily `captions*.srt`).

Selectors drift: if one is missing, take a screenshot
(`screenshot <path>`), read the page with `snapshot -i`, update this skill
with what worked.
