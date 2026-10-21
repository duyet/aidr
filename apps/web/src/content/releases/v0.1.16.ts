import type { Release } from "../../lib/releases/types";

export const release: Release = {
  version: "0.1.16",
  date: "2026-10-22",
  from: "2026-10-20",
  to: "2026-10-22",
  compare: { base: "web-v0.1.15", head: "web-v0.1.16" },
  title: {
    en: "One email, every story",
    vi: "Một email, đủ mọi tin",
  },
  intro: {
    en: "You get one email a day, never two. Telegram shows every story on short days, the day card stays readable, and Vietnamese text gets a spelling check before it goes out. The news run that reads sources every 30 minutes also fails less often.",
    vi: "Mỗi ngày bạn nhận đúng một email, không bao giờ hai. Telegram hiện đủ mọi tin vào những ngày ít tin, ảnh tóm tắt luôn dễ đọc, và bản tiếng Việt được kiểm tra chính tả trước khi gửi đi. Quy trình đọc nguồn tin mỗi 30 phút cũng ít lỗi hơn.",
  },
  stats: [
    { value: "55", label: { en: "changes", vi: "thay đổi" } },
    { value: "33", label: { en: "fixes", vi: "bản sửa lỗi" } },
    {
      value: "4",
      label: { en: "email paths checked", vi: "luồng email được kiểm tra" },
    },
  ],
  cover: {
    src: "/releases/v0.1.16/cover.webp",
    width: 1440,
    height: 900,
    alt: {
      en: "The aidr.today homepage for Thursday, Oct 22, 2026, with the yellow AI;DR digest with eight numbered stories above the day's ranked list.",
      vi: "Trang chủ aidr.today ngày thứ Năm, 22/10/2026, với phần AI;DR màu vàng với tám tin đánh số, phía trên danh sách tin xếp hạng trong ngày.",
    },
  },
  highlights: [
    {
      label: { en: "One email, never two", vi: "Một email, không bao giờ hai" },
      text: {
        en: "Before AI;DR sends the daily digest, a welcome note or a campaign, it now marks that email as taken. If two runs start at once, only one sends, and a reader gets each email once.",
        vi: "Trước khi gửi bản tin hằng ngày, thư chào mừng hay thư chiến dịch, AI;DR giờ đánh dấu email đó là đã nhận gửi. Nếu hai lượt chạy cùng lúc, chỉ một lượt gửi, nên mỗi người đọc chỉ nhận mỗi email một lần.",
      },
      href: "/subscribe",
    },
    {
      label: { en: "Every story on Telegram", vi: "Đủ mọi tin trên Telegram" },
      text: {
        en: "On days with four or five stories, the Telegram post now lists all of them instead of cutting some. The Vietnamese channel also turns down fewer good posts.",
        vi: "Vào những ngày có bốn hoặc năm tin, bài đăng Telegram giờ liệt kê đủ cả, không bỏ bớt tin nào. Kênh tiếng Việt cũng ít từ chối nhầm những bài đăng tốt hơn.",
      },
      href: "https://t.me/aidr_today",
    },
    {
      label: { en: "A day card you can read", vi: "Ảnh tóm tắt dễ đọc" },
      text: {
        en: "Headlines on the day card never shrink below 23 px. When the tiles don't fit, they move into rows, so a long headline no longer turns into tiny text.",
        vi: "Tiêu đề trên ảnh tóm tắt không bao giờ nhỏ hơn 23 px. Khi các ô không vừa, chúng chuyển thành hàng, nên tiêu đề dài không còn bị thu thành chữ li ti.",
      },
      image: {
        src: "/releases/v0.1.16/day-card.webp",
        width: 1200,
        height: 630,
        alt: {
          en: "The day card for Wednesday, Oct 21, 2026, with the top story and a large photo on the left, two tiles and three rows on the right.",
          vi: "Ảnh tóm tắt ngày thứ Tư, 21/10/2026, với tin đầu và ảnh lớn bên trái, hai ô và ba hàng tin bên phải.",
        },
      },
      href: "/",
    },
    {
      label: {
        en: "Vietnamese spelling check",
        vi: "Kiểm tra chính tả tiếng Việt",
      },
      text: {
        en: "Each Vietnamese translation is checked for syllables that no Vietnamese word uses, which is how a broken translation shows. Older stories were checked again the same way. The check catches broken words, not every awkward sentence.",
        vi: "Mỗi bản dịch tiếng Việt được kiểm tra để tìm những âm tiết không có trong bất kỳ từ tiếng Việt nào, dấu hiệu của một bản dịch hỏng. Các tin cũ cũng được kiểm tra lại theo cách này. Bước kiểm tra bắt được từ hỏng, chưa bắt được mọi câu vụng.",
      },
      href: "/?lang=vi",
    },
    {
      label: { en: "A steadier news run", vi: "Lấy tin ổn định hơn" },
      text: {
        en: "Every 30 minutes AI;DR reads its sources. Now it skips a source that fails the same way every time instead of retrying it, keeps each run small enough to save in one go, and closes a run that could not start. When the HuggingNews feed breaks, it reads that site's sitemap instead.",
        vi: "Cứ 30 phút AI;DR đọc các nguồn tin một lần. Giờ nó bỏ qua nguồn nào lỗi theo cùng một kiểu thay vì thử lại mãi, giữ mỗi lượt đủ nhỏ để lưu một lần, và đóng lượt chạy không khởi động được. Khi nguồn HuggingNews lỗi, nó đọc sitemap của trang đó thay thế.",
      },
      image: {
        src: "/releases/v0.1.16/pipeline.webp",
        width: 1040,
        height: 420,
        alt: {
          en: "The Pipeline page shows today's runs and the last run marked Healthy.",
          vi: "Trang Dữ liệu hiện các lượt chạy hôm nay và lượt gần nhất ở trạng thái Healthy.",
        },
      },
      href: "/data",
    },
    {
      label: {
        en: "Better daily videos, with a score",
        vi: "Video hằng ngày tốt hơn, có chấm điểm",
      },
      text: {
        en: "The daily video speaks at a calmer pace, its cover shows the real headline, and long headlines stay on two lines. Every video, card and post is now scored against a written checklist before it counts as done.",
        vi: "Video hằng ngày đọc với nhịp chậm rãi hơn, ảnh bìa hiện đúng tiêu đề thật, và tiêu đề dài gói gọn trong hai dòng. Mỗi video, ảnh tóm tắt và bài đăng giờ được chấm điểm theo một bảng tiêu chí trước khi xem là xong.",
      },
      href: "https://www.youtube.com/channel/UCGDB5uD8znydgMg2XLOj04w",
    },
  ],
  changes: [
    {
      kind: "feature",
      scope: "telegram",
      text: {
        en: "Show every story on days with four or five stories.",
        vi: "Hiện đủ mọi tin vào những ngày có bốn hoặc năm tin.",
      },
      commit: "315c06a",
      pr: 952,
    },
    {
      kind: "feature",
      scope: "video",
      text: {
        en: "The daily video speaks at a calmer pace and its cover shows the story's real headline and picture.",
        vi: "Video hằng ngày đọc nhịp chậm rãi hơn, ảnh bìa hiện đúng tiêu đề và hình của tin.",
      },
      commit: "598cdf8",
      pr: 971,
    },
    {
      kind: "feature",
      scope: "video",
      text: {
        en: "Every video, card and post is scored against a written checklist.",
        vi: "Mỗi video, ảnh tóm tắt và bài đăng được chấm điểm theo bảng tiêu chí.",
      },
      commit: "62de0ce",
      pr: 1020,
    },
    {
      kind: "fix",
      scope: "mail",
      text: {
        en: "The daily digest, welcome mail and campaigns are each sent once, even when two runs overlap.",
        vi: "Bản tin hằng ngày, thư chào mừng và thư chiến dịch chỉ gửi một lần, kể cả khi hai lượt chạy trùng nhau.",
      },
      commit: "ea43e71",
      pr: 1005,
    },
    {
      kind: "fix",
      scope: "mail",
      text: {
        en: "A digest goes out only for a new day, never twice for the same date.",
        vi: "Bản tin chỉ gửi cho một ngày mới, không gửi hai lần cho cùng một ngày.",
      },
      commit: "966881e",
      pr: 1004,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Day card headlines stay at 23 px or larger; tiles move to rows when they don't fit.",
        vi: "Tiêu đề trên ảnh tóm tắt luôn từ 23 px trở lên; các ô chuyển thành hàng khi không vừa.",
      },
      commit: "8c835e2",
      pr: 1026,
    },
    {
      kind: "fix",
      scope: "translate",
      text: {
        en: "Vietnamese text is checked for syllables no Vietnamese word uses, and older stories were checked again.",
        vi: "Bản tiếng Việt được kiểm tra các âm tiết không có trong tiếng Việt, và các tin cũ đã được kiểm tra lại.",
      },
      commit: "dce9cad",
      pr: 959,
    },
    {
      kind: "fix",
      scope: "telegram",
      text: {
        en: "The Vietnamese Telegram channel turns down fewer good posts.",
        vi: "Kênh Telegram tiếng Việt ít từ chối nhầm bài đăng tốt hơn.",
      },
      commit: "670f63b",
      pr: 950,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "When duplicates merge into one story, a weak story is never picked as the main one, and one source can no longer pull unrelated stories together.",
        vi: "Khi các tin trùng được gộp lại, tin yếu không bao giờ được chọn làm tin chính, và một nguồn không còn kéo các tin không liên quan vào chung.",
      },
      commit: "cff91d6",
      pr: 998,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "The news run skips sources that always fail the same way, stays small enough to save, and closes runs that could not start.",
        vi: "Quy trình lấy tin bỏ qua nguồn luôn lỗi theo cùng một kiểu, giữ mỗi lượt đủ nhỏ để lưu, và đóng lượt không khởi động được.",
      },
      commit: "4a4681b",
      pr: 1000,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "HuggingNews falls back to its sitemap when its feed breaks.",
        vi: "HuggingNews chuyển sang đọc sitemap khi nguồn tin bị lỗi.",
      },
      commit: "3de9c88",
      pr: 1001,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "A video file is no longer picked as a story's picture.",
        vi: "Tệp video không còn bị chọn nhầm làm ảnh của tin.",
      },
      commit: "a5696f8",
      pr: 990,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "The privacy page lists every analytics service the site loads, with the cookies and events each one uses.",
        vi: "Trang quyền riêng tư liệt kê mọi dịch vụ phân tích mà trang web tải, kèm cookie và sự kiện của từng dịch vụ.",
      },
      commit: "e63d57b",
      pr: 955,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Notes on submitted stories have a length cap, and daily limits hold even when many requests arrive at once.",
        vi: "Ghi chú khi gửi tin có giới hạn độ dài, và giới hạn hằng ngày vẫn đúng kể cả khi nhiều yêu cầu đến cùng lúc.",
      },
      commit: "a46e0bf",
      pr: 999,
    },
    {
      kind: "fix",
      scope: "video",
      text: {
        en: "Long headlines in the vertical daily video stay on two lines and clear the captions.",
        vi: "Tiêu đề dài trong video dọc gói trong hai dòng và không đè lên phụ đề.",
      },
      commit: "d132129",
      pr: 1024,
    },
  ],
};
