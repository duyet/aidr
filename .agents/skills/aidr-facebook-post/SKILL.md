---
name: aidr-facebook-post
description: Post an AI;DR release (or other announcement) to the AI;DR Facebook Page (facebook.com/aidr.today) as the Page, through the user's own Chrome — text, link preview, Post — then return the post URL. Use after a release's English 16:9 film is live on YouTube, or when asked to "post the release to Facebook" / "share on the FB Page".
---

# aidr-facebook-post

Page: **https://www.facebook.com/aidr.today/** — post *as the Page* (the
left rail says "Manage Page / AI;DR" and the composer header shows the
AI;DR avatar). If it shows a personal profile, switch to the Page from the
profile menu first.

## Rules

- **Use the user's running Chrome** over DevTools, never a separate
  Chrome. `bin/fb-chrome "<agent-browser cmd>" ...` pins every batch to
  the `facebook.com/aidr.today` tab (opens one if missing). Only one agent
  drives Chrome at a time.
- Never type passwords. If Facebook asks to log in or verify, stop and ask
  the user.
- Post a release only after its English 16:9 film is live on YouTube; the
  post links the video. Record the post URL as `facebookUrl` on that cut's
  row in `videos/releases/STATUS.json` so it is never posted twice.

## Text

Generate it from the release file in the aidr repo:

```bash
cd /Users/duet/project/aidr
pnpm --filter @aidr/web fb-post-release vX.Y.Z --dry-run   # --lang vi for Vietnamese
```

Then check two things before pasting:

- **`Watch:` must be the new film's id** (`youtubeId` in
  `videos/releases/STATUS.json`), not an older upload still in the release
  file.
- **The English notes link needs `?lang=en`.** `/release/vX.Y.Z` with no
  language hint serves Vietnamese OG tags (`og:locale vi_VN`), so Facebook
  builds a Vietnamese preview. Use
  `https://aidr.today/release/vX.Y.Z?lang=en` (VI posts use `?lang=vi`).
  Check with `curl -sL "<url>" | grep og:title`.

Daily brief: use the "Facebook Page" block of
`videos/daily-news/editions/<date>/posts.md`, add `Watch: <youtu.be link
of the EN 16:9>`, and make `Today's stories:
https://aidr.today/date/<date>?lang=en` the **last** link so it becomes the
preview. Record `facebookUrl` on the daily `en-16x9` row.

## Steps

The tab is usually hidden in the background: run `set viewport 1600 1000`
first and trust DOM reads over screenshots.

1. Composer: `find role button click --name "What's on your mind?"`. The
   dialog is `[role=dialog]` "Create post"; the editor is
   `[role=dialog] [contenteditable=true]`. If a draft exists, the button's
   name is the draft's first line instead; open it, `press Meta+a`,
   `press Backspace`, and remove the old preview
   (`find role button click --name 'Remove link preview from your post'`).
2. Type line by line: focus the editor from JS, then for each line
   `keyboard inserttext "<line>"`, and `press Enter` between lines (an
   empty line is just another Enter). Read `innerText` back and compare.
3. Wait ~8 s for the preview card ("Creating link preview" goes away).
   Facebook picks the preview from the last link; "Change Preview" only
   cycles images of that same link. Check the card's title is in the
   post's language.
4. `find role button click --name Next --exact` → "Post settings": audience
   Public, "Publish now", Boost off → `find role button click --name Post
   --exact`.
5. Permalink: reload the Page and scroll to the posts. Facebook fills the
   timestamp link's `href` only on a real hover, and its text is
   obfuscated, so JS text matches and `hover` by name both miss. What works:
   `snapshot -i`, take the ref of the `link "… ago"` just above the post's
   `link "AI;DR vX.Y.Z — …"`, then in **one** batch (refs only live within
   a batch) `snapshot -i` → `scrollintoview @eN` → `get box @eN`; then
   `mouse move <x+w/2> <y+h/2>` and read
   `document.elementFromPoint(x, y).closest("a").href`. Strip the query
   string: `https://www.facebook.com/aidr.today/posts/pfbid…`.
6. If the composer button click does nothing, the Page is scrolled past
   it: `eval window.scrollTo(0,0)` first. Check the editor exists
   (`[role=dialog] [contenteditable=true]`) and has focus before typing,
   or the text goes nowhere.

Selectors drift: if one is missing, take a screenshot, read
`snapshot -i`, and update this skill with what worked.
