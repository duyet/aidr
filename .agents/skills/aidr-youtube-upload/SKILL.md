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
  works, must be < 2 MB; downscale with `sips -Z 1920` if needed).
- **Language**: video language English or Vietnamese to match the cut;
  category Science & Technology.
- 9:16 renders ≤ 3 min upload as Shorts automatically; give them the same
  title with `#Shorts` and a two-line description with the release link.

## Upload steps (Studio)

Run each line through `bin/yt-chrome`. Prefer `find role … click --name`
or tagging elements from JS (`eval -b <base64>` → set `data-x`) and then a
real `click [data-x=…]`; Studio's buttons ignore JS `.click()` in places.

**The Studio tab is usually a hidden background tab** (`document.visibilityState
=== "hidden"`). Animations stall there, so closed menus and dialogs stay
painted on top of the form and swallow clicks, and screenshots lag. Rules
that follow from it:

- Start each upload from a fresh load (`open …/videos/upload`) and
  `set viewport 1600 1000` (the user's window may be phone-narrow).
- Before every click on a form control, `scrollIntoView` it from JS (the
  dialog scrolls inside its own container; `click` alone may miss). If a
  click doesn't change `aria-checked`, check `document.elementFromPoint` —
  a closed `ytcp-text-menu`/`ytcp-playlist-dialog` `tp-yt-paper-dialog`
  (`opened=false`) or a `tp-yt-iron-overlay-backdrop` is on top. Set those
  to `display:none`, and clear that inline style again before reopening
  the playlist picker.
- Trust DOM reads (`aria-checked`, `textContent`) over screenshots.
- In `batch --bail` a failed step (e.g. `scrollintoview`) silently skips
  the rest; check each result.

- Build JS in a shell variable and pass it as `eval -b "$(printf '%s'
  "$JS" | base64)"`; nesting quotes inside `$( … )` inside `"…"` mangles
  the JS. `eval` prints strings quoted, numbers and booleans bare.

1. Create menu: right after a page load the real click on Create does
   nothing; call `.click()` from JS on the `<button>` whose text or
   `aria-label` is `Create`, wait ~2.5 s, then JS-`.click()` the
   `tp-yt-paper-item` containing "Upload videos". Check
   `input[name=Filedata]` exists. The `?d=ud` URL does not open the dialog.
2. `upload input[name=Filedata] <mp4>` — the Details step can take ~20 s
   to render in a background tab. 16:9 shows the `youtu.be/<id>` link
   there; a Short only gets its `youtube.com/shorts/<id>` link in the
   final "Video published" dialog.
3. Title / description: `#title-textarea #textbox` and
   `#description-textarea #textbox` are contenteditable; from JS:
   `el.focus(); document.execCommand('selectAll');
   document.execCommand('insertText', false, text)` keeps newlines. Read
   `innerText` back to verify; for the first seconds of an upload the
   insert does nothing (title stays the file name) — retry until it takes.
4. Thumbnail: `upload input#file-loader <cover.png>`.
5. Playlist: click `ytcp-video-metadata-playlists ytcp-dropdown-trigger`,
   wait until the list loads (up to ~20 s), find the innermost element
   whose text is exactly `AI;DR` inside `ytcp-playlist-dialog` (there is
   also a playlist named `AI`), click its `ytcp-checkbox-lit`,
   then `find role button click --name Done`. Verify
   `ytcp-video-metadata-playlists` text is `AI;DR`.
6. Audience: `[name=VIDEO_MADE_FOR_KIDS_NOT_MFK]`.
7. "Show more" is `ytcp-button#toggle-button`. It reveals:
   - Paid promotion: `[name=VIDEO_PAID_PRODUCT_PLACEMENT_NO]` (required).
   - AI use (required): `[name=VIDEO_HAS_ALTERED_CONTENT_NO]` / `_YES`.
     The question covers making a real person say/do something, altering
     real footage, a realistic fake scene, or AI music as the focus — not
     AI voice-over on motion graphics. Answer No for AI;DR films unless the
     user says otherwise.
   - Tags: focus `#tags-container input` from JS, `keyboard inserttext
     "<comma list>"`, then `press Enter` — Enter splits the list into
     chips. Don't `click` the input (it opens a chip for editing) and don't
     press Backspace in it (it deletes chips). The `type <sel> <text>`
     command mis-parses selectors with spaces.
   - Language: Studio remembers the last language and category, so read
     `ytcp-form-language-input` first and only change what differs. To
     change it: clear any `display:none` you set on `ytcp-text-menu`
     dialogs, JS-`.click()` `ytcp-form-language-input
     ytcp-text-dropdown-trigger`, wait ~3 s, then in the `ytcp-text-menu`
     whose `tp-yt-paper-dialog` is `opened`, find the `tp-yt-paper-item`
     with text exactly `English` / `Vietnamese` and dispatch
     `pointerdown, mousedown, pointerup, mouseup, click` on it from JS.
     Real clicks, arrow keys and type-ahead don't reach the list in a
     hidden tab (it scrolls to the current value and focus stays on the
     trigger). Category (`ytcp-form-select#category`) stays Science &
     Technology once set; `find text 'Science & Technology' click --exact`
     worked the first time.
8. `click #next-button` three times (Video elements → Checks → Visibility);
   the Checks step should read "Copyright No issues found / Community
   Guidelines No issues found" (if it says checks wait for SD processing,
   publishing is still allowed and the checks run afterwards — say so in
   the report). Then `click [name=PUBLIC]` → `click #done-button` (label
   "Publish").
9. `ytcp-video-share-dialog` shows "Video published" and the
   `https://youtu.be/<id>` link. Report the id and put it where it belongs
   (release `STATUS.json` row `youtubeId`/`youtubeUrl`/`uploaded`, release
   file `youtubeId` / `youtubeIdVi`, Web Store promo video if asked).

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
