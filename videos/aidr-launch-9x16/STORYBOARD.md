---
format: 1080x1920
duration: 30.6s
message: "Too much AI news; AI;DR ranks it down to the eight stories that matter, every day, in English and Vietnamese."
arc: Future Pacing with a Demo Loop tail — Hook → Value claim → Mechanism → Result → Reach → Product → Lockup
audience: People who follow AI closely — builders, researchers, founders; English and Vietnamese readers
mode: autonomous
music: urgent short string ostinato, 133 BPM, minimal news underscore, no brass, builds through the middle and resolves on a held final chord
---

<!-- Narration was added after the first draft (owner: "cool warm voice over"). Lines are short so the frames keep their grid durations; durations are NOT synced to voice length. -->
<!-- PORTRAIT VERSION (TikTok / Reels / Shorts) of videos/aidr-launch. Same story, script, timings and audio; every frame is re-laid out for 1080x1920 per film-sheet.md "Portrait version". Layout words in the Scene lines below describe the landscape master. -->
<!-- Speed: the film is authored on a 120 BPM grid (bar = 2s) and played 10/9 faster, so a bar is 1.8s (54 frames) and the tempo is 133.3 BPM. -->
<!-- Scene times inside each frame are AUTHORED times (120 BPM). On screen every time is x0.9, except frame 1, which the owner asked to be longer: it plays at x1.35 (5.4s). Frame 4 is authored as 6s (5.4s on screen) to carry the AnyRouter credit. Frame boundaries on screen: 5.4, 9, 12.6, 18, 21.6, 27, 30.6s. -->
<!-- Spine: one ink semicolon on yellow. It opens the film, every scene passes through or hinges on it, and it closes the film inside the logo. -->
<!-- The digest card in frames 4 and 6 is rebuilt in HTML from data/edition-2026-09-30.txt (the captured card image is only 1200x630). -->
<!-- Figures and headlines are from the live capture of aidr.today on 2026-09-30 (capture/extracted/visible-text.txt, tldr-live.txt): 318 stories, 8 in the digest. -->

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

## Frame 1 — The semicolon

- scene: A single ink semicolon blinks like a cursor on full-bleed yellow while "318 AI stories today" types beside it
- voiceover: "Three hundred and eighteen AI stories. Today alone!"
- duration: 5.4s
- poster: 3.8s
- transition_in: cut
- status: animated
- src: compositions/frames/01-semicolon.html
- type: hook
- persuasion: Pain validation
- beat: curiosity + overwhelm
- blueprint: typewriter-reveal
- asset_candidates: assets/favicon.svg — the site mark as outlined vector paths (tile plus five glyph paths A, I, semicolon, D, R)
- focal: assets/favicon.svg
- roles: favicon = cutout (only its semicolon path is used, at large scale)
- sfx: soft-tick (each caret blink), keyboard-type (the typed line), whoosh-in (the final push)
- handoff_out: semicolon upper dot — centre x 960, y 274 (106px diameter at rest); at the cut it has grown to about 900px diameter and is still accelerating toward the camera (scale rising, no drift in x/y); opacity 1; colour #1C1917

narrativeRole: Opens on the brand's one ownable glyph and names the viewer's problem in their own terms: there is too much AI news to read.
keyMessage: 318 AI stories today. Nobody reads 318.

Adapt: keep typewriter-reveal's persistent mark with a typed line; the mark is the semicolon, not a logo, and there is no collapse at the end.
Scene 1 (0.0–1.5s): full-bleed sun ground, nothing else. The ink semicolon sits dead-centre at ~46% of frame height. It is there from t=0 (no entrance) and blinks like a caret on the beat: off at 0.5s, on at 0.75s, off at 1.0s, on at 1.25s (square-wave, no fade). Centered, single element, the emptiness is the point.
Scene 2 (1.5–3.0s): one line types on under the semicolon, centred, body face at label scale with wide tracking: "318 AI stories today" — type-on with caret (`discrete-text-sequence`), finished by 2.3s, then still. Top-left micro-label "2026-09-30" and top-right "aidr.today" are present from t=0 at 60% ink.
Scene 3 (3.0–4.0s): the typed line and labels drop out in 4 frames; the camera zooms to the semicolon's upper dot (`coordinate-target-zoom`), accelerating, so the dot swells toward full frame for the zoom-through.

## Frame 2 — 318 becomes 8

