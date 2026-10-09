import type { Release } from "../../lib/releases/types";

export const release: Release = {
  version: "0.1.12",
  date: "2026-10-09",
  from: "2026-10-01",
  to: "2026-10-09",
  compare: { base: "web-v0.1.10", head: "web-v0.1.12" },
  title: {
    en: "Every day gets a page, and you get a vote",
    vi: "Mỗi ngày một trang, mỗi người một phiếu",
  },
  intro: {
    en: "Each day now has its own page and a shareable day card with its top six stories. You can vote stories up or down, see why a story ranks where it does, and send in stories from the web or by email. The pipeline runs every 30 minutes, reads 17 more sources, and checks Vietnamese more carefully.",
    vi: "Mỗi ngày giờ có trang riêng và một ảnh tóm tắt sáu tin nổi bật để chia sẻ. Bạn có thể bình chọn lên hoặc xuống cho từng tin, xem vì sao một tin đứng ở thứ hạng đó, và gửi tin qua web hoặc email. Hệ thống chạy 30 phút một lần, đọc thêm 17 nguồn, và kiểm tra tiếng Việt kỹ hơn.",
  },
  stats: [
    { value: "230", label: { en: "commits", vi: "commit" } },
    { value: "58", label: { en: "features", vi: "tính năng" } },
    { value: "109", label: { en: "fixes", vi: "bản sửa lỗi" } },
    {
      value: "+17",
      label: { en: "news sources (41 active)", vi: "nguồn tin (41 đang chạy)" },
    },
    {
      value: "30 min",
      label: { en: "between pipeline runs", vi: "giữa hai lượt cập nhật" },
    },
  ],
  youtubeId: "_9kg_U0BajE",
  cover: {
    src: "/releases/v0.1.12/day-page.webp",
    width: 1440,
    height: 900,
    alt: {
      en: "The day page for Thursday, Oct 8, 2026: the yellow day card with six top stories, the AI;DR digest beside it, and the ranked stories below.",
      vi: "Trang ngày thứ Năm, 8/10/2026: ảnh tóm tắt màu vàng với sáu tin nổi bật, AI;DR bên cạnh và danh sách tin xếp hạng bên dưới.",
    },
    caption: {
      en: "aidr.today/date/2026-10-08",
      vi: "aidr.today/date/2026-10-08",
    },
  },
  highlights: [
    {
      label: { en: "Day pages", vi: "Trang theo ngày" },
      text: {
        en: "Every day has a page at aidr.today/date/YYYY-MM-DD: that day's AI;DR, then every story from the day in ranked order, with links to the day before and after. Some days also carry a short video you can play on the page.",
        vi: "Mỗi ngày có trang riêng tại aidr.today/date/YYYY-MM-DD: AI;DR của ngày đó, bên dưới là toàn bộ tin trong ngày theo thứ hạng, kèm liên kết sang ngày trước và ngày sau. Một số ngày còn có video ngắn xem ngay trên trang.",
      },
      image: {
        src: "/releases/v0.1.12/day-page.webp",
        width: 1440,
        height: 900,
        alt: {
          en: "A day page with previous and next day buttons, the day card, the AI;DR list, and the day's stories.",
          vi: "Trang ngày với nút sang ngày trước và ngày sau, ảnh tóm tắt, danh sách AI;DR và các tin trong ngày.",
        },
      },
      href: "/date/2026-10-08",
    },
    {
      label: { en: "The day card", vi: "Ảnh tóm tắt trong ngày" },
      text: {
        en: "One image sums up the day: six top stories with their photos, in English or Vietnamese. It leads the email digest and the Telegram post, and shows when you share a day page.",
        vi: "Một ảnh tóm gọn cả ngày: sáu tin nổi bật kèm ảnh, bằng tiếng Anh hoặc tiếng Việt. Ảnh này mở đầu bản tin email và bài đăng Telegram, và hiện ra khi bạn chia sẻ trang ngày.",
      },
      image: {
        src: "/releases/v0.1.12/day-card.webp",
        width: 1200,
        height: 630,
        alt: {
          en: "The yellow AI;DR Daily card for Oct 8, 2026, a grid of six numbered stories with photos and categories.",
          vi: "Ảnh AI;DR Daily màu vàng ngày 8/10/2026, lưới sáu tin đánh số kèm ảnh và chủ đề.",
        },
      },
      href: "/date/2026-10-09",
    },
    {
      label: { en: "Vote on stories", vi: "Bình chọn cho tin" },
      text: {
        en: "Sign in to vote a story up or down. The tally moves its rank, so stories readers back are more likely to trend. Anyone can see the count.",
        vi: "Đăng nhập để bình chọn lên hoặc xuống cho từng tin. Tổng phiếu làm đổi thứ hạng, nên tin được nhiều người ủng hộ dễ nổi bật hơn. Ai cũng xem được số phiếu.",
      },
      image: {
        src: "/releases/v0.1.12/reader-votes.webp",
        width: 1080,
        height: 310,
        alt: {
          en: "Feed rows with up and down vote arrows and a count beside each headline.",
          vi: "Các dòng tin có mũi tên bình chọn lên, xuống và số phiếu cạnh tiêu đề.",
        },
      },
      href: "/",
    },
    {
      label: { en: "Why this ranks", vi: "Vì sao tin xếp hạng này" },
      text: {
        en: "Open a story and tap Why this ranks to see its rank for the day, score, importance, outlet count, and whether it went out on Telegram. Ranking now looks at a rolling 72-hour window, counts real corroboration and engagement, and caps each source family on the top lists.",
        vi: "Mở một tin và bấm Why this ranks để xem thứ hạng trong ngày, điểm số, mức độ quan trọng, số trang đưa tin, và tin đã lên Telegram hay chưa. Cách xếp hạng giờ xét trong 72 giờ gần nhất, tính theo số nguồn xác nhận và mức tương tác thật, và giới hạn mỗi nhóm nguồn trên các danh sách nổi bật.",
      },
      image: {
        src: "/releases/v0.1.12/why-this-ranks.webp",
        width: 1080,
        height: 740,
        alt: {
          en: "A story page with the Why this ranks panel open: rank 1 of 122, score 14.9, importance 7.88, and Telegram post times.",
          vi: "Trang tin với bảng Why this ranks đang mở: hạng 1 trên 122, điểm 14,9, độ quan trọng 7,88 và giờ đăng Telegram.",
        },
      },
      href: "/90b333df",
    },
    {
      label: { en: "Get AI;DR, rebuilt", vi: "Trang Nhận AI;DR làm mới" },
      text: {
        en: "Settings sit on the left and a live preview on the right, so the digest changes as you pick a language, a story count, or an image layout. Email signup now asks you to confirm your address first.",
        vi: "Phần cài đặt nằm bên trái, bản xem trước bên phải, để bạn thấy bản tin đổi ngay khi chọn ngôn ngữ, số tin hay kiểu ảnh. Đăng ký email giờ cần xác nhận địa chỉ trước.",
      },
      image: {
        src: "/releases/v0.1.12/email-preview.webp",
        width: 1080,
        height: 570,
        alt: {
          en: "The Email tab: the signup form with language, story count, and layout options beside a preview of the digest email.",
          vi: "Tab Email: form đăng ký với lựa chọn ngôn ngữ, số tin và bố cục, bên cạnh bản xem trước email.",
        },
      },
      href: "/subscribe?tab=email",
    },
    {
      label: {
        en: "Facebook and Contribute",
        vi: "Facebook và trang Đóng góp",
      },
      text: {
        en: "The English edition now posts to a Facebook Page, linked from the Get AI;DR menu. The new Contribute page collects story submissions and suggestions with a filterable history, and you can also send a story to submit@aidr.today.",
        vi: "Bản tiếng Anh giờ được đăng lên Fanpage Facebook, có liên kết trong menu Nhận AI;DR. Trang Contribute mới gom tin gửi lên và gợi ý sửa bản dịch, kèm lịch sử lọc được, và bạn cũng có thể gửi tin tới submit@aidr.today.",
      },
      image: {
        src: "/releases/v0.1.12/get-menu-facebook.webp",
        width: 680,
        height: 420,
        alt: {
          en: "The Get AI;DR menu with Facebook Page and Contribute entries.",
          vi: "Menu Nhận AI;DR có mục Facebook Page và Contribute.",
        },
      },
      href: "/contribute",
    },
    {
      label: { en: "Better Vietnamese", vi: "Tiếng Việt chuẩn hơn" },
      text: {
        en: "Translations are checked by translating them back, tech terms stay in English, and weak drafts get repaired. Accepted reader suggestions become rules for later translations, and each story shows a short history of its title and summary edits.",
        vi: "Bản dịch được kiểm tra bằng cách dịch ngược lại, thuật ngữ kỹ thuật giữ nguyên tiếng Anh, và bản nháp yếu được sửa lại. Gợi ý của bạn đọc khi được duyệt sẽ thành quy tắc cho các lần dịch sau, và mỗi tin có lịch sử ngắn các lần sửa tiêu đề và tóm tắt.",
      },
      image: {
        src: "/releases/v0.1.12/day-card-vi.webp",
        width: 1200,
        height: 630,
        alt: {
          en: "The Vietnamese day card for Oct 8, 2026, with every tile written in Vietnamese.",
          vi: "Ảnh tóm tắt tiếng Việt ngày 8/10/2026, mọi ô đều viết bằng tiếng Việt.",
        },
        caption: {
          en: "The Vietnamese day card only uses stories that have Vietnamese copy.",
          vi: "Ảnh tóm tắt tiếng Việt chỉ dùng những tin đã có bản tiếng Việt.",
        },
      },
      href: "/?lang=vi",
    },
    {
      label: {
        en: "Every 30 minutes, in plain view",
        vi: "30 phút một lần, ai cũng xem được",
      },
      text: {
        en: "The pipeline now collects news every 30 minutes. The Runs tab flags failed steps, draws each run as a clickable workflow, and lists every model call with its route and price.",
        vi: "Hệ thống giờ thu thập tin 30 phút một lần. Tab Runs đánh dấu bước bị lỗi, vẽ mỗi lượt chạy thành sơ đồ bấm được, và liệt kê từng lần gọi model kèm đường đi và chi phí.",
      },
      image: {
        src: "/releases/v0.1.12/data-runs.webp",
        width: 1080,
        height: 740,
        alt: {
          en: "The Runs tab on the Data page: a row of green run status tiles and a chart of run durations.",
          vi: "Tab Runs trên trang Dữ liệu: dãy ô trạng thái màu xanh và biểu đồ thời gian mỗi lượt chạy.",
        },
      },
      href: "/data?tab=runs",
    },
  ],
  changes: [
    // Day pages and the day card
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Day pages at /date/YYYY-MM-DD, with the day's video when there is one.",
        vi: "Trang theo ngày tại /date/YYYY-MM-DD, kèm video của ngày nếu có.",
      },
      commit: "2e54ef1",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Feed day headings link to their day page.",
        vi: "Tiêu đề ngày trên bảng tin dẫn tới trang của ngày đó.",
      },
      commit: "f585dbb",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Day navigation shows as pills, with a link home on the right.",
        vi: "Thanh chuyển ngày hiện dạng nút bo tròn, có nút về trang chủ bên phải.",
      },
      commit: "eba36c3",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The day card is the day page hero when there is no video.",
        vi: "Ảnh tóm tắt làm ảnh chính của trang ngày khi không có video.",
      },
      commit: "6c2fba9",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The AI;DR list on a day page uses the same rows as the homepage, with highlights and the story dialog.",
        vi: "Danh sách AI;DR trên trang ngày dùng cùng kiểu dòng với trang chủ, có tô màu và hộp thoại tin.",
      },
      commit: "d9745da",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "A share card for each day, and the Telegram digest links to the day page.",
        vi: "Mỗi ngày có thẻ chia sẻ riêng, và bản tin Telegram dẫn tới trang ngày.",
      },
      commit: "1e1ed9a",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Day pages are in the sitemap and llms.txt, and have a Markdown version.",
        vi: "Trang ngày có trong sitemap và llms.txt, và có bản Markdown.",
      },
      commit: "90a7c90",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The AI;DR digest has a yellow masthead with a day card chip.",
        vi: "AI;DR có phần đầu màu vàng với nút xem ảnh tóm tắt trong ngày.",
      },
      commit: "86f3da9",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Hovering the masthead chip shows the day card over the digest.",
        vi: "Rê chuột lên nút ở phần đầu sẽ hiện ảnh tóm tắt đè lên AI;DR.",
      },
      commit: "9b74292",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "The day card leads with real photos and skips images that are only a headline.",
        vi: "Ảnh tóm tắt ưu tiên ảnh thật và bỏ qua những ảnh chỉ có chữ tiêu đề.",
      },
      commit: "8abed7e",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Each day card only shows stories written in its language, and Vietnamese tiles read as Vietnamese.",
        vi: "Mỗi ảnh tóm tắt chỉ dùng tin có bản đúng ngôn ngữ, và các ô tiếng Việt viết bằng tiếng Việt.",
      },
      commit: "d08271d",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "WebP photos are converted so they no longer draw blank on cards.",
        vi: "Ảnh WebP được chuyển định dạng nên không còn hiện trống trên thẻ.",
      },
      commit: "c819aa1",
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "Share cards and their photos are cached and shared across regions.",
        vi: "Thẻ chia sẻ và ảnh trong thẻ được lưu đệm và dùng chung giữa các khu vực.",
      },
      commit: "c15d05c",
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "The day card preloads so the masthead hover is instant.",
        vi: "Ảnh tóm tắt được tải trước nên rê chuột là hiện ngay.",
      },
      commit: "8b88ddf",
    },
    // Ranking and voting
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Signed-in readers can vote stories up or down.",
        vi: "Bạn đọc đã đăng nhập có thể bình chọn lên hoặc xuống cho tin.",
      },
      commit: "3202a77",
      pr: 367,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Vote controls stay on the headline line.",
        vi: "Nút bình chọn nằm cùng dòng với tiêu đề.",
      },
      commit: "8aed35b",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Votes move with a story when an official post becomes its main link.",
        vi: "Phiếu bình chọn đi theo tin khi bài chính thức trở thành liên kết chính.",
      },
      commit: "f303a00",
      pr: 451,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Story pages explain the rank and the Telegram trending status.",
        vi: "Trang tin giải thích thứ hạng và trạng thái nổi bật trên Telegram.",
      },
      commit: "c65b2b9",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Ranking covers a rolling 72-hour window and caps each source family on top lists.",
        vi: "Xếp hạng xét trong 72 giờ gần nhất và giới hạn mỗi nhóm nguồn trên danh sách nổi bật.",
      },
      commit: "a8b8f4d",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Ranking counts real corroboration and engagement, and the trending bar is relative to the day.",
        vi: "Xếp hạng tính theo số nguồn xác nhận và mức tương tác thật, và thanh nổi bật so theo từng ngày.",
      },
      commit: "b72b23b",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "New builder categories, and an official post owns the story it announces.",
        vi: "Thêm các chủ đề cho người làm sản phẩm, và bài đăng chính thức đứng tên cho tin mà nó công bố.",
      },
      commit: "8a0153d",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Importance uses one shared 1–10 scale.",
        vi: "Độ quan trọng dùng chung một thang 1–10.",
      },
      commit: "be99f17",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Story clustering no longer fails silently, so related stories merge again.",
        vi: "Gom nhóm tin không còn lỗi âm thầm, nên các tin liên quan lại được gộp.",
      },
      commit: "c56bcd3",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Public top stories only come from the last 48 hours.",
        vi: "Tin nổi bật công khai chỉ lấy trong 48 giờ gần nhất.",
      },
      commit: "8a8a21b",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Days follow Vietnam time for the feed, permalinks, story clocks, and daily rank.",
        vi: "Bảng tin, đường dẫn tin, giờ đăng và thứ hạng trong ngày đều tính theo giờ Việt Nam.",
      },
      commit: "4416325",
      pr: 445,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Two feeds that share a URL produce one row.",
        vi: "Hai nguồn trùng URL chỉ tạo một dòng tin.",
      },
      commit: "105ea20",
      pr: 447,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Headlines decode HTML entities and drop UPDATE: markers.",
        vi: "Tiêu đề giải mã ký tự HTML và bỏ các dấu UPDATE:.",
      },
      commit: "d7fe158",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Cut-off summaries are replaced with full ones.",
        vi: "Tóm tắt bị cắt ngang được thay bằng bản đầy đủ.",
      },
      commit: "500048c",
      pr: 386,
    },
    // Sources and pipeline
    {
      kind: "feature",
      scope: "sources",
      text: {
        en: "Reddit and Techmeme trending feeds join; VnExpress Tech is paused.",
        vi: "Thêm nguồn nổi bật từ Reddit và Techmeme; tạm dừng VnExpress Khoa học & Công nghệ.",
      },
      commit: "ecb5fce",
      pr: 474,
    },
    {
      kind: "feature",
      scope: "sources",
      text: {
        en: "More AI sources, sharper trending, and scoring that leads with the decision.",
        vi: "Thêm nguồn AI, nổi bật chính xác hơn, và chấm điểm dựa trước tiên vào quyết định đưa tin.",
      },
      commit: "bc50213",
    },
    {
      kind: "feature",
      scope: "sources",
      text: {
        en: "The Cloudflare Blog, filtered to its AI posts.",
        vi: "Thêm Cloudflare Blog, chỉ lấy bài về AI.",
      },
      commit: "90fe1a3",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The pipeline collects news every 30 minutes and keeps posts about new models and labs.",
        vi: "Hệ thống thu thập tin 30 phút một lần và giữ lại tin về model mới và phòng nghiên cứu mới.",
      },
      commit: "5a37a8c",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Undated RSS items no longer slip into the feed.",
        vi: "Tin RSS không có ngày đăng không còn lọt vào bảng tin.",
      },
      commit: "f397b36",
      pr: 438,
    },
    // Vietnamese
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Translations are checked by back-translation, and tech terms stay in English.",
        vi: "Bản dịch được kiểm tra bằng cách dịch ngược, và thuật ngữ kỹ thuật giữ nguyên tiếng Anh.",
      },
      commit: "cebdb9c",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Model jargon stays in English, and weak Vietnamese drafts are repaired.",
        vi: "Thuật ngữ về model giữ tiếng Anh, và bản nháp tiếng Việt yếu được sửa lại.",
      },
      commit: "ee2a556",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Accepted suggestions teach the translator new rules, and there is one free-form suggestion box.",
        vi: "Gợi ý được duyệt sẽ thành quy tắc mới cho phần dịch, và chỉ còn một ô gợi ý viết tự do.",
      },
      commit: "033c572",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Story text edits are logged and shown as a short history on the story.",
        vi: "Mỗi lần sửa nội dung tin được ghi lại và hiện thành lịch sử ngắn trên tin.",
      },
      commit: "bc16870",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Vietnamese summaries that a translate batch dropped are filled in.",
        vi: "Tóm tắt tiếng Việt bị sót trong một lượt dịch được bổ sung.",
      },
      commit: "92bd29a",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Merged stories get Vietnamese names.",
        vi: "Tin gộp có tên tiếng Việt.",
      },
      commit: "5d274f8",
      pr: 434,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "The draft check no longer rewrites Vietnamese copy that was already good.",
        vi: "Bước kiểm tra bản nháp không còn sửa những bản tiếng Việt vốn đã ổn.",
      },
      commit: "d31fff7",
      pr: 370,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Reader labels that stayed in English are translated.",
        vi: "Các nhãn còn để tiếng Anh đã được dịch.",
      },
      commit: "7ea917f",
      pr: 385,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "An open story reloads when you switch language.",
        vi: "Tin đang mở sẽ tải lại khi bạn đổi ngôn ngữ.",
      },
      commit: "017e661",
      pr: 387,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "An approved suggestion is kept even if re-translation fails.",
        vi: "Gợi ý đã duyệt vẫn được giữ dù lần dịch lại bị lỗi.",
      },
      commit: "78bfe83",
      pr: 456,
    },
    // Contribute
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Contributions moved to /contribute with a compact, filterable history.",
        vi: "Phần đóng góp chuyển sang /contribute với lịch sử gọn, lọc được.",
      },
      commit: "49abf2d",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Your suggestions are reviewed on submit, and you can see your contribution history.",
        vi: "Gợi ý của bạn được duyệt ngay khi gửi, và bạn xem được lịch sử đóng góp.",
      },
      commit: "a4fd4f5",
    },
    {
      kind: "feature",
      scope: "mail",
      text: {
        en: "Send or forward a story to submit@aidr.today from a verified address.",
        vi: "Gửi hoặc chuyển tiếp tin tới submit@aidr.today từ địa chỉ đã xác minh.",
      },
      commit: "8cd2f24",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The Get AI;DR menu links to Contribute.",
        vi: "Menu Nhận AI;DR có liên kết tới trang Contribute.",
      },
      commit: "1a4f9ea",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Signing in from a suggestion keeps the text you selected.",
        vi: "Đăng nhập từ ô gợi ý vẫn giữ đoạn chữ bạn đã chọn.",
      },
      commit: "75a288b",
      pr: 388,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "A slow suggestion review links you to your contributions list.",
        vi: "Khi duyệt gợi ý chậm, trang dẫn bạn tới danh sách đóng góp.",
      },
      commit: "f517255",
      pr: 440,
    },
    // Get AI;DR, email, Telegram, Facebook
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The email preview follows the form, with image layout options.",
        vi: "Bản xem trước email đổi theo form, kèm lựa chọn kiểu ảnh.",
      },
      commit: "e2dfbc9",
      pr: 328,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Email signup asks you to confirm your address and rejects reserved domains.",
        vi: "Đăng ký email cần xác nhận địa chỉ và từ chối tên miền dành riêng.",
      },
      commit: "e2b36a2",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The Chrome tab preview matches the real extension.",
        vi: "Bản xem trước ở tab Chrome giống hệt tiện ích thật.",
      },
      commit: "2c40f8e",
      pr: 329,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The Telegram tab shows one card per channel.",
        vi: "Tab Telegram hiện mỗi kênh một thẻ.",
      },
      commit: "be98497",
      pr: 322,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The intro video plays as a larger, bare player.",
        vi: "Video giới thiệu phát trong khung lớn hơn, không còn phần thừa xung quanh.",
      },
      commit: "9b48c79",
      pr: 319,
    },
    {
      kind: "feature",
      scope: "mail",
      text: {
        en: "The daily email leads with the day card, linked to the day page.",
        vi: "Email hằng ngày mở đầu bằng ảnh tóm tắt, dẫn tới trang ngày.",
      },
      commit: "c953655",
    },
    {
      kind: "feature",
      scope: "mail",
      text: {
        en: "Story thumbnails sit on the right in the email digest.",
        vi: "Ảnh nhỏ của tin nằm bên phải trong bản tin email.",
      },
      commit: "0368dc2",
      pr: 475,
    },
    {
      kind: "feature",
      scope: "telegram",
      text: {
        en: "The daily Telegram digest is the day card photo with numbered bullets.",
        vi: "Bản tin Telegram hằng ngày là ảnh tóm tắt kèm các gạch đầu dòng đánh số.",
      },
      commit: "e27c7f4",
    },
    {
      kind: "feature",
      scope: "telegram",
      text: {
        en: "Each digest bullet starts with a topic emoji.",
        vi: "Mỗi gạch đầu dòng mở đầu bằng một emoji theo chủ đề.",
      },
      commit: "049e36d",
    },
    {
      kind: "fix",
      scope: "telegram",
      text: {
        en: "Each Telegram channel posts only in its own language.",
        vi: "Mỗi kênh Telegram chỉ đăng bằng ngôn ngữ của kênh đó.",
      },
      commit: "b9416ae",
    },
    {
      kind: "fix",
      scope: "telegram",
      text: {
        en: "Long digests split into two highlights, each with a short summary.",
        vi: "Bản tin dài được tách thành hai phần, mỗi phần có tóm tắt ngắn.",
      },
      commit: "9fda72f",
    },
    {
      kind: "fix",
      scope: "telegram",
      text: {
        en: "The Telegram digest uses the same stories as the day card.",
        vi: "Bản tin Telegram dùng đúng các tin trong ảnh tóm tắt.",
      },
      commit: "491bb4c",
      pr: 373,
    },
    {
      kind: "fix",
      scope: "telegram",
      text: {
        en: "Trending posts on Telegram are back.",
        vi: "Bài nổi bật trên Telegram hoạt động trở lại.",
      },
      commit: "5e064f3",
    },
    {
      kind: "feature",
      scope: "facebook",
      text: {
        en: "The English digest and trending stories post to the Facebook Page.",
        vi: "Bản tin tiếng Anh và các tin nổi bật được đăng lên Fanpage Facebook.",
      },
      commit: "e65ea90",
    },
    {
      kind: "feature",
      scope: "facebook",
      text: {
        en: "The Facebook post carries the full edition in paragraphs.",
        vi: "Bài trên Facebook đăng trọn bản tin, chia theo đoạn.",
      },
      commit: "3c99da0",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The Get AI;DR menu links the Facebook Page.",
        vi: "Menu Nhận AI;DR có liên kết tới Fanpage Facebook.",
      },
      commit: "45213ed",
    },
    // Site
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Sign-in works again after the site loaded a test login key.",
        vi: "Đăng nhập hoạt động trở lại sau khi trang dùng nhầm khoá đăng nhập thử nghiệm.",
      },
      commit: "117c614",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "The header sign-in slot keeps its size, so the header no longer shifts.",
        vi: "Ô đăng nhập trên header giữ nguyên kích thước nên header không còn bị xô lệch.",
      },
      commit: "9cb75b7",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "The Density setting also adjusts the AI;DR card.",
        vi: "Tuỳ chọn Mật độ giờ áp dụng cả cho thẻ AI;DR.",
      },
      commit: "07d5465",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Appearance settings have a reset-to-default button.",
        vi: "Phần cài đặt giao diện có nút khôi phục mặc định.",
      },
      commit: "b5c73c6",
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "The feed and ranking queries are indexed.",
        vi: "Truy vấn bảng tin và xếp hạng được đánh chỉ mục.",
      },
      commit: "e549e8f",
      pr: 376,
    },
    // Extension
    {
      kind: "feature",
      scope: "extension",
      text: {
        en: "The new tab matches the homepage digest, with day links and the intro video.",
        vi: "Tab mới khớp AI;DR trên trang chủ, có liên kết theo ngày và video giới thiệu.",
      },
      commit: "b0d3c6c",
    },
    {
      kind: "fix",
      scope: "extension",
      text: {
        en: "The density slider is visible and the menu matches the web Get AI;DR menu.",
        vi: "Thanh chỉnh mật độ đã hiện rõ và menu khớp với menu Nhận AI;DR trên web.",
      },
      commit: "228a512",
      pr: 324,
    },
    {
      kind: "fix",
      scope: "extension",
      text: {
        en: "Story votes stay on the headline line.",
        vi: "Số phiếu của tin nằm cùng dòng với tiêu đề.",
      },
      commit: "8c499f3",
    },
    // Data page
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Runs with failed steps are flagged, and each run is drawn as a workflow graph.",
        vi: "Lượt chạy có bước lỗi được đánh dấu, và mỗi lượt chạy được vẽ thành sơ đồ.",
      },
      commit: "aef4a07",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Click a workflow step to see its model calls.",
        vi: "Bấm vào một bước trong sơ đồ để xem các lần gọi model của bước đó.",
      },
      commit: "e079657",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "A compact Recent runs list opens each run in a details dialog.",
        vi: "Danh sách Recent runs gọn hơn, mỗi lượt chạy mở trong hộp thoại chi tiết.",
      },
      commit: "5809f93",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Each model call shows its route, retries inline, and price when known.",
        vi: "Mỗi lần gọi model hiện đường đi, số lần thử lại và chi phí nếu có.",
      },
      commit: "9e02f4f",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Repeated run errors are grouped, and each run model shows its family mark.",
        vi: "Lỗi lặp lại được gom nhóm, và mỗi model trong lượt chạy có biểu tượng hãng.",
      },
      commit: "775e248",
      pr: 399,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Data charts show dates and daily totals.",
        vi: "Biểu đồ trên trang Dữ liệu hiện ngày và tổng theo ngày.",
      },
      commit: "9e252b9",
      pr: 400,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Pages say the pipeline runs every 30 minutes.",
        vi: "Các trang đã ghi đúng là hệ thống chạy 30 phút một lần.",
      },
      commit: "a0fec7a",
      pr: 442,
    },
  ],
};
