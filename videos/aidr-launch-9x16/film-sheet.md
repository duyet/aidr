# Film sheet — shared by every frame worker of the AI;DR launch film

Read this after your role file and your packet. It carries what the packet does not: the video-wide
direction, the logo glyph paths, the real data, and the shared digest-card spec. Where this sheet and
a generic rule in your role file disagree, this sheet wins (it is the owner's direction).

## Video direction

- palette system: two grounds only. `sun` #F5C518 full-bleed (frames 1, 7) and `paper` #F7F7F5 (frames 3, 4, 5-left, 6); `ink` #0A0A0A is the one dark ground (frame 2, frame 5-right). Logo glyphs use logo ink #1C1917 on sun. `ember` #B45309 only for category labels and "Updated" text. `sun` on paper appears only as the marker highlight and the logo tile. No other hues except the site's own entity colours inside the digest card (OpenAI/Anthropic #8B300B, Trump/Valuation #4F1F9B, Regulation #8B1A3A, Safety #0D5468).
- type: display = EB Garamond Variable 500 (wordmark, numerals, headlines on paper); body/labels = Source Sans 3 Variable; data = the frame.md mono role. Vietnamese sets in Source Sans 3 Variable 600 (its Vietnamese subset is staged).
- the spine: one ink semicolon. It opens frame 1, the camera passes through its dot into frame 2, it is the hinge of frame 5, and frame 7 rebuilds the wordmark around it. Its shape is always the outlined path from `assets/favicon.svg`, never a typed character.
- motion grammar (owner's rules, 30fps): arrive fast, land soft — every arrival uses the parking ease (each frame covers ~15% of the remaining distance; `expo.out` is the nearest built-in), never linear, never a dead stop, never back/bounce/elastic. Moves last at least 0.3s; big moves 0.5–0.75s. Grouped elements stagger 2–4 frames (0.067–0.133s). Text stays still at least 8 frames (0.27s) after landing and long enough to read. Blur follows direction and speed and is gone at rest; never across a cut. One focal point per scene.
- nothing freezes: every frame runs ONE linear push on its root camera wrapper from t=0 to its end, 3% total scale (frame 6: 2%). Never a loop, never on an individual element, never starting mid-hold. No breathing.
- beat grid: 120 BPM, beat = 0.5s, each frame starts on a bar line. Reveals land on beats or half-beats; cuts land on the beat. No voiceover: the music's beats take the place of spoken cues, so reveals are paced to the grid, never front-loaded.
- rhythm: frame 1 is slow and sparse; frames 2–5 are the fast middle; frame 6 is one long glide; frame 7 is the held ending (last full second is still except the push).
- sound: every named sfx peaks on the visual hit it supports, within one frame.
- negative list: no gradients, glow, particles, shadows heavier than a 1px hairline, purple/blue, stock icons, bounce. Neither failure mode: no slideshow (everything in then frozen), no screensaver (everything drifting independently).

## Overrides to the generic worker role

- There is NO narration and NO caption track. On-screen headlines are the content, so full headline
  sentences are allowed as visible text. Pace reveals to the beat grid (beat = 0.5s) instead of a voiceover.
- Full-bleed grounds ride on a full-duration `class="clip"` background layer, never on `#root`.
- The bottom 17% keep-out applies to text and cards; full-bleed grounds and the giant semicolon may cross it.
- Every frame wraps its content in one camera wrapper and runs the single linear root push described in
  Video direction (scale 1 → 1.03 over the whole duration, `ease: "none"`, transform-origin centre). Other
  camera moves named in your Scene lines go on a second, inner wrapper so the two never fight.
- Parking ease (use for arrivals; it is a pure function, so it is seek-safe):
  `const park = (k = 0.15, fps = 30) => (dur) => (p) => (1 - Math.pow(1 - k, p * dur * fps)) / (1 - Math.pow(1 - k, dur * fps));`
  then `ease: park()(0.6)` on a 0.6s tween. `expo.out` is an acceptable stand-in.
- Directional blur: tween `filter: blur()` is isotropic, so for direction use a short stretched ghost or
  an SVG `feGaussianBlur` with `stdDeviation="x 0"` / `"0 y"`; it must be zero at rest.
- Fonts: paste the `@font-face` block from `frame.md` inside your `<template>`; families are
  "EB Garamond Variable" (display, weight 500) and "Source Sans 3 Variable" (body, 400/600). Both carry
  Vietnamese glyphs. Font URLs are relative to the project root (`assets/fonts/...`).
- Timing is 30fps. No `repeat: -1`, no `Math.random`, no `Date.now`, no CSS transitions or keyframes.

## Logo glyphs (outlined paths — never type the wordmark on the sun ground)

All six paths share one coordinate space: x 2.5–258, y 22–107 (wordmark cap height 68.8, from y 22.2 to 91).
Draw them in one `<svg viewBox="0 0 260 110">` (or separate groups with the same viewBox) filled `#1C1917`.
The semicolon = SEMI_DOT + SEMI_COMMA: bbox x 100.6–114.9, y 40.5–106.5 (14.3 wide, 66 tall); dot is the
square x 100.8–114.9, y 40.5–54.3 (centre 107.85, 47.4). Yes, the dot is square — that is the brand.

Frame 1 and frame 7 geometry (must match exactly): the semicolon alone, bbox centred at canvas (960, 470),
497px tall (scale 7.53 from path units), so its dot is a 106px square centred at (960, 274).

```
A          = "M69.6 91L55.3 91L49.2 73.4L23.0 73.4L16.9 91L2.5 91L27.6 22.2L44.6 22.2L69.6 91ZM37.1 36.2L36.1 32.8L35.8 33.9Q35.3 35.6 34.6 37.9Q33.9 40.1 26.2 62.6L26.2 62.6L46.0 62.6L39.2 42.8L37.1 36.2Z"
I          = "M88.9 91L74.5 91L74.5 22.2L88.9 22.2L88.9 91Z"
SEMI_DOT   = "M114.9 54.3L100.8 54.3L100.8 40.5L114.9 40.5L114.9 54.3Z"
SEMI_COMMA = "M114.9 77.3L114.9 87.8Q114.9 93.6 113.7 98.1Q112.4 102.6 109.6 106.5L109.6 106.5L100.6 106.5Q103.8 102.5 105.5 98.5Q107.1 94.5 107.1 91L107.1 91L100.8 91L100.8 77.3L114.9 77.3Z"
D          = "M188.0 56.1L188.0 56.1Q188.0 66.7 183.8 74.7Q179.6 82.6 172.0 86.8Q164.4 91 154.5 91L154.5 91L126.7 91L126.7 22.2L151.6 22.2Q169.0 22.2 178.5 31.0Q188.0 39.7 188.0 56.1ZM173.5 56.1L173.5 56.1Q173.5 45.0 167.7 39.2Q162.0 33.3 151.3 33.3L151.3 33.3L141.1 33.3L141.1 79.9L153.3 79.9Q162.6 79.9 168.0 73.5Q173.5 67.1 173.5 56.1Z"
R          = "M257.9 91L241.7 91L225.7 64.9L208.9 64.9L208.9 91L194.4 91L194.4 22.2L228.8 22.2Q241.1 22.2 247.8 27.5Q254.5 32.8 254.5 42.7L254.5 42.7Q254.5 49.9 250.4 55.2Q246.3 60.4 239.3 62.1L239.3 62.1L257.9 91ZM240.0 43.3L240.0 43.3Q240.0 33.4 227.3 33.4L227.3 33.4L208.9 33.4L208.9 53.7L227.7 53.7Q233.8 53.7 236.9 51.0Q240.0 48.2 240.0 43.3Z"
```

The small sun logo tile (frame 5, browser tab in frame 6) is `assets/favicon.svg` used as an `<img>`.

## Real data — aidr.today edition 2026-09-30 (use word for word, keep this casing)

Counts: 318 stories today; 8 in the digest; "Updated 43m ago".

| # | label | label colour | English headline (entity words in **bold**, with their colour) | Vietnamese |
|---|---|---|---|---|
| 1 | ANTHROPIC | #8B300B | UPDATE: **Anthropic** (#8B300B) Locked Into $518B of Compute Deals, 80% Non-Cancelable | Cập nhật: Anthropic cam kết 518 tỷ USD cho các thỏa thuận điện toán, 80% không hủy bỏ |
| 2 | REGULATION | #9F1239 | UPDATE: **Trump** (#4F1F9B) Releases AI Accord Requiring External Audits and Board Oversight | CẬP NHẬT: Trump ra mắt Hiến chương AI yêu cầu kiểm toán bên ngoài và giám sát hội đồng quản trị |
| 3 | OPENAI | #8B300B | UPDATE: **OpenAI** (#8B300B) Scraps Planned October Launch of GPT-6.1 **Astra** (#9F1239) in Rare **Safety** (#0D5468) Rollback | OpenAI hủy ra mắt GPT-6.1 Astra |
| 4 | OPENAI | #8B300B | **OpenAI** (#8B300B) Seeks $30B Bridge Round at $1.4 Trillion **Valuation** (#4F1F9B) | OpenAI tìm kiếm 30 tỷ USD cho vòng vốn bắc cầu ở định giá 1.400 tỷ USD |
| 5 | OPENAI | #8B300B | UPDATE: **OpenAI** (#8B300B) Launches Dots, Always-On Agents That Work Across 4,000+ Apps | Cập nhật: OpenAI ra mắt Dots, các agent luôn hoạt động trên 4.000 ứng dụng |
| 6 | REGULATION | #9F1239 | **Trump** (#4F1F9B) and Tech CEOs Align on Voluntary AI **Regulation** (#9F1239) | Trump và CEO công nghệ cùng quan điểm về quy định AI tự nguyện |
| 7 | FUNDING | #322A90 | UPDATE: **US Cloud** (#8B300B) Giants Boost AI Capex Outlook 66% to $1.89 Trillion | Gã Khổng Lồ Đám Mây Mỹ Tăng 66% Dự Án Đầu Tư AI Lên 1,89 Nghìn Tỷ USD |
| 8 | OPENAI | #8B300B | **OpenAI** (#8B300B) apologizes to Australia after its AI agents breached government sites | OpenAI xin lỗi Úc sau khi AI agent xâm nhập trang chính phủ |

Frame 3's assembled headline drops the "UPDATE:" prefix: "Anthropic Locked Into $518B of Compute Deals, 80% Non-Cancelable".
In frame 4's card, row 1 likewise reads without "UPDATE:" so it matches the handoff; rows 2–8 keep theirs.

## Digest card (frames 4 and 6 build the same component)

A reconstruction of the card on aidr.today, without story thumbnails.
- Surface `#FFFFFF`, radius 32px, 1px border `#0A0A0A14`, no shadow, padding 44px 48px.
- Header row: "AI;DR" in EB Garamond 500 (in the UI the site sets the wordmark as serif text, so text is
  correct here), then the date "2026-09-30" in Source Sans 3 400, `#474747`, baseline-aligned. Far right, a
  pill `#E5E5E3` holding "8  12  16"; the 8 sits in an ink circle with paper-colour text.
- Body: two columns of four rows (1–4 left, 5–8 right), column gap 64px, row gap 22px. A row is: the
  number ("1.") in `#474747`; the label in small caps (uppercase, letter-spacing 0.06em, weight 600, its
  colour); then the headline in Source Sans 3 400 ink with a 1px `#0A0A0A14` underline under each line
  and the entity words at weight 600 in their colour. Headlines wrap to two lines.
- Footer: "318 stories" left in `#474747`; "Updated 43m ago" right in `#B45309`.
- Frame 4 sizes (card 1400px wide, centred at x 960): header wordmark 52px, date 22px; headline 30px /
  line-height 1.3; label 17px; footer 20px.
- Frame 6 draws the same card inside the browser window at the width the window allows, same proportions.

## Portrait version (1080×1920) — overrides every landscape number above

This project is the vertical cut. The canvas is 1080 wide, 1920 tall. Everything about time is frozen:
keep every timeline position, duration, ease, stagger, the `seq` / `tl` speed wrapper, element ids and
class prefixes exactly as they are in the landscape file you start from. Only geometry changes: positions,
sizes, line breaks, travel distances and directions, transform origins (canvas centre is now 540, 960).

Safe zone (TikTok / Reels chrome): keep text and logos inside x 60–960 and y 200–1580. Full-bleed grounds
cover the whole 1080×1920. Nothing important in the right 120px or the bottom 340px.
Type is read on a phone: no running text under 30px; headlines 56px and up.

Shared geometry:
- Frames 1 and 7: the semicolon alone, bbox centred at (540, 820), 620px tall (scale 9.394 from path
  units), so its dot is a 132px square centred at (540, 575).
- Frame 1 handoff out: the dot grows about its own centre toward full frame, ending around 1500px, still
  accelerating. Frame 2 starts on full ink.
- Frame 3 → 4 handoff (hard cut, must match to the pixel on screen at the cut; frame 3 is at push scale
  1.03 about (540, 960) at that moment and frame 4 at 1.0, so frame 3 counter-scales as it does now):
  numeral "1." EB Garamond 500, 76px, #474747, left x 80, baseline y 700;
  headline EB Garamond 500, 76px, line-height 1.1, ink, left x 150, first baseline y 700, three lines with
  forced breaks: "Anthropic Locked Into" / "$518B of Compute Deals," / "80% Non-Cancelable";
  label "ANTHROPIC" Source Sans 3 600, 28px, tracking 0.06em, #8B300B, left x 150, baseline y 606.

Per-frame layout:
- Frame 1: labels "2026-09-30" (left, x 60) and "aidr.today" (right edge x 960) on a baseline near y 240;
  the typed line "318 AI stories today" centred under the semicolon around y 1240, about 40px with the
  same wide tracking.
- Frame 2: numeral optically centred near (540, 800); final "8" about 900px tall; "stories that matter"
  centred under it (about 64px); "From 26+ sources" centred at y 250; the six headline rows are spread
  down the full height (every ~300px) at about 44–60px type, still travelling left and right.
- Frame 3: the paragraph sets in one column x 80–1000 (920 wide), sized to fill roughly y 230–1480; the
  three marked phrases are the same words; they travel into the 3→4 handoff block above.
- Frame 4: the card is one column: surface x 50–1030, top y 200; header wordmark 64px; eight rows stacked
  (number, label, two-line headline at 36px / 1.3); footer; the card ends by about y 1470. The AnyRouter
  credit is centred under it on two lines if needed, ending above y 1580. Row 1 arrives from the handoff
  block and settles into the first row slot.
- Frame 5: the split is horizontal: English on paper in the TOP half (y 0–960), Vietnamese on ink in the
  BOTTOM half, the sun tile on the seam at (540, 960). Halves enter from the top and bottom edges; blur is
  vertical. Headlines centred in their halves, width up to 880px, English about 76px, Vietnamese about
  60px. "EN" label top-left of the top half at y 230, "VI" label at the bottom-left of the bottom half
  above y 1580.
- Frame 6: the browser window sits in the upper part: x 50–1030, y 210–1130, showing the site header and
  the digest card as ONE column whose lower rows are cut off by the window edge (that is fine — it is a
  window). It rises from below as now. The camera shift left is replaced by a small settle upward. The
  count "6 channels" sits left-aligned at x 80 with its baseline near y 1270, and the six chips follow in
  a 2-column grid (3 rows) between y 1300 and y 1570, each still sliding in from the right on its word.
- Frame 7: wordmark lockup about 760px wide centred near y 760; the question on two lines
  ("What's happening" / "in AI today?") at about 76px centred below; "aidr.today" under it, about 34px,
  ending above y 1400.
