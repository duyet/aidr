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
- **Playlist**: release films → "AI;DR Releases"; daily briefs →
  "AI;DR Daily"; Shorts → same playlist as their long cut. Create the
  playlist in the dialog if missing (Public).
- **Thumbnail**: the cover still from `renders/*-cover.png` (1280×720,
  < 2 MB; downscale with `sips -Z 1280` if needed).
- **Language**: video language English or Vietnamese to match the cut;
  category Science & Technology.
- 9:16 renders ≤ 3 min upload as Shorts automatically; give them the same
  title with `#Shorts` and a two-line description with the release link.

## Upload steps (Studio)

Run each line through `bin/yt-chrome`. Prefer `find role … click --name`
or tagging elements from JS (`eval -b <base64>` → set `data-x`) and then a
real `click [data-x=…]`; Studio's buttons ignore JS `.click()` in places.

1. `find role button click --name 'Create'` → `find role menuitem click --name 'Upload videos'`
   (or the upload icon on the dashboard).
2. `upload 'input[name=Filedata]' <mp4>` — upload starts, the Details step
   opens.
3. Title: the title box is a contenteditable `#textbox` inside
   `ytcp-social-suggestions-textbox#title-textarea`; select all and type.
   Description: the `#textbox` inside `#description-textarea`.
4. Thumbnail: `upload 'input#file-loader' <cover.png>` (Details step).
5. Playlist: open the "Select" playlist dropdown, tick the playlist, Done.
6. Audience: radio `VIDEO_MADE_FOR_KIDS_NOT_MFK`.
7. "Show more": tags input (comma-separated), language, category.
8. Next → Video elements (skip) → Next → Checks (wait for "No issues
   found" or report what it says) → Next → Visibility: radio `PUBLIC`
   → Publish (Save).
9. Read the video link from the confirmation dialog
   (`https://youtu.be/<id>`), close it, and report the id. Then put it
   where it belongs (release file `youtubeId` / `youtubeIdVi`, Web Store
   promo video if asked).

Selectors drift: if one is missing, take a screenshot
(`screenshot <path>`), read the page with `snapshot -i`, update this skill
with what worked.
