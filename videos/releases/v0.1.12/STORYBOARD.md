# Storyboard: AI;DR v0.1.12

About 50s at 30fps (English; Vietnamese 49s), voiced. Each section is as long as its voice line needs, rounded up to the beat (0.5s at 120 BPM), at least 6s for a highlight. Each section slides out left over its last 0.3s and hard-cuts to the next. Inside a highlight: window and title at once, camera glides to the detail at +1.1s, highlight at +2.0s, rows at +2.4s.

On screen per frame is in `film.json` (scenes); the 9:16 version (`../v0.1.12-9x16/`) shows the same frames stacked: title, window, rows, caption.

## Voice-over

English times shown; the Vietnamese cut has its own lengths (the build prints them). Hosts alternate per row.

| Time (en) | Frame | English | Tiếng Việt |
|---|---|---|---|
| 0:00.0–0:05.5 | Title | AI DR, version zero point one point twelve. | AI DR, phiên bản không chấm một chấm mười hai. |
| 0:05.5–0:12.0 | 01 Each date, one address | Every day now gets its own page: that day's digest, and every story, ranked. | Giờ mỗi ngày đều có trang riêng: bản tin của ngày đó, và toàn bộ tin, xếp theo thứ hạng. |
| 0:12.0–0:20.0 | 02 One card sums up the day | One card sums up the day's top six stories. It's what leads the email and the Telegram post. | Một ảnh tóm gọn sáu tin nổi bật trong ngày, mở đầu cả email lẫn bài đăng Telegram. |
| 0:20.0–0:26.0 | 03 Vote stories up or down | If you're signed in, you can vote a story up or down, and the tally moves its rank. | Đăng nhập để bình chọn lên hoặc xuống, và tổng phiếu sẽ đổi thứ hạng của tin. |
| 0:26.0–0:32.5 | 04 See why a story ranks | Open any story to see why it ranks: its score, its outlets, and when it went out. | Mở một tin để xem vì sao nó đứng ở đó: điểm số, số nguồn, và lúc được đăng. |
| 0:32.5–0:39.0 | 05 Better Vietnamese | Vietnamese gets checked by translating it back, and tech terms stay in English. | Tiếng Việt được kiểm tra bằng cách dịch ngược, còn thuật ngữ kỹ thuật giữ tiếng Anh. |
| 0:39.0–0:45.5 | In numbers | That's two hundred thirty commits, seventeen new sources, and a fresh run every thirty minutes. | Hai trăm ba mươi commit, thêm mười bảy nguồn, và ba mươi phút cập nhật một lần. |
| 0:45.5–0:50.0 | Lockup | Read it at AI DR dot today. | Đọc ngay tại AI DR chấm today. |

## Motion

`../scripts/motion.js`, following `aidr-motion-designer`: parking ease (k 0.12–0.19) on every arrival, one linear root push per section (2.2–3%), rows staggered 3 frames, text holds from landing until the section leaves, horizontal blur only on horizontal moves.

## Sound

Placed in `../scripts/build.mjs` (`hits`) so each effect's peak lands on its visual hit: pop on the semicolon, short whoosh on the wordmark opening, soft impact on the version, a whoosh as each window arrives, a click as each marker sweep ends, a short whoosh on the camera glide, a click as each highlight appears, a soft impact under the closing logo.
