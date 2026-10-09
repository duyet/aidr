# Storyboard: AI;DR v0.1.0

About 56.5s at 30fps (English; Vietnamese 49.5s), voiced. Each section is as long as its voice line needs, rounded up to the beat (0.5s at 120 BPM): title at least 5.5s, highlights at least 6s. Each section slides out left over its last 0.3s and hard-cuts to the next. Inside a highlight: camera glides at +1.1s, highlight at +2.0s, rows at +2.1s. The frame table below is the first, unvoiced 58s cut (8s scenes); the frames are the same, only the times moved.

| Time | Frame | On screen |
|------|-------|-----------|
| 0:00–0:06 | Title | Semicolon lands, AI and DR open out of it, `v0.1.0` with a marker sweep; kicker "First public release", headline "AI;DR goes public at aidr.today", dates |
| 0:06–0:14 | 01 A page for every story | `aidr.today/15523a41` (capture `story`). Window slides in, camera glides to the detail at +1.5s, highlight at +2.65s, rows at +3.1s: Link: aidr.today/15523a41; Sources: Inline, under the summary; Share: A branded card with the photo |
| 0:14–0:22 | 02 Get it where you read | `aidr.today/subscribe?tab=telegram` (capture `telegram`). Window slides in, camera glides to the detail at +1.5s, highlight at +2.65s, rows at +3.1s: Telegram: @aidr_today and @aihomnay; Email: English and Vietnamese editions; Chrome: Today's AI;DR on every new tab |
| 0:22–0:30 | 03 Read it anywhere | `aidr.today/mcp` (capture `mcp`). Window slides in, camera glides to the detail at +1.5s, highlight at +2.65s, rows at +3.1s: RSS: aidr.today/feed.xml; MCP: No account, no key; Markdown: Every story, for agents |
| 0:30–0:38 | 04 More sources, fairer ranking | `aidr.today/data?tab=sources` (capture `sources`). Window slides in, camera glides to the detail at +1.5s, highlight at +2.65s, rows at +3.1s: Sources: From 3 to 25; Same story: Outlets merge into one row; Fair share: No source fills over a quarter |
| 0:38–0:46 | 05 The pipeline in the open | `aidr.today/data` (capture `data`). Window slides in, camera glides to the detail at +1.5s, highlight at +2.65s, rows at +3.1s: Runs: Every ingest, with its health; Models: Scoring, translation, digest; Tokens: Use per day, by task |
| 0:46–0:52 | In numbers | 332 commits, 98 features, 102 fixes, 25 news sources, up from 3; "Also new: an RSS feed in both languages, a Google News sitemap, and short story links." |
| 0:52–0:58 | Lockup | Logo tile, "Ranked AI news, in English and Vietnamese.", aidr.today with a marker, release notes URL |

## Voice-over

English times shown; the Vietnamese cut has its own lengths (the build prints them). Hosts alternate per row.

| Time (en) | Frame | English | Tiếng Việt |
|---|---|---|---|
| 0:00.0–0:06.0 | Title | AI DR, version zero point one point zero. Our first public release. | AI DR, phiên bản không chấm một chấm không. Bản phát hành công khai đầu tiên. |
| 0:06.0–0:14.0 | 01 A page for every story | Every story now has its own page, with a short link, its key sources, and a card that's made for sharing. | Mỗi tin giờ có một trang riêng, với đường dẫn ngắn, các nguồn chính, và thẻ chia sẻ kèm ảnh. |
| 0:14.0–0:22.0 | 02 Get it where you read | You can get the digest wherever you read: on Telegram in two languages, by email, or in every new Chrome tab. | Bạn nhận bản tin ở nơi bạn quen: Telegram hai ngôn ngữ, email, hay mỗi tab mới trên Chrome. |
| 0:22.0–0:30.5 | 03 Read it anywhere | And it reads anywhere. There's an RSS feed, and AI agents can pull the news over MCP, no account needed. | Và đọc được ở bất cứ đâu: có RSS, còn AI agent đọc tin qua MCP mà không cần tài khoản. |
| 0:30.5–0:40.5 | 04 More sources, fairer ranking | We went from three sources to twenty-five, and when many outlets cover a story, they merge into one row. | Số nguồn tăng từ ba lên hai mươi lăm, và nhiều trang cùng đưa một tin giờ gộp thành một dòng. |
| 0:40.5–0:47.5 | 05 The pipeline in the open | The data page shows the whole pipeline: every run, the models doing the work, and the tokens they use. | Trang Dữ liệu cho thấy toàn bộ quy trình: từng lượt chạy, các model làm việc, và lượng token. |
| 0:47.5–0:52.0 | In numbers | That's three hundred thirty-two commits in three weeks. | Ba trăm ba mươi hai commit, chỉ trong ba tuần. |
| 0:52.0–0:56.5 | Lockup | Read it at AI DR dot today. | Đọc ngay tại AI DR chấm today. |

## Motion

`../scripts/motion.js`, following `aidr-motion-designer`: parking ease (k 0.12–0.19) on every arrival, one linear root push per section (2.2–3%), rows staggered 3 frames, text holds from landing until the section leaves, horizontal blur only on horizontal moves.

## Sound

Placed in `../scripts/build.mjs` (`hits`) so each effect's peak lands on its visual hit: pop on the semicolon, short whoosh on the wordmark opening, soft impact on the version, a whoosh as each window arrives, a click as each marker sweep ends, a short whoosh on the camera glide, a click as each highlight appears, a soft impact under the closing logo.
