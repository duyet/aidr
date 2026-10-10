import type { Release } from "../../lib/releases/types";

export const release: Release = {
  version: "0.1.13",
  date: "2026-10-09",
  from: "2026-10-09",
  to: "2026-10-09",
  compare: { base: "web-v0.1.12", head: "web-v0.1.13" },
  title: {
    en: "Read it your way",
    vi: "Đọc theo cách của bạn",
  },
  intro: {
    en: "Pick how dense the page feels, from five steps that start in the middle. Story rows now keep votes, category and time in their own columns, and one tap switches the AI;DR digest between the day card and the text list. Every release also gets its own page, with a film in English and Vietnamese.",
    vi: "Chọn độ dày của trang trong năm mức, mặc định ở giữa. Các dòng tin giờ xếp phiếu bầu, chuyên mục và thời gian thành cột riêng, và một chạm là chuyển AI;DR giữa ảnh tóm tắt và danh sách chữ. Mỗi bản phát hành cũng có trang riêng, kèm video tiếng Anh và tiếng Việt.",
  },
  stats: [
    { value: "5", label: { en: "density steps", vi: "mức mật độ" } },
    { value: "3", label: { en: "features", vi: "tính năng" } },
    {
      value: "4",
      label: {
        en: "films for every release",
        vi: "video cho mỗi bản phát hành",
      },
    },
  ],
  youtubeId: "eFMCYxnDi0c",
  youtubeIdVi: "74DYPQNXoeE",
  cover: {
    src: "/releases/v0.1.13/cover.webp",
    width: 1440,
    height: 900,
    alt: {
      en: "The homepage with the AI;DR digest switched to image view: the day card for Saturday, Oct 10, 2026 at full width.",
      vi: "Trang chủ với AI;DR ở chế độ ảnh: ảnh tóm tắt thứ Bảy, 10/10/2026 trải toàn bộ chiều rộng.",
    },
  },
  highlights: [
    {
      label: { en: "Five density steps", vi: "Năm mức mật độ" },
      text: {
        en: "Open Aa → Theme and drag Density from dense to spacious. It starts at medium, in the middle, and changes row padding and line height together.",
        vi: "Mở Aa → Giao diện và kéo Mật độ từ dày đến thoáng. Mặc định ở mức giữa, và mỗi mức đổi cùng lúc khoảng cách giữa các dòng và độ giãn dòng.",
      },
      image: {
        src: "/releases/v0.1.13/density.webp",
        width: 536,
        height: 840,
        alt: {
          en: "The reader preferences panel: light and dark, sans and serif, a text size slider, the Density slider in the middle, and background colors.",
          vi: "Bảng tuỳ chỉnh hiển thị: sáng và tối, không chân và có chân, thanh cỡ chữ, thanh Mật độ ở giữa, và màu nền.",
        },
      },
      href: "/",
    },
    {
      label: { en: "Rows that line up", vi: "Dòng tin thẳng hàng" },
      text: {
        en: "Votes, category and time each sit in their own column on the first line of a story, so you can scan down the list. The vote arrows and count are smaller and stay level with the headline.",
        vi: "Phiếu bầu, chuyên mục và thời gian nằm ở cột riêng trên dòng đầu của mỗi tin, để bạn lướt dọc danh sách dễ hơn. Mũi tên và số phiếu nhỏ gọn hơn và luôn ngang với tiêu đề.",
      },
      image: {
        src: "/releases/v0.1.13/story-rows.webp",
        width: 1080,
        height: 472,
        alt: {
          en: "Ranked story rows with vote arrows, a category column and a time column lined up on the right.",
          vi: "Các dòng tin xếp hạng với mũi tên bình chọn, cột chuyên mục và cột thời gian thẳng hàng bên phải.",
        },
      },
      href: "/",
    },
    {
      label: { en: "Image or text, one tap", vi: "Ảnh hay chữ, một chạm" },
      text: {
        en: "Two icons in the yellow masthead switch the AI;DR digest between the day card and the numbered text list. The card view shows the day's top six at full width, and the choice is remembered.",
        vi: "Hai biểu tượng trên phần đầu màu vàng chuyển AI;DR giữa ảnh tóm tắt và danh sách chữ đánh số. Chế độ ảnh hiện sáu tin nổi bật trong ngày ở toàn bộ chiều rộng, và lựa chọn của bạn được ghi nhớ.",
      },
      image: {
        src: "/releases/v0.1.13/day-card-switch.webp",
        width: 1080,
        height: 702,
        alt: {
          en: "The AI;DR masthead with the image icon selected and the day card below it at full width.",
          vi: "Phần đầu AI;DR với biểu tượng ảnh đang chọn và ảnh tóm tắt bên dưới, trải toàn bộ chiều rộng.",
        },
      },
      href: "/",
    },
    {
      label: { en: "Release notes", vi: "Ghi chú phát hành" },
      text: {
        en: "aidr.today/release lists every version, newest first, and each one has a page with highlights, screenshots, the full changelog and a short film in English and Vietnamese. The site footer links to it, and the old /changelog address redirects there.",
        vi: "aidr.today/release liệt kê mọi phiên bản, mới nhất trước, và mỗi phiên bản có trang riêng với điểm nổi bật, ảnh chụp, toàn bộ thay đổi và một video ngắn tiếng Anh và tiếng Việt. Chân trang có liên kết tới đây, và địa chỉ /changelog cũ chuyển về đây.",
      },
      image: {
        src: "/releases/v0.1.13/release-list.webp",
        width: 1080,
        height: 1022,
        alt: {
          en: "The Release notes page listing v0.1.12 and v0.1.0, each with dates, a Film badge, a summary and a video thumbnail.",
          vi: "Trang Ghi chú phát hành liệt kê v0.1.12 và v0.1.0, mỗi bản có ngày, nhãn Phim, tóm tắt và ảnh video.",
        },
      },
      href: "/release",
    },
    {
      label: { en: "The Chrome new tab, too", vi: "Cả tab mới trên Chrome" },
      text: {
        en: "The extension's new tab got the same density steps, aligned rows and image/text switch. Its Chrome Web Store page has new screenshots in English and Vietnamese.",
        vi: "Tab mới của tiện ích có cùng năm mức mật độ, dòng tin thẳng hàng và nút chuyển ảnh/chữ. Trang Chrome Web Store của tiện ích có ảnh chụp mới bằng tiếng Anh và tiếng Việt.",
      },
      image: {
        src: "/releases/v0.1.13/extension-new-tab.webp",
        width: 1080,
        height: 675,
        alt: {
          en: "The AI;DR Chrome new tab showing the day card at full width above the day's stories.",
          vi: "Tab mới AI;DR trên Chrome hiện ảnh tóm tắt toàn chiều rộng phía trên các tin trong ngày.",
        },
      },
      href: "https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg",
    },
  ],
  changes: [
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Five density steps, from dense to spacious, with medium as the default.",
        vi: "Năm mức mật độ, từ dày đến thoáng, mặc định ở mức giữa.",
      },
      commit: "d49fc1b",
      pr: 485,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Story rows keep votes, category and time in aligned columns, with smaller vote controls.",
        vi: "Dòng tin xếp phiếu bầu, chuyên mục và thời gian thành cột thẳng hàng, nút bình chọn gọn hơn.",
      },
      commit: "d49fc1b",
      pr: 485,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "An image/text switch in the AI;DR masthead replaces the day card chip.",
        vi: "Nút chuyển ảnh/chữ trên phần đầu AI;DR thay cho nút xem ảnh tóm tắt cũ.",
      },
      commit: "d49fc1b",
      pr: 485,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "The day card view takes the full width of the digest instead of covering it.",
        vi: "Chế độ ảnh tóm tắt chiếm toàn bộ chiều rộng của AI;DR thay vì đè lên danh sách.",
      },
      commit: "ed6696c",
      pr: 489,
    },
    {
      kind: "feature",
      scope: "web",
      text: {
        en: "Release notes at /release, one page per version with its film; /changelog redirects there and the footer links it.",
        vi: "Ghi chú phát hành tại /release, mỗi phiên bản một trang kèm video; /changelog chuyển về đây và chân trang có liên kết.",
      },
      commit: "92a077b",
      pr: 491,
    },
    {
      kind: "feature",
      scope: "extension",
      text: {
        en: "The new tab matches the site: density steps, aligned rows and the image/text switch.",
        vi: "Tab mới giống trang web: các mức mật độ, dòng tin thẳng hàng và nút chuyển ảnh/chữ.",
      },
      commit: "d49fc1b",
      pr: 485,
    },
    {
      kind: "feature",
      scope: "extension",
      text: {
        en: "New Chrome Web Store screenshots and promo tiles in English and Vietnamese.",
        vi: "Ảnh chụp và ảnh quảng bá mới trên Chrome Web Store, bằng tiếng Anh và tiếng Việt.",
      },
      commit: "ed6696c",
      pr: 489,
    },
  ],
};
