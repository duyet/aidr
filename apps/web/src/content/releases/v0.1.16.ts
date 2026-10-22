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
    en: "You get one email a day, never two, and you can now follow AI;DR in any RSS reader. Telegram shows every story on short days, the day card stays readable, and Vietnamese text gets a spelling check before it goes out. The news run that reads sources every 30 minutes also fails less often.",
    vi: "Mỗi ngày bạn chỉ nhận đúng một email, và giờ có thể theo dõi AI;DR bằng trình đọc RSS nào cũng được. Ngày ít tin, Telegram vẫn đăng đủ mọi tin. Ảnh tóm tắt dễ đọc hơn, còn bản tiếng Việt được soát chính tả trước khi gửi. Lượt lấy tin chạy mỗi 30 phút cũng ít lỗi hơn.",
  },
  stats: [
    { value: "57", label: { en: "changes", vi: "thay đổi" } },
    { value: "33", label: { en: "fixes", vi: "bản sửa lỗi" } },
    {
      value: "4",
      label: { en: "email paths checked", vi: "luồng email đã kiểm tra" },
    },
  ],
  cover: {
    src: "/releases/v0.1.16/cover.webp",
    width: 1440,
    height: 900,
    alt: {
      en: "The aidr.today homepage for Thursday, Oct 22, 2026, with the yellow AI;DR digest with eight numbered stories above the day's ranked list.",
      vi: "Trang chủ aidr.today ngày thứ Năm 22/10/2026. Khung AI;DR màu vàng có tám tin đánh số, nằm trên danh sách tin xếp hạng trong ngày.",
    },
  },
  highlights: [
    {
      label: { en: "One email, never two", vi: "Một email, không gửi trùng" },
      text: {
        en: "Before AI;DR sends the daily digest, a welcome note or a campaign, it now marks that email as taken. If two runs start at once, only one sends, and a reader gets each email once.",
        vi: "Trước khi gửi bản tin hằng ngày, thư chào mừng hay thư chiến dịch, AI;DR giờ đánh dấu trước để giữ email đó cho đúng một lượt gửi. Hai lượt chạy cùng lúc thì chỉ một lượt gửi, nên mỗi email chỉ đến tay người đọc một lần.",
      },
      href: "/subscribe",
    },
    {
      label: { en: "Follow by RSS", vi: "Theo dõi qua RSS" },
      text: {
        en: "RSS is now a way to subscribe, next to email, Telegram and Facebook. Open the RSS tab, copy the English or Vietnamese feed, or add it to Feedly, Inoreader or NewsBlur in one click. The short address aidr.today/feed works too.",
        vi: "Ngoài email, Telegram và Facebook, giờ bạn có thể đăng ký qua RSS. Mở thẻ RSS, chép feed tiếng Anh hoặc tiếng Việt, hay bấm một lần để thêm vào Feedly, Inoreader hoặc NewsBlur. Địa chỉ ngắn aidr.today/feed cũng dùng được.",
      },
      href: "/subscribe?tab=rss",
    },
    {
      label: { en: "Every story on Telegram", vi: "Đủ mọi tin trên Telegram" },
      text: {
        en: "On days with four or five stories, the Telegram post now lists all of them instead of cutting some. Its headers are now plain, like the email, with no emoji in front. The Vietnamese channel also turns down fewer good posts.",
        vi: "Ngày có bốn hay năm tin, bài đăng Telegram giờ liệt kê đủ cả, không cắt bớt. Tiêu đề để trơn như email, không còn emoji đứng đầu. Kênh tiếng Việt cũng ít loại nhầm bài tốt hơn.",
      },
      href: "https://t.me/aidr_today",
    },
    {
      label: { en: "A day card you can read", vi: "Ảnh tóm tắt dễ đọc" },
      text: {
        en: "Headlines on the day card never shrink below 23 px. When the tiles don't fit, they move into rows, so a long headline no longer turns into tiny text.",
        vi: "Tiêu đề trên ảnh tóm tắt luôn từ 23 px trở lên. Ô nào không vừa sẽ chuyển xuống thành hàng, nên tiêu đề dài không còn bị thu thành chữ li ti.",
      },
      image: {
        src: "/releases/v0.1.16/day-card.webp",
        width: 1200,
        height: 630,
        alt: {
          en: "The day card for Wednesday, Oct 21, 2026, with the top story and a large photo on the left, two tiles and three rows on the right.",
          vi: "Ảnh tóm tắt ngày thứ Tư 21/10/2026. Bên trái là tin đầu kèm ảnh lớn, bên phải là hai ô và ba hàng tin.",
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
        vi: "AI;DR giờ soát từng bản dịch tiếng Việt để tìm những âm tiết không từ tiếng Việt nào dùng, vì bản dịch hỏng thường lộ ra ở đó. Tin cũ cũng đã soát lại theo cách này. Bước soát bắt được từ hỏng, chưa bắt được mọi câu vụng.",
      },
      href: "/?lang=vi",
    },
    {
      label: { en: "A steadier news run", vi: "Lấy tin ổn định hơn" },
      text: {
        en: "Every 30 minutes AI;DR reads its sources. Now it skips a source that fails the same way every time instead of retrying it, keeps each run small enough to save in one go, and closes a run that could not start. When the HuggingNews feed breaks, it reads that site's sitemap instead.",
        vi: "Cứ 30 phút AI;DR đọc các nguồn tin một lần. Giờ AI;DR bỏ qua nguồn nào lần nào cũng lỗi y một kiểu, thay vì thử lại. Mỗi lượt giữ đủ nhỏ để lưu một lần, còn lượt nào không khởi động được thì đóng lại luôn. Feed HuggingNews hỏng thì AI;DR đọc sitemap của trang đó.",
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
        vi: "Video hằng ngày đọc chậm rãi hơn, ảnh bìa hiện đúng tiêu đề thật, tiêu đề dài gói trong hai dòng. Video, ảnh tóm tắt hay bài đăng nào cũng phải qua chấm điểm theo bảng tiêu chí viết sẵn rồi mới tính là xong.",
      },
      href: "https://www.youtube.com/channel/UCGDB5uD8znydgMg2XLOj04w",
    },
  ],
  changes: [
    {
      kind: "feature",
      scope: "subscribe",
      text: {
        en: "Subscribe by RSS. Copy the English or Vietnamese feed, or open it in Feedly, Inoreader or NewsBlur.",
        vi: "Đăng ký qua RSS. Chép feed tiếng Anh hoặc tiếng Việt, hay mở bằng Feedly, Inoreader, NewsBlur.",
      },
      commit: "cfc1bd5",
      pr: 1028,
    },
    {
      kind: "feature",
      scope: "telegram",
      text: {
        en: "Telegram headers and story titles are plain, like the email, with no emoji in front.",
        vi: "Tiêu đề bản tin và tiêu đề tin trên Telegram để trơn như email, không còn emoji đứng đầu.",
      },
      commit: "e47d93d",
      pr: 948,
    },
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
        vi: "Video hằng ngày đọc chậm rãi hơn, ảnh bìa hiện đúng tiêu đề và hình của tin.",
      },
      commit: "598cdf8",
      pr: 971,
    },
    {
      kind: "feature",
      scope: "video",
      text: {
        en: "Every video, card and post is scored against a written checklist.",
        vi: "Video, ảnh tóm tắt và bài đăng đều qua chấm điểm theo bảng tiêu chí viết sẵn.",
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
        vi: "Bản tin chỉ gửi khi sang ngày mới, mỗi ngày đúng một lần.",
      },
      commit: "966881e",
      pr: 1004,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Day card headlines stay at 23 px or larger. Tiles move to rows when they don't fit.",
        vi: "Tiêu đề trên ảnh tóm tắt luôn từ 23 px trở lên. Ô nào không vừa thì chuyển thành hàng.",
      },
      commit: "8c835e2",
      pr: 1026,
    },
    {
      kind: "fix",
      scope: "translate",
      text: {
        en: "Vietnamese text is checked for syllables no Vietnamese word uses, and older stories were checked again.",
        vi: "AI;DR soát bản tiếng Việt để tìm âm tiết không từ tiếng Việt nào dùng, và đã soát lại cả tin cũ.",
      },
      commit: "dce9cad",
      pr: 959,
    },
    {
      kind: "fix",
      scope: "telegram",
      text: {
        en: "The Vietnamese Telegram channel turns down fewer good posts.",
        vi: "Kênh Telegram tiếng Việt ít loại nhầm bài tốt hơn.",
      },
      commit: "670f63b",
      pr: 950,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "When duplicates merge into one story, a weak story is never picked as the main one, and one source can no longer pull unrelated stories together.",
        vi: "Khi gộp các tin trùng, tin yếu không còn được chọn làm tin chính, và một nguồn không còn kéo những tin chẳng liên quan vào chung một chỗ.",
      },
      commit: "cff91d6",
      pr: 998,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "The news run skips sources that always fail the same way, stays small enough to save, and closes runs that could not start.",
        vi: "Lượt lấy tin bỏ qua nguồn lần nào cũng lỗi y một kiểu, giữ mỗi lượt đủ nhỏ để lưu, và đóng lượt không khởi động được.",
      },
      commit: "4a4681b",
      pr: 1000,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "HuggingNews falls back to its sitemap when its feed breaks.",
        vi: "Feed HuggingNews hỏng thì chuyển sang đọc sitemap.",
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
        vi: "Trang quyền riêng tư liệt kê mọi dịch vụ phân tích mà trang tải về, kèm cookie và sự kiện từng dịch vụ dùng.",
      },
      commit: "e63d57b",
      pr: 955,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Notes on submitted stories have a length cap, and daily limits hold even when many requests arrive at once.",
        vi: "Ghi chú kèm tin gửi có giới hạn độ dài, còn hạn mức mỗi ngày vẫn giữ đúng khi nhiều yêu cầu đến cùng lúc.",
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
