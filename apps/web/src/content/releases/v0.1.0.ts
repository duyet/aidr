import type { Release } from "../../lib/releases/types";

export const release: Release = {
  version: "0.1.0",
  date: "2026-09-30",
  from: "2026-09-07",
  to: "2026-09-30",
  compare: { base: "web-v0.1.3", head: "web-v0.1.10" },
  title: {
    en: "AI;DR goes public at aidr.today",
    vi: "AI;DR chính thức ra mắt tại aidr.today",
  },
  intro: {
    en: "This is the first public release of AI;DR: ranked AI news with a short daily digest, in English and Vietnamese, at aidr.today. In three weeks it grew from three sources to 25, got a page for every story, and started reaching readers in Chrome, on Telegram, by email, over RSS, and through MCP.",
    vi: "Đây là bản phát hành công khai đầu tiên của AI;DR: tin AI được xếp hạng kèm bản tóm tắt ngắn mỗi ngày, bằng tiếng Anh và tiếng Việt, tại aidr.today. Trong ba tuần, số nguồn tin tăng từ 3 lên 25, mỗi tin có trang riêng, và bạn đọc giờ nhận tin qua Chrome, Telegram, email, RSS và MCP.",
  },
  stats: [
    { value: "332", label: { en: "commits", vi: "commit" } },
    { value: "98", label: { en: "features", vi: "tính năng" } },
    { value: "102", label: { en: "fixes", vi: "bản sửa lỗi" } },
    {
      value: "+22",
      label: { en: "news sources (3 → 25)", vi: "nguồn tin (3 → 25)" },
    },
  ],
  youtubeId: "8Tng0STx3m0",
  cover: {
    src: "/releases/v0.1.0/home.webp",
    width: 1440,
    height: 900,
    alt: {
      en: "The aidr.today homepage: category tabs, trending topics, the yellow AI;DR digest card, and the ranked story list.",
      vi: "Trang chủ aidr.today: thanh chủ đề, chủ đề nổi bật, thẻ AI;DR màu vàng và danh sách tin đã xếp hạng.",
    },
    caption: {
      en: "The homepage today. The digest card and ranked feed took shape in this release.",
      vi: "Trang chủ hiện tại. Thẻ AI;DR và bảng tin xếp hạng thành hình trong bản này.",
    },
  },
  highlights: [
    {
      label: { en: "A page for every story", vi: "Mỗi tin một trang riêng" },
      text: {
        en: "Every story now has a short permalink such as aidr.today/90b333df, with key sources inline and a photo gallery when the source has images. Shared links show a branded AI;DR card with the story photo.",
        vi: "Mỗi tin giờ có đường dẫn ngắn dạng aidr.today/90b333df, nguồn chính hiện ngay trong tin, kèm bộ ảnh khi nguồn có hình. Link chia sẻ hiện thẻ AI;DR có ảnh của tin.",
      },
      image: {
        src: "/releases/v0.1.0/story-og-card.webp",
        width: 1200,
        height: 630,
        alt: {
          en: "An AI;DR share card: the story headline on the left, the story photo on the right, source, date, and category below.",
          vi: "Thẻ chia sẻ AI;DR: tiêu đề tin bên trái, ảnh của tin bên phải, nguồn, ngày và chủ đề ở dưới.",
        },
        caption: {
          en: "The card a story link shows on social apps and chat.",
          vi: "Thẻ hiện ra khi chia sẻ link tin lên mạng xã hội hay ứng dụng chat.",
        },
      },
      href: "/90b333df",
    },
    {
      label: { en: "One Get AI;DR menu", vi: "Gộp vào menu Nhận AI;DR" },
      text: {
        en: "Header actions merged into one menu: Chrome Extension, the Telegram channels, Email Subscription, Submit, Data Analytics, and Algorithms. On phones it opens as a near-full-screen grid of large tiles.",
        vi: "Các nút trên header gộp vào một menu: Chrome Extension, các kênh Telegram, Email Subscription, Submit, Data Analytics và Algorithms. Trên điện thoại, menu mở gần toàn màn hình với các ô lớn.",
      },
      image: {
        src: "/releases/v0.1.0/get-menu.webp",
        width: 680,
        height: 420,
        alt: {
          en: "The Get AI;DR menu open under the header, listing Chrome Extension, Telegram, Facebook, Email, Contribute, Data Analytics, Algorithms, and About.",
          vi: "Menu Nhận AI;DR mở dưới header, liệt kê Chrome Extension, Telegram, Facebook, Email, Contribute, Data Analytics, Algorithms và About.",
        },
        caption: {
          en: "Current look. Facebook and Contribute were added in 0.1.12.",
          vi: "Giao diện hiện tại. Mục Facebook và Contribute được thêm ở bản 0.1.12.",
        },
      },
      href: "/subscribe",
    },
    {
      label: {
        en: "Telegram in two languages",
        vi: "Telegram cho cả hai ngôn ngữ",
      },
      text: {
        en: "The English channel @aidr_today joined the Vietnamese @aihomnay. Each posts the daily digest and a few trending stories during the day, with photo and video albums and one button to read the story.",
        vi: "Kênh tiếng Anh @aidr_today ra đời bên cạnh kênh tiếng Việt @aihomnay. Mỗi kênh đăng bản tin hằng ngày và vài tin nổi bật trong ngày, kèm album ảnh và video cùng một nút để đọc tin.",
      },
      image: {
        src: "/releases/v0.1.0/telegram-channels.webp",
        width: 1080,
        height: 570,
        alt: {
          en: "The Telegram tab on Get AI;DR, with buttons for @aidr_today and @aihomnay and a preview of a channel post.",
          vi: "Tab Telegram trên trang Nhận AI;DR, có nút mở @aidr_today và @aihomnay cùng bản xem trước một bài đăng.",
        },
      },
      href: "/subscribe?tab=telegram",
    },
    {
      label: { en: "The digest by email", vi: "Bản tin qua email" },
      text: {
        en: "The email digest got the AI;DR look, story thumbnails, and highlighted model and company names. English and Vietnamese subscribers now get separate editions, and the Email tab shows a live preview of the latest one.",
        vi: "Bản tin email mang giao diện AI;DR, có ảnh nhỏ cho từng tin và tô màu tên model, tên công ty. Người đăng ký tiếng Anh và tiếng Việt giờ nhận hai bản riêng, và tab Email hiện bản xem trước của số mới nhất.",
      },
      href: "/subscribe?tab=email",
    },
    {
      label: { en: "Chrome new tab", vi: "Tab mới trên Chrome" },
      text: {
        en: "The extension is on the Chrome Web Store. Every new tab opens today's AI;DR and the ranked feed, in the same layout and fonts as the homepage, and paints from cache first so it shows up at once.",
        vi: "Tiện ích đã có trên Chrome Web Store. Mỗi tab mới mở AI;DR hôm nay và bảng tin xếp hạng, cùng bố cục và phông chữ với trang chủ, và hiện ngay từ bộ nhớ đệm trước khi tải tin mới.",
      },
      image: {
        src: "/releases/v0.1.0/chrome-new-tab.webp",
        width: 1080,
        height: 570,
        alt: {
          en: "The Chrome tab on Get AI;DR: the extension card with a Chrome Web Store button beside a preview of the new tab page.",
          vi: "Tab Chrome trên trang Nhận AI;DR: thẻ tiện ích với nút Chrome Web Store bên cạnh bản xem trước tab mới.",
        },
      },
      href: "/subscribe?tab=chrome",
    },
    {
      label: { en: "Read it anywhere", vi: "Đọc ở bất cứ đâu" },
      text: {
        en: "aidr.today has an RSS feed at /feed.xml in both languages and a Google News sitemap. AI agents can read the news over MCP with no account or key, and every story is available as Markdown.",
        vi: "aidr.today có bản tin RSS tại /feed.xml cho cả hai ngôn ngữ và sitemap Google News. AI agent đọc được tin qua MCP mà không cần tài khoản hay key, và mỗi tin đều có bản Markdown.",
      },
      image: {
        src: "/releases/v0.1.0/mcp-server.webp",
        width: 1080,
        height: 810,
        alt: {
          en: "The MCP Server page: the connect config, a Claude Code command, and the four read-only tools.",
          vi: "Trang MCP Server: cấu hình kết nối, lệnh cho Claude Code và bốn công cụ chỉ-đọc.",
        },
      },
      href: "/mcp",
    },
    {
      label: {
        en: "More sources, fairer ranking",
        vi: "Thêm nguồn, xếp hạng công bằng hơn",
      },
      text: {
        en: "Sources grew from 3 to 25, including OpenAI, Anthropic, Google DeepMind, xAI, AWS, Hugging Face, and arXiv. Outlets covering the same story merge into one row, more sources lift a story's rank, and no single source can fill more than a quarter of the feed.",
        vi: "Số nguồn tăng từ 3 lên 25, gồm OpenAI, Anthropic, Google DeepMind, xAI, AWS, Hugging Face và arXiv. Nhiều trang cùng đưa một tin giờ gộp thành một dòng, tin được nhiều nguồn nhắc tới sẽ lên hạng, và không nguồn nào chiếm quá một phần tư bảng tin.",
      },
      image: {
        src: "/releases/v0.1.0/story-page.webp",
        width: 1080,
        height: 520,
        alt: {
          en: "An open story with its summary, key sources, photo, topics, and score.",
          vi: "Một tin đang mở với tóm tắt, nguồn chính, ảnh, chủ đề và điểm số.",
        },
      },
      href: "/data?tab=sources",
    },
    {
      label: {
        en: "The pipeline in the open",
        vi: "Quy trình xử lý công khai",
      },
      text: {
        en: "The Data page shows every ingest run, each source's health, the models behind scoring and translation, and token use per day. The footer links to the latest run with a health dot.",
        vi: "Trang Dữ liệu hiện từng lượt thu thập tin, tình trạng từng nguồn, các model dùng để chấm điểm và dịch, và lượng token mỗi ngày. Footer có liên kết tới lượt chạy gần nhất kèm chấm báo tình trạng.",
      },
      image: {
        src: "/releases/v0.1.0/data-page.webp",
        width: 1080,
        height: 710,
        alt: {
          en: "The Data page: the models used for each pipeline step, overview tabs, totals, and a chart of stories per day.",
          vi: "Trang Dữ liệu: model dùng cho từng bước, các tab tổng quan, số liệu tổng và biểu đồ số tin mỗi ngày.",
        },
      },
      href: "/data",
    },
  ],
  changes: [
    // Reading
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Story permalinks are short: aidr.today/<id>.",
        vi: "Đường dẫn tin rút gọn thành aidr.today/<id>.",
      },
      commit: "f5d525d",
      pr: 83,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Outlets covering the same story merge into one row, and a story's rank and trending score rise with the number of sources.",
        vi: "Nhiều trang cùng đưa một tin được gộp thành một dòng, và thứ hạng cùng điểm nổi bật của tin tăng theo số nguồn.",
      },
      commit: "83d36e9",
      pr: 39,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "No single source can take more than 25% of the feed.",
        vi: "Không nguồn nào chiếm quá 25% bảng tin.",
      },
      commit: "f98ffc4",
      pr: 299,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "A panel of reviewer models checks each story's score before it is ranked.",
        vi: "Một nhóm model đánh giá kiểm tra điểm của từng tin trước khi xếp hạng.",
      },
      commit: "fd5314a",
      pr: 209,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Story sources show compact and inline under the summary.",
        vi: "Nguồn của tin hiện gọn ngay dưới phần tóm tắt.",
      },
      commit: "db0b838",
      pr: 176,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Stories with several images show them as a small gallery.",
        vi: "Tin có nhiều ảnh hiện thành một bộ ảnh nhỏ.",
      },
      commit: "0c5e80c",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The expanded story panel is flatter, with a larger thumbnail that zooms on hover.",
        vi: "Khung tin khi mở rộng phẳng hơn, ảnh nhỏ lớn hơn và phóng to khi rê chuột.",
      },
      commit: "9d48543",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Each category has its own accessible accent color.",
        vi: "Mỗi chủ đề có màu nhấn riêng, đủ độ tương phản để dễ đọc.",
      },
      commit: "340ed62",
      pr: 159,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "New visitors see all four homepage sections by default.",
        vi: "Người mới vào trang thấy đủ bốn mục trên trang chủ.",
      },
      commit: "bd22e36",
      pr: 308,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The digest title comes from its own bullets and leads with one hero image.",
        vi: "Tiêu đề bản tin lấy từ chính các gạch đầu dòng và mở đầu bằng một ảnh lớn.",
      },
      commit: "b04b3b6",
      pr: 247,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Digest bullets get their story thumbnails and links back.",
        vi: "Các gạch đầu dòng trong bản tin có lại ảnh nhỏ và liên kết tới tin.",
      },
      commit: "bc9de56",
      pr: 34,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Story summaries are no longer cut short, and a story with no photo falls back to its share card.",
        vi: "Tóm tắt tin không còn bị cắt ngang, và tin không có ảnh sẽ dùng thẻ chia sẻ thay thế.",
      },
      commit: "b2fca66",
      pr: 256,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "The story dialog is wider on large screens, tighter overall, and shows the summary.",
        vi: "Hộp thoại tin rộng hơn trên màn hình lớn, gọn hơn và có hiện phần tóm tắt.",
      },
      commit: "c0d27c4",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Story pages hide an empty source link or a missing date instead of showing a blank.",
        vi: "Trang tin ẩn liên kết nguồn trống hoặc ngày bị thiếu thay vì để ô trắng.",
      },
      commit: "6493dd5",
      pr: 289,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Categories stay in the site's own list in every language.",
        vi: "Chủ đề luôn nằm trong danh sách chủ đề của trang, ở mọi ngôn ngữ.",
      },
      commit: "0077a40",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Muted text uses colors with enough contrast on every reading background.",
        vi: "Chữ phụ dùng màu đủ tương phản trên mọi nền đọc.",
      },
      commit: "dcfa6bc",
      pr: 240,
    },
    // Header, menu, language
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Header actions merged into the Get AI;DR menu.",
        vi: "Các nút trên header gộp vào menu Nhận AI;DR.",
      },
      commit: "710de64",
      pr: 133,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "On phones the menu opens near full screen with an icon for each link.",
        vi: "Trên điện thoại, menu mở gần toàn màn hình với biểu tượng cho từng mục.",
      },
      commit: "d4112a7",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "The phone menu is a two-column grid of large tiles, with language at the top.",
        vi: "Menu trên điện thoại là lưới hai cột với các ô lớn, phần ngôn ngữ nằm trên cùng.",
      },
      commit: "ff9d158",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Header icons have 44px tap targets with even spacing.",
        vi: "Các biểu tượng trên header có vùng chạm 44px và khoảng cách đều nhau.",
      },
      commit: "d1fed2e",
      pr: 79,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "About moved from reading settings into the menu.",
        vi: "Mục About chuyển từ phần cài đặt đọc sang menu.",
      },
      commit: "85eca74",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Sign in is always in the header, without waiting for the login script.",
        vi: "Nút Đăng nhập luôn có sẵn trên header, không phải chờ tải phần đăng nhập.",
      },
      commit: "a91143d",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The header can play a short intro video.",
        vi: "Header có nút xem video giới thiệu ngắn.",
      },
      commit: "f41f264",
      pr: 309,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Your language choice stays as you move between pages, without redirect loops.",
        vi: "Ngôn ngữ bạn chọn được giữ nguyên khi chuyển trang, không còn bị chuyển hướng vòng lặp.",
      },
      commit: "4d18a7c",
      pr: 182,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "The story dialog links to the permalink in your language.",
        vi: "Hộp thoại tin dẫn tới đường dẫn tin đúng ngôn ngữ bạn đang đọc.",
      },
      commit: "71cadb8",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Sign-in no longer fails with a 502 after the login handshake.",
        vi: "Đăng nhập không còn báo lỗi 502 sau bước xác thực.",
      },
      commit: "58d1445",
      pr: 212,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "news.duyet.net redirects to the same page on aidr.today.",
        vi: "news.duyet.net chuyển thẳng tới đúng trang tương ứng trên aidr.today.",
      },
      commit: "ab701ad",
      pr: 48,
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "The site no longer loads Microsoft Clarity or the pageview tracker.",
        vi: "Trang không còn tải Microsoft Clarity hay bộ đếm lượt xem trang.",
      },
      commit: "f472129",
    },
    // Sharing
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Story links share a branded AI;DR card.",
        vi: "Link tin chia sẻ kèm thẻ AI;DR.",
      },
      commit: "3873acc",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Share cards show the story photo when there is one.",
        vi: "Thẻ chia sẻ có ảnh của tin khi tin có ảnh.",
      },
      commit: "a9d6701",
      pr: 175,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The homepage has its own masthead share card.",
        vi: "Trang chủ có thẻ chia sẻ masthead riêng.",
      },
      commit: "177a633",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Long headlines and missing photos no longer break the share card layout.",
        vi: "Tiêu đề dài hay ảnh bị thiếu không còn làm vỡ bố cục thẻ chia sẻ.",
      },
      commit: "7a71163",
      pr: 192,
    },
    // Delivery
    {
      kind: "feature",
      scope: "telegram",
      text: {
        en: "The English digest posts to @aidr_today.",
        vi: "Bản tin tiếng Anh được đăng lên @aidr_today.",
      },
      commit: "619d006",
      pr: 251,
    },
    {
      kind: "feature",
      scope: "telegram",
      text: {
        en: "Telegram posts come as photo albums with one read button, in one language per channel.",
        vi: "Bài trên Telegram đăng dạng album ảnh với một nút đọc tin, mỗi kênh một ngôn ngữ.",
      },
      commit: "1ffa2b7",
    },
    {
      kind: "feature",
      scope: "telegram",
      text: {
        en: "Telegram albums can include videos.",
        vi: "Album trên Telegram có thể kèm video.",
      },
      commit: "53c232f",
      pr: 287,
    },
    {
      kind: "feature",
      scope: "telegram",
      text: {
        en: "Fewer trending posts, only during the day, with more room on big-news days.",
        vi: "Ít bài nổi bật hơn, chỉ đăng ban ngày, và nới thêm vào những ngày nhiều tin lớn.",
      },
      commit: "f0816a1",
      pr: 315,
    },
    {
      kind: "fix",
      scope: "telegram",
      text: {
        en: "A post whose send result is unknown is not sent a second time.",
        vi: "Bài chưa rõ đã gửi thành công hay chưa sẽ không bị gửi lần hai.",
      },
      commit: "8f0e9de",
      pr: 314,
    },
    {
      kind: "feature",
      scope: "mail",
      text: {
        en: "The email digest has the AI;DR look and its own delivery tabs.",
        vi: "Bản tin email mang giao diện AI;DR và có các tab nhận tin riêng.",
      },
      commit: "fe30042",
      pr: 38,
    },
    {
      kind: "feature",
      scope: "mail",
      text: {
        en: "Email stories have thumbnails, compact rows, and highlighted names.",
        vi: "Tin trong email có ảnh nhỏ, dòng gọn và tô màu tên riêng.",
      },
      commit: "93e5e8d",
    },
    {
      kind: "feature",
      scope: "mail",
      text: {
        en: "English and Vietnamese subscribers get separate editions.",
        vi: "Người đăng ký tiếng Anh và tiếng Việt nhận hai bản tin riêng.",
      },
      commit: "00bd53e",
      pr: 261,
    },
    {
      kind: "fix",
      scope: "mail",
      text: {
        en: "Digest links are clickable in Gmail and fonts render without stray quotes.",
        vi: "Liên kết trong bản tin bấm được trên Gmail và phông chữ hiển thị đúng.",
      },
      commit: "3fc9c09",
      pr: 56,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The Email tab shows a live preview of the latest digest.",
        vi: "Tab Email hiện bản xem trước của bản tin mới nhất.",
      },
      commit: "9558832",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Subscribe tabs keep their state in the URL, and the menu links straight to email signup.",
        vi: "Các tab đăng ký lưu trạng thái trong URL, và menu có liên kết thẳng tới đăng ký email.",
      },
      commit: "6b858e4",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Get AI;DR lives at /subscribe.",
        vi: "Trang Nhận AI;DR nằm tại /subscribe.",
      },
      commit: "639e22d",
      pr: 66,
    },
    // Extension
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Chrome Web Store links on the extension page and in the footer.",
        vi: "Có liên kết Chrome Web Store trên trang tiện ích và ở footer.",
      },
      commit: "69bbce7",
      pr: 32,
    },
    {
      kind: "feature",
      scope: "extension",
      text: {
        en: "The new tab matches the aidr.today layout.",
        vi: "Tab mới có bố cục giống aidr.today.",
      },
      commit: "a66bc53",
      pr: 37,
    },
    {
      kind: "feature",
      scope: "extension",
      text: {
        en: "The new tab paints the cached digest first, then refreshes.",
        vi: "Tab mới hiện bản tin đã lưu trước, rồi mới tải bản mới.",
      },
      commit: "888f8d2",
    },
    {
      kind: "feature",
      scope: "extension",
      text: {
        en: "Stories open in a dialog on the new tab.",
        vi: "Tin mở trong hộp thoại ngay trên tab mới.",
      },
      commit: "416dcf7",
    },
    {
      kind: "feature",
      scope: "extension",
      text: {
        en: "A roomier layout, aligned header icons, and no host or score clutter.",
        vi: "Bố cục thoáng hơn, biểu tượng header thẳng hàng, bỏ tên miền và điểm số cho đỡ rối.",
      },
      commit: "d917f6b",
      pr: 46,
    },
    {
      kind: "feature",
      scope: "extension",
      text: {
        en: "A reload button sits next to the updated time.",
        vi: "Nút tải lại nằm cạnh thời gian cập nhật.",
      },
      commit: "90004f3",
    },
    // Open web and agents
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "An RSS feed at /feed.xml, a Google News sitemap, and a sitemap that keeps older stories.",
        vi: "Bản tin RSS tại /feed.xml, sitemap Google News và sitemap giữ đủ tin cũ.",
      },
      commit: "07b05a6",
      pr: 236,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Anyone can read the news over MCP with no account or key.",
        vi: "Ai cũng đọc được tin qua MCP mà không cần tài khoản hay key.",
      },
      commit: "735621d",
      pr: 237,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Browsers with agent tools get four read-only tools on the page.",
        vi: "Trình duyệt hỗ trợ công cụ cho agent nhận được bốn công cụ chỉ-đọc ngay trên trang.",
      },
      commit: "1cb0c6d",
      pr: 238,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Every story is available as Markdown for agents.",
        vi: "Mỗi tin đều có bản Markdown cho agent.",
      },
      commit: "117af6e",
      pr: 149,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "llms.txt, an API catalog, and agent and MCP cards describe how to use the site.",
        vi: "llms.txt, API catalog cùng agent card và MCP card mô tả cách dùng trang.",
      },
      commit: "bf13c7e",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Links in story Markdown are sanitized against escaped-URL tricks.",
        vi: "Liên kết trong bản Markdown của tin được lọc để chặn các kiểu URL thoát ký tự.",
      },
      commit: "715e28a",
      pr: 184,
    },
    // Submit and translation
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "/submit keeps the form on the left and your history on the right.",
        vi: "/submit giữ form bên trái và lịch sử gửi tin bên phải.",
      },
      commit: "0a340d7",
    },
    {
      kind: "fix",
      scope: "web",
      text: {
        en: "Submitting works with a normal signed-in session, and the title is optional.",
        vi: "Gửi tin hoạt động khi đã đăng nhập bình thường, và không bắt buộc nhập tiêu đề.",
      },
      commit: "bc16dbe",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Submissions and suggestions pass a review panel before they go live.",
        vi: "Tin gửi lên và gợi ý bản dịch đều qua nhóm đánh giá trước khi hiển thị.",
      },
      commit: "1b2e0e9",
      pr: 295,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Translation moved to Gemini 3.5 Flash.",
        vi: "Phần dịch chuyển sang Gemini 3.5 Flash.",
      },
      commit: "a720ef0",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "A second model reviews each translation for meaning.",
        vi: "Một model thứ hai rà lại nghĩa của từng bản dịch.",
      },
      commit: "0dbf371",
      pr: 158,
    },
    // Sources
    {
      kind: "feature",
      scope: "sources",
      text: {
        en: "New sources: xAI news, Google DeepMind, and the AWS ML blog.",
        vi: "Nguồn mới: tin của xAI, Google DeepMind và blog AWS ML.",
      },
      commit: "a4f58be",
      pr: 80,
    },
    {
      kind: "feature",
      scope: "sources",
      text: {
        en: "Seven new RSS sources, plus the MarketBrief AI hub.",
        vi: "Thêm bảy nguồn RSS, cùng chuyên trang AI của MarketBrief.",
      },
      commit: "8fe5997",
    },
    {
      kind: "feature",
      scope: "sources",
      text: {
        en: "More verified news sources, each with its own health tracking.",
        vi: "Thêm nhiều nguồn tin đã xác minh, mỗi nguồn được theo dõi tình trạng riêng.",
      },
      commit: "dda036f",
      pr: 241,
    },
    {
      kind: "feature",
      scope: "sources",
      text: {
        en: "arXiv papers, with a cap so they cannot flood the feed.",
        vi: "Thêm bài báo từ arXiv, có giới hạn để không tràn bảng tin.",
      },
      commit: "5235a46",
      pr: 286,
    },
    {
      kind: "feature",
      scope: "sources",
      text: {
        en: "Lobsters filtered by tag, and Hacker News by points.",
        vi: "Lọc Lobsters theo tag và Hacker News theo điểm.",
      },
      commit: "242c932",
      pr: 294,
    },
    // Data page
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The Data page was redesigned, with tabs for runs, sources, models, and the ranking algorithm.",
        vi: "Trang Dữ liệu được thiết kế lại, có các tab lượt chạy, nguồn, model và thuật toán xếp hạng.",
      },
      commit: "2b63ced",
      pr: 205,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The Data page loads instantly and fills each card as its numbers arrive.",
        vi: "Trang Dữ liệu hiện khung ngay và điền từng thẻ khi số liệu về tới.",
      },
      commit: "a3130cd",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "An Audience tab shows a snapshot of site traffic.",
        vi: "Tab Audience cho xem nhanh lượng người đọc.",
      },
      commit: "c8eb48b",
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The footer shows when the feed last updated, with a health dot linked to the latest run.",
        vi: "Footer cho biết bảng tin cập nhật lúc nào, kèm chấm tình trạng dẫn tới lượt chạy gần nhất.",
      },
      commit: "cfc876e",
      pr: 265,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "A public changelog at /changelog.",
        vi: "Nhật ký thay đổi công khai tại /changelog.",
      },
      commit: "542b676",
    },
    // Speed
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "The homepage renders with about three database round trips.",
        vi: "Trang chủ hiển thị chỉ với khoảng ba lượt truy vấn cơ sở dữ liệu.",
      },
      commit: "41ed437",
      pr: 130,
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "Sign-in code loads after the page, not before it.",
        vi: "Phần đăng nhập tải sau khi trang đã hiện, không chặn trang nữa.",
      },
      commit: "4c189f1",
      pr: 132,
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "Pages you already opened come back from a local cache.",
        vi: "Trang đã mở sẽ hiện lại ngay từ bộ nhớ đệm trên máy.",
      },
      commit: "f060469",
      pr: 126,
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "Self-hosted fonts and smaller thumbnails make phones paint faster.",
        vi: "Phông chữ tự lưu trữ và ảnh nhỏ gọn hơn giúp điện thoại hiện trang nhanh hơn.",
      },
      commit: "9caafe6",
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "The main text paints sooner and no longer jumps when fonts load.",
        vi: "Phần chữ chính hiện sớm hơn và không còn nhảy khi phông chữ tải xong.",
      },
      commit: "b476a14",
      pr: 243,
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "Critical CSS is inlined so the first paint needs no extra request.",
        vi: "CSS cần thiết được nhúng sẵn nên lần hiển thị đầu không phải chờ thêm yêu cầu nào.",
      },
      commit: "bea5b44",
      pr: 291,
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "The AI;DR wordmark no longer shifts while the page loads.",
        vi: "Chữ AI;DR không còn bị xê dịch khi trang đang tải.",
      },
      commit: "9b16fef",
      pr: 303,
    },
    {
      kind: "perf",
      scope: "web",
      text: {
        en: "The Data page loads each section on its own.",
        vi: "Trang Dữ liệu tải riêng từng phần.",
      },
      commit: "5a08809",
      pr: 122,
    },
  ],
};