- scene: The camera dives through the semicolon's dot into ink; a wall of real headlines floods in, then the counter drops 318 → 8 and the wall falls away
- voiceover: "More than twenty-six sources. You need eight!"
- duration: 3.6s
- poster: 3.1s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/02-318-to-8.html
- type: benefit_highlight
- persuasion: Statistical proof
- beat: overwhelm → relief
- blueprint: dataviz-countup
- asset_candidates:
- focal: the numeral
- roles: headline wall = background (dim ~35%) · numeral = hero
- sfx: whoosh-in (0.0s), riser (1.0–2.5s), impact-soft (2.5s, on the 8 landing)
- handoff_in: arrives inside the ink of frame 1's dot — the whole frame is ink #0A0A0A at the cut, scale settling from large to 1, no x/y drift

narrativeRole: Lands the value claim by the second beat: hundreds in, eight out.
keyMessage: 318 stories. 8 that matter.

Adapt: keep dataviz-countup's one hero number that the whole frame serves; it counts DOWN, and the "chart" is a wall of real headlines.
Scene 1 (0.0–1.0s): ink ground. A small uppercase line "From 26+ sources" sits at the top from 0.35s for the whole shot (26 is the live count of enabled sources on capture day). Six rows of today's real headlines (from `data/edition-2026-09-30.txt`) in paper at 35% stream across the full width, alternate rows travelling left and right with horizontal motion blur, rows staggered 3 frames. Over them, dead-centre, the numeral "318" in display face, sun, ~22% of frame height, already counting is NOT started. Full-width strips, 2 depth layers.
Scene 2 (1.0–2.5s): the counter runs 318 → 8 (`counting-dynamic-scale`, tabular numerals) and grows as it falls, reaching ~55% of frame height. On each half-beat one headline row accelerates off its edge and is gone (six rows, 1.0s to 2.25s). The riser peaks as the last row leaves.
Scene 3 (2.5–4.0s): "8" lands on the beat at 2.5s with the impact, alone on ink. Under it, body face, paper: "stories that matter" arrives per word (`dynamic-content-sequencing`) 2.75–3.25s, then holds still. Centered, one focal point.

## Frame 3 — Marker pass

- scene: On paper, a yellow highlighter runs through a dense paragraph; the unmarked words fade and the marked ones pull together into today's number-one headline
- voiceover: "We read all of it, and keep what matters!"
- duration: 3.6s
- poster: 2.9s
- transition_in: cut
- status: animated
- src: compositions/frames/03-marker-pass.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: clarity
- blueprint: compose
- asset_candidates:
- focal: the marked words
- roles: paragraph = background (fades to 12%) · marked words = hero
- sfx: marker-swipe x3 (1.0s, 1.5s, 2.0s, each peaking mid-sweep), paper-slide (2.5s)
- handoff_out: headline block "Anthropic locked into $518B of compute deals, 80% non-cancelable" — left edge x 300, first baseline y 470, display face 72px, two lines, width 1320; opacity 1; at rest (no velocity); ember small-caps label "ANTHROPIC" at x 300, y 380; numeral "1." at x 228, first baseline y 470

narrativeRole: Shows the mechanism as an editor's gesture: reading for you and keeping only what matters.
keyMessage: "Anthropic locked into $518B of compute deals, 80% non-cancelable" — one line instead of an article.

Scene 1 (0.0–1.0s): paper ground. A dense justified paragraph in display face fills a 1320px column centred in the top 83%: today's eight real headlines run together as continuous prose, ink at 80%. It is on screen at t=0 (cut in on the beat). Layered: paragraph only.
Scene 2 (1.0–2.5s): a sun marker sweeps left to right behind three phrases of headline 1, one per beat (`css-marker-patterns`, highlight mode, slight skew, leading edge carries horizontal blur): "Anthropic" at 1.0s, "$518B of Compute Deals" at 1.5s, "80% Non-Cancelable" at 2.0s.
Scene 3 (2.5–4.0s): everything unmarked fades to 12% and then out; the three marked phrases travel (parking ease, blur along their path) and lock together into one two-line headline at the handoff position, the marker colour draining to plain ink as they land (3.1s). The label "ANTHROPIC" and the numeral "1." arrive 3 frames apart at 3.2s. Still from 3.4s. Asymmetric, upper-left weighted.

## Frame 4 — The digest

