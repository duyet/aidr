# Storyboard: AI;DR v0.1.13

About 42s at 30fps (English; Vietnamese 40.5s), voiced. Each section is as long as its voice line needs, rounded up to the beat (0.5s at 120 BPM), at least 6s for a highlight. Each section slides out left over its last 0.3s and hard-cuts to the next. Inside a highlight: window and title at once, camera glides to the detail at +1.1s, highlight at +2.0s, rows at +2.1s.

On screen per frame is in `film.json` (scenes); the 9:16 version (`../v0.1.13-9x16/`) shows the same frames stacked: title, window, rows, caption.

## Voice-over

English times shown; the Vietnamese cut has its own lengths (the build prints them). Hosts alternate per row.

| Time (en) | Frame | English | Tiếng Việt |
|---|---|---|---|
| 0:00.0–0:05.5 | Title | AI DR, version zero point one point thirteen. | AI DR, phiên bản không chấm một chấm mười ba. |
| 0:05.5–0:12.5 | 01 Five steps of density | Pick how dense the page feels: five steps, from dense to spacious, starting in the middle. | Chọn độ dày của trang: năm mức, từ dày đến thoáng, mặc định ở giữa. |
| 0:12.5–0:18.5 | 02 Rows that line up | Story rows line up now. Votes, category, and time each sit in their own column. | Các dòng tin giờ thẳng hàng: phiếu bầu, chuyên mục và thời gian, mỗi thứ một cột. |
| 0:18.5–0:24.5 | 03 Image or text, one tap | One tap switches the digest between the day card and the text list. | Một chạm để chuyển bản tin giữa ảnh tóm tắt và danh sách chữ. |
| 0:24.5–0:31.0 | 04 Every release, its own page | And every release has its own page, with highlights, the full changelog, and a film. | Và mỗi bản phát hành có trang riêng, với điểm nổi bật, nhật ký thay đổi, và một video. |
| 0:31.0–0:37.5 | In numbers | Five density steps, and four films for every release. | Năm mức mật độ, và bốn video cho mỗi bản phát hành. |
| 0:37.5–0:42.0 | Lockup | Read it at AI DR dot today. | Đọc ngay tại AI DR chấm today. |

## Motion and sound

Same as v0.1.12: `../scripts/motion.js` and the `hits` in `../scripts/build.mjs`.
