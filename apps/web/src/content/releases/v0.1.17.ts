import type { Release } from "../../lib/releases/types";

export const release: Release = {
  version: "0.1.17",
  date: "2026-10-27",
  from: "2026-10-24",
  to: "2026-10-27",
  compare: { base: "web-v0.1.16", head: "web-v0.1.17" },
  title: {
    en: "Story links open on the first tap",
    vi: "Mở link tin là vào ngay",
  },
  intro: {
    en: "If you had signed in before, a story link from Telegram could get stuck in a redirect loop. It now opens on the first tap. Story pages also load with fewer database reads, and /release now lists every change to how stories are picked.",
    vi: "Nếu bạn từng đăng nhập, link tin mở từ Telegram có thể bị chuyển hướng vòng vòng không dừng. Giờ bấm một lần là mở được. Trang tin cũng đọc cơ sở dữ liệu ít hơn, còn /release giờ ghi lại mọi thay đổi về cách chọn tin.",
  },
  stats: [
    { value: "8", label: { en: "changes", vi: "thay đổi" } },
    { value: "1", label: { en: "fix", vi: "bản sửa lỗi" } },
    {
      value: "5,961 → 33",
      label: { en: "rows read per story", vi: "dòng đọc mỗi tin" },
    },
  ],
  cover: {
    src: "/releases/v0.1.17/cover.webp",
    width: 1440,
    height: 900,
    alt: {
      en: "The aidr.today homepage for Tuesday, Oct 27, 2026, with the yellow AI;DR digest of eight numbered stories above the day's ranked list.",
      vi: "Trang chủ aidr.today ngày thứ Ba 27/10/2026. Khung AI;DR màu vàng có tám tin đánh số, nằm trên danh sách tin xếp hạng trong ngày.",
    },
  },
  highlights: [
    {
      label: {
        en: "Telegram links open again",
        vi: "Link từ Telegram mở lại được",
      },
      text: {
        en: "Readers who had signed in before could tap a story in Telegram and get a 'too many redirects' error. Story pages no longer run the sign-in check, so the link opens on the first try. You stay signed in.",
        vi: "Người từng đăng nhập bấm vào một tin trên Telegram có thể gặp lỗi 'quá nhiều lần chuyển hướng'. Giờ trang tin không chạy bước kiểm tra đăng nhập nữa, nên bấm là mở được ngay. Bạn vẫn giữ trạng thái đăng nhập.",
      },
      href: "https://t.me/aidr_today",
    },
    {
      label: { en: "Faster story pages", vi: "Trang tin tải nhanh hơn" },
      text: {
        en: "Opening a story used to read about 6,000 rows from the database. It now reads 33, and the story's edit history comes back in the same request instead of a second one.",
        vi: "Trước đây mỗi lần mở một tin phải đọc khoảng 6.000 dòng dữ liệu. Giờ chỉ còn 33 dòng, và lịch sử sửa tin được lấy luôn trong cùng một lượt đọc, không phải đọc thêm lần thứ hai.",
      },
      href: "/",
    },
    {
      label: {
        en: "How stories are picked, in the open",
        vi: "Công khai cách chọn tin",
      },
      text: {
        en: "/release has a section on how stories are picked. Each change to ranking, prompts or the models that write and translate stories gets a dated entry in English and Vietnamese.",
        vi: "Trang /release có thêm mục về cách AI;DR chọn tin. Mỗi thay đổi về xếp hạng, prompt hay model viết và dịch tin đều có một mục ghi ngày, bằng cả tiếng Anh lẫn tiếng Việt.",
      },
      href: "/release",
    },
    {
      label: {
        en: "Checking if top stories are really new",
        vi: "Kiểm tra tin đầu có thật sự mới",
      },
      text: {
        en: "Each run now checks the 10 top stories of the last 48 hours: is the article new or an old one shared again, and how many outlets cover it. For now it only records the result. The ranking does not change yet.",
        vi: "Mỗi lượt chạy giờ kiểm tra 10 tin đầu trong 48 giờ qua: bài viết mới thật hay là bài cũ được chia sẻ lại, và có bao nhiêu trang tin cùng đưa. Hiện bước này chỉ ghi lại kết quả, chưa đổi thứ tự tin.",
      },
      href: "/release",
    },
    {
      label: {
        en: "New-tab extension: closer to the site",
        vi: "Tiện ích new tab: giống trang web hơn",
      },
      text: {
        en: "The Chrome new-tab extension now uses the site's category colors and rounded shapes. It remembers how many AI;DR items you want (8, 12 or 16) in every new tab, and the story dialog shows the story's link with Copy and Open buttons. The update is not on the Chrome Web Store yet.",
        vi: "Tiện ích new tab cho Chrome giờ dùng màu chủ đề và kiểu bo góc giống trang web. Tiện ích nhớ số tin AI;DR bạn chọn (8, 12 hay 16) cho mọi tab mới, và hộp thoại tin hiện link của tin kèm nút Sao chép và Mở. Bản cập nhật này chưa lên Chrome Web Store.",
      },
      href: "https://github.com/duyet/aidr/tree/master/apps/extension",
    },
  ],
  changes: [
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Signed-in readers no longer hit a redirect loop when they open a story link from Telegram.",
        vi: "Người đã đăng nhập không còn bị chuyển hướng vòng vòng khi mở link tin từ Telegram.",
      },
      commit: "3ac2a8f",
      pr: 1078,
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "A story page reads 33 rows from the database instead of about 6,000.",
        vi: "Trang tin đọc 33 dòng dữ liệu thay vì khoảng 6.000 dòng.",
      },
      commit: "e17066f",
      pr: 1072,
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "A story's edit history loads in the same database request as the story.",
        vi: "Lịch sử sửa tin được tải trong cùng lượt đọc dữ liệu với tin.",
      },
      commit: "ec6810c",
      pr: 1073,
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "Search engines no longer crawl the sign-in and sign-up pages.",
        vi: "Công cụ tìm kiếm không còn quét trang đăng nhập và đăng ký.",
      },
      commit: "4d75f35",
      pr: 1069,
    },
    {
      kind: "feature",
      scope: "ingest",
      text: {
        en: "Each run checks whether the top stories are new and widely covered, and records the result without changing the ranking.",
        vi: "Mỗi lượt chạy kiểm tra tin đầu có mới và được nhiều nơi đưa không, rồi ghi lại kết quả mà không đổi thứ hạng.",
      },
      commit: "afa8512",
      pr: 1075,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "/release lists every change to ranking, prompts and models, with a date, in English and Vietnamese.",
        vi: "/release ghi lại mọi thay đổi về xếp hạng, prompt và model, có ghi ngày, bằng tiếng Anh và tiếng Việt.",
      },
      commit: "5ee9fe0",
      pr: 1074,
    },
    {
      kind: "feature",
      scope: "extension",
      text: {
        en: "The new-tab extension keeps your AI;DR row count in every tab, and the story dialog shows the link with Copy and Open (extension 0.1.26).",
        vi: "Tiện ích new tab giữ số tin AI;DR bạn chọn ở mọi tab, còn hộp thoại tin hiện link kèm nút Sao chép và Mở (tiện ích 0.1.26).",
      },
      commit: "73937e8",
      pr: 1068,
    },
    {
      kind: "feature",
      scope: "extension",
      text: {
        en: "The new-tab extension uses the site's category colors and rounded shapes (extension 0.1.25).",
        vi: "Tiện ích new tab dùng màu chủ đề và kiểu bo góc của trang web (tiện ích 0.1.25).",
      },
      commit: "1db2c4a",
      pr: 1060,
    },
  ],
};
