# Storyboard: AI;DR v0.1.16

44.5 s at 30 fps (English, 45.5 s Vietnamese). The title says one line and the close runs 3.5 s so the film stays near 45 s. Each section is as long as its voice line needs, rounded up to the 0.5 s beat (News Theme, 120 BPM). Paper `#F7F7F5` ground except the title and close; one yellow accent per frame (the title marker and the ring on the active machine part, same accent); EB Garamond headlines, Source Sans 3 labels, monospace tags. One linear root push per shot (2.5–4 %).

Layout 16:9: header (number, label, Garamond title with a marker) top left on a paper band; the machine framed in the left region (0–1010, y 280–940); the capture window right (1010–1860, y 96–916); caption chip bottom centre (y 960). 9:16: header y 230–490, machine y 470–990, window y 1000–1500, caption y 1530, all inside x 60–960 / y 200–1580.

| # | Time (en) | Voice (host) | Picture | Sound |
|---|---|---|---|---|
| Title | 0–5 | "This is AI DR." (Kristen) | Yellow. Logo tile and "v0.1.16" land at 0.1, "One email, every story" at 0.62, dates at 0.9. Cover still at 3.0. At 4.6 the yellow splits like a hatch onto the whole machine. | impact on the lockup, pop on the headline, cinematic whoosh on the hatch |
| 01 Ingest | 5–10.5 | "Every thirty minutes, AI DR reads its sources and skips any that keep failing." (Alex) | Camera flies to the fetch station. On "thirty" the clock needle sweeps half a turn and the ring lands on the dial, tag "48 runs a day". Three items ride the belt; on "skips" the middle one stops and greys, tag "no endless retries". Window: live `/data` Pipeline. | whoosh on the window, click per tag |
| 02 VI check | 10.5–16.5 | "Vietnamese text is checked for syllables no Vietnamese word uses. Older stories too." (Tyler Cruz) | Camera to the TL;DR press. On "syllables" the ram stamps and a "VI" plate slides to the front inside the ring, tag "before it goes out"; on "Older" tag "stored rows re-run". Window: `/?lang=vi`. | whoosh on the move, click per tag |
| 03 Day card | 16.5–22.5 | "Day card headlines never go below twenty-three pixels. Crowded tiles become rows." (Ivanna) | Same press; on "twenty" the ram stamps an "Aa" plate, tag "long headlines too"; on "rows" tag "2 tiles + 3 rows". Window cut to the day card of 21 Oct (its own yellow; no title marker in this frame). | click per tag |
| 04 Email | 22.5–29 | "Before any email goes out, it is claimed first. If two runs overlap, only one sends." (Allison) | Camera to the dispatch manifold, email port in the ring. On "claimed" one message leaves the port, tag "digest · welcome · campaign"; on "only" a second copy comes in and greys out, tag "1 reader, 1 copy". Window: the email preview. | click per tag |
| 05 RSS | 29–34 | "You can now follow AI DR in any RSS reader." (Kristen) | Camera to the web port, ring on it. On "follow" tag "RSS · EN + VI"; on "reader" three yellow RSS chips leave the port one after another, tag "Feedly · Inoreader · NewsBlur". Window: live `/subscribe?tab=rss`, the English and Vietnamese feed cards. | click per tag |
| 06 Telegram | 34–39 | "And on four and five story days, Telegram lists every story." (Alex) | Telegram port in the ring; on "four" tag "used to cut some"; on "every" five numbered messages leave one after another, tag "21 Oct: 6 of 6". Window: Telegram digest of 21 Oct, every story listed. | click on the tag |
| 07 Share card | 39–44 | "Share a story, and its photo now fills half the card." (Tyler Cruz) | Same press; on "Share" tag "was a small inset" and the window shows the old card; on "photo" the ram stamps again, the plate turns into the new card, the window cuts over in 0.2 s, the "56%" marker draws, tag "edge to edge". Title "Now 56% of the card". | click per tag |
| Close | 44–48 | "The release notes list every change." (Ivanna) | Yellow rises over the machine; tile lands, "82 changes · 45 fixes", "aidr.today/release/v0.1.16". | cinematic whoosh, impact on the tile, pop on the address |

Scene titles say a fact the voice does not: "Feed down, sitemap read", "Flags broken translations", "No more tiny text", "4 email paths, sent once", "Or just aidr.today/feed", "Short days, full post", "Now 56% of the card".

Cover (each cut): the share card scene's frame at the root's `data-cover-at`, with the hook "Photos fill 56%" and "of every story share card" over the machine side; `render.sh` shows `#cover` and hides the captions for the still.

Vietnamese: same beats and pictures, its own lengths (the build prints them), hosts from the Vietnamese cast.

## Chapters (YouTube, each at least 10 s)

0:00 News run and Vietnamese check · 0:14 Day card and one email · 0:26 RSS, Telegram and share cards (same in vi)
