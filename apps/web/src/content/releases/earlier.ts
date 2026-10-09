/**
 * Reader-facing notes that have no release page of their own: the Chrome
 * extension's own history, and site changes shipped before the first tagged
 * release (v0.1.0 covers 2026-09-07 onward). Listed on /release under the
 * versions. Newest first.
 */
import type { Bilingual, ReleaseImage } from "../../lib/releases/types";

export interface EarlierEntry {
  /** YYYY-MM. */
  date: string;
  text: Bilingual;
  image?: ReleaseImage;
}

export const EXTENSION_ENTRIES: EarlierEntry[] = [
  {
    date: "2026-10",
    text: {
      en: "The new tab opens on the day’s date, previews that day’s card, and links each day to its archive. The header can play the intro video, and each story shows its reader votes.",
      vi: "Tab mới mở đầu bằng ngày của bản tin, xem trước ảnh tóm tắt, và mỗi ngày dẫn tới trang lưu trữ. Header có nút xem video giới thiệu, và mỗi tin hiện số phiếu của bạn đọc.",
    },
  },
  {
    date: "2026-09",
    text: {
      en: "New tab matches the live homepage: day-grouped stories, header actions, footer, and the same reader fonts.",
      vi: "Tab mới khớp trang chủ: tin theo ngày, nút trên header, footer, và cùng phông chữ đọc tin.",
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
  },
  {
    date: "2026-09",
    text: {
      en: "New AI;DR logo on the extension icon and a clearer branded new-tab header.",
      vi: "Logo AI;DR mới trên icon tiện ích và header tab mới rõ brand hơn.",
    },
  },
  {
    date: "2026-09",
    text: {
      en: "Ready for Chrome Web Store listing and automatic updates once published.",
      vi: "Sẵn sàng lên Chrome Web Store và tự cập nhật sau khi phát hành.",
    },
  },
  {
    date: "2026-09",
    text: {
      en: "New tab matches the live homepage AI;DR layout, with a clearer install guide.",
      vi: "Tab mới khớp layout AI;DR trên trang chủ, kèm hướng dẫn cài rõ hơn.",
    },
  },
  {
    date: "2026-08",
    text: {
      en: "First Chrome new-tab extension: open a new tab to see today’s AI;DR and top stories.",
      vi: "Tiện ích tab mới Chrome đầu tiên: mở tab mới để xem AI;DR và tin nổi bật trong ngày.",
    },
  },
];

export const EARLIER_ENTRIES: EarlierEntry[] = [
  {
    date: "2026-08",
    text: {
      en: "AI;DR bullets stay short (two lines) and highlight model and company names in the same colors as the feed.",
      vi: "Mỗi gạch đầu dòng AI;DR gọn trong hai dòng và tô màu tên model/công ty giống bảng tin.",
    },
  },
  {
    date: "2026-08",
    text: {
      en: "Each AI;DR bullet shows a small story image on the right when one is available.",
      vi: "Mỗi gạch đầu dòng AI;DR có ảnh nhỏ bên phải khi tin có hình.",
    },
  },
  {
    date: "2026-08",
    text: {
      en: "Customize reading: font, size, spacing, background, and which sections you see — saved in your browser.",
      vi: "Tuỳ chỉnh đọc tin: font, cỡ chữ, khoảng cách, nền, và các mục hiện/ẩn — lưu trên trình duyệt của bạn.",
    },
  },
  {
    date: "2026-08",
    text: {
      en: "Stories show key sources, a thumbnail when available, and longer multi-paragraph summaries.",
      vi: "Mỗi tin có nguồn chính, ảnh minh hoạ (nếu có), và tóm tắt nhiều đoạn.",
    },
  },
  {
    date: "2026-06",
    text: {
      en: "Email digest so you can follow the feed in your inbox.",
      vi: "Bản tin email để theo dõi tin trong hộp thư.",
    },
  },
  {
    date: "2026-05",
    text: {
      en: "Launch: fresh AI news hourly, a daily AI;DR, and English/Vietnamese for every story.",
      vi: "Ra mắt: tin AI cập nhật theo giờ, AI;DR hằng ngày, và bản Anh/Việt cho mọi tin.",
    },
  },
];