- scene: That headline becomes row 1 and seven more ranked rows snap in on the beat, forming the real AI;DR card with category labels and coloured names
- voiceover: "Ranked and summarized by AI, powered by AnyRouter!"
- duration: 5.4s
- poster: 3.1s
- transition_in: cut
- status: animated
- src: compositions/frames/04-digest.html
- type: product_intro
- persuasion: Friction reduction
- beat: relief + control
- blueprint: grid-card-assemble
- asset_candidates: assets/favicon.svg — the site mark as outlined vector paths (tile plus five glyph paths A, I, semicolon, D, R); assets/anyrouter-logo-black.svg — the official AnyRouter mark from anyrouter.dev/brand, shown in the credit line
- focal: the card
- roles: favicon = supporting (not shown large)
- sfx: soft-tick x7 (one per arriving row, on the row's landing frame), ui-settle (2.75s), pop (4.75s, on the AnyRouter mark)
- handoff_in: headline block identical to frame 3's handoff_out — left edge x 300, first baseline y 470, display face 72px, two lines, width 1320, opacity 1, at rest; label at x 300, y 380; numeral "1." at x 228

narrativeRole: Reveals the product itself as the result of the collapse: eight ranked lines, updated hourly.
keyMessage: This is AI;DR: today's AI news in eight lines.

Adapt: keep grid-card-assemble's staggered cascade into a held array; the first cell is already on screen from the previous frame.
Scene 1 (0.0–0.75s): paper ground. Row 1 starts exactly at the handoff position and size, then settles (parking ease, 0.6s) into its slot as the first row of a white rounded card: the card surface (1400 wide, centred, hairline border, no shadow) and its header — "AI;DR" in display face with "2026-09-30" beside it, and the 8 · 12 · 16 pill at the right with 8 selected — fade up around it. Row type is now body face, as on the site.
Scene 2 (0.75–2.5s): rows 2–8 arrive one per eighth-note (0.75, 1.0, 1.25 … 2.25s), two columns of four like the site: each row is number, ember small-caps category label, then the real headline with its entity word in the site's colour. Each slides up 24px with vertical blur and lands on its tick.
Scene 3 (2.5–4.0s): the footer lands at 2.75s: "318 stories" left, "Updated 43m ago" in ember right. The card is the single focal point. Centered, card ~72% of frame width.
Scene 4 (4.0–6.0s): a credit line arrives centred under the card, body face: "Scored and summarized by LLMs, powered by" at 3.2s, then the AnyRouter mark and the name "AnyRouter" at 3.79s, as the voice says it, 3 frames apart. Hold. (AI;DR calls its models through AnyRouter — `apps/web/worker/systemone.ts`.)

## Frame 5 — Two tongues

- scene: The frame splits at the semicolon, paper on the left and ink on the right; each headline lands twice, English and Vietnamese, in mirrored motion
- voiceover: "In English, and in Vietnamese!"
- duration: 3.6s
- poster: 2.3s
- transition_in: squeeze
- status: animated
- src: compositions/frames/05-two-tongues.html
- type: feature_showcase
- persuasion: Belonging
- beat: belonging
- blueprint: comparison-split
- asset_candidates:
- focal: the centre tile
- roles: none
- sfx: whoosh-short (0.0s), soft-tick (1.0s), page-flip (2.0s, on the swap)

narrativeRole: The one Vietnamese moment. Shows the edition is written in both languages, not machine-mirrored as an afterthought.
keyMessage: Every story, in English and tiếng Việt.

Adapt: keep comparison-split's two equal halves entering from opposite wings in mirror; no 3D tilt and no badges — the hinge is the semicolon tile.
Scene 1 (0.0–1.0s): left half paper, right half ink, meeting at x 960. A sun tile (the logo's rounded square, 168px) holding the ink semicolon sits on the seam at centre. Micro-labels: "EN" top-left of the left half, "VI" top-right of the right half, as the site's language toggle. First pair arrives in mirror at 0.5s, left from the left, right from the right, 3-frame stagger: left, display face on paper, "OpenAI Seeks $30B Bridge Round at $1.4 Trillion Valuation"; right, body face 600 on ink in paper colour, "OpenAI tìm kiếm 30 tỷ USD cho vòng vốn bắc cầu ở định giá 1.400 tỷ USD". Split-screen, each headline ~36% of frame width, vertically centred.
Scene 2 (1.0–3.0s): the pair holds and reads 1.0–2.0s. On the beat at 2.0s a waterfall cut (`cut-catalog.md`) swaps both sides in mirror to: "OpenAI apologizes to Australia after its AI agents breached government sites" / "OpenAI xin lỗi Úc sau khi AI agent xâm nhập trang chính phủ". The tile does not move.
Scene 3 (3.0–4.0s): hold. Both headlines still.

## Frame 6 — New tab

- scene: A browser tab opens and the day's digest is already there; the camera glides over the real interface as email 07:00, Telegram 08:00 and RSS tick in along the edge
- voiceover: "Six channels: web, new tab, email, Telegram, RSS, MCP!"
- duration: 5.4s
- poster: 4.0s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/06-new-tab.html
- type: feature_showcase
- persuasion: Friction reduction
- beat: ease
- blueprint: device-surface-showcase
- asset_candidates: assets/favicon.svg — the site mark as outlined vector paths (tile plus five glyph paths A, I, semicolon, D, R)
- focal: the browser window
- roles: favicon = supporting (tab icon)
- sfx: whoosh-in (0.0s), soft-tick x4 (3.0, 3.5, 4.0, 4.5s)

narrativeRole: Shows where the digest meets you: a new tab, your inbox, Telegram, RSS. No effort required.
keyMessage: Open a tab. It is already there.

Adapt: keep device-surface-showcase's floating window held as hero under a moving camera; cursorless, one surface, no screen cycling.
Scene 1 (0.0–1.2s): paper-deep ground. A browser window (hairline border, 1480 wide, plain tab bar with one tab: favicon + "New Tab") rises from below with vertical blur and lands centred by 0.8s. Inside: the site's header ("AI;DR  What's happening in AI today?") and the digest card with all eight rows, already complete. Centered, window ~77% of frame width.
Scene 2 (0.7–1.5s): no push-in (frame 4 already showed the card large). The camera settles straight to the full window shifted left, asymmetric 75/25; on the right a large "6" with the label "channels" lands at 0.7s.
Scene 3 (1.5–5.6s): six chips arrive under the count, top to bottom, each landing as the voice names it (1.83, 2.43, 3.11, 3.82, 4.54, 5.39s), each chip a logo plus its name: "Web", "New tab", "Email · 07:00", "Telegram · 08:00", "RSS", "MCP". Each slides in 40px from the right with horizontal blur.
Scene 4 (5.6–6.0s): hold.

## Frame 7 — Lockup

- scene: Everything folds back into the semicolon; A, I, D, R slide out from behind it, the yellow tile closes around them, and the line "What's happening in AI today?" holds above aidr.today
- voiceover: "AI DR is live! What's happening in AI today?"
- duration: 3.6s
- poster: 2.7s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/07-lockup.html
- type: cta
- persuasion: Future pacing
- beat: inevitability
- blueprint: logo-assemble-lockup
- asset_candidates: assets/favicon.svg — the site mark as outlined vector paths (tile plus five glyph paths A, I, semicolon, D, R)
- focal: assets/favicon.svg
- roles: favicon = cutout (its five glyph paths, split, at large scale; the yellow tile is not drawn — the ground is already sun)
- sfx: whoosh-in (0.0s), impact-soft (1.4s, on the wordmark locking), soft-tick (2.0s)
- handoff_in: full-bleed sun ground with the ink semicolon alone at centre x 960, y 470, ~46% of frame height, scale settling from large to 1, opacity 1

narrativeRole: Closes the loop on the opening glyph and gives the one thing to do next.
keyMessage: AI;DR — What's happening in AI today? aidr.today

Adapt: keep logo-assemble-lockup's mark built from its own parts into a held lockup; the parts are the wordmark's own letters emerging from behind the semicolon.
Scene 1 (0.0–0.8s): sun ground; the semicolon alone, centred, exactly as frame 1 opened. Settles from the zoom-through and is still by 0.5s.
Scene 2 (0.8–1.6s): A and I slide out to the left from behind the semicolon, D and R to the right (outlined paths, logo ink), 3 frames apart, horizontal blur that clears as they land; as they travel the whole wordmark scales down to lockup size (~20% of frame height) and rises to the upper-middle. Locked at 1.4s with the impact.
Scene 3 (1.6–3.0s): under the wordmark, display face, ink: "What's happening in AI today?" arrives per word on half-beats from 1.75s (`dynamic-content-sequencing`), complete at 2.5s. Below it at 2.75s, body face with wide tracking: "aidr.today". Centered stack, three lines, clear hierarchy by size.
Scene 4 (3.0–4.0s): hold — the ending. Nothing moves but the root push.

