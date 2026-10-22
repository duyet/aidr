/**
 * Reader-facing notes that have no release page of their own: the Chrome
 * extension's own history, and site changes shipped before the first tagged
 * release (v0.1.0 covers 2026-09-07 onward). Listed on /release under the
 * versions. Newest first.
 */
import type { Bilingual, ReleaseImage } from "../../lib/releases/types";

export interface EarlierEntry {
  date: string;
  text: Bilingual;
  image?: ReleaseImage;
}

export const EXTENSION_ENTRIES: EarlierEntry[] = [
  {
    date: "2026-10",
    text: {
      en: "The new tab matches the website again: five density steps with the middle as default, story rows with votes, category and time in aligned columns, and an image/text switch that shows the day card at full width.",
      vi: "Tab mới lại giống trang web, với năm mức mật độ (mặc định mức giữa), dòng tin có phiếu bầu, chuyên mục và thời gian thẳng cột, cùng nút chuyển ảnh/chữ để xem ảnh tóm tắt trải hết chiều ngang.",
    },
  },
  {
    date: "2026-10",
    text: {
      en: "The new tab opens on the day's date, previews that day's card, and links each day to its archive. The header can play the intro video, and each story shows its reader votes.",
      vi: "Tab mới mở ra đúng ngày của bản tin, có xem trước ảnh tóm tắt ngày đó, và mỗi ngày dẫn tới trang lưu trữ. Đầu trang có nút phát video giới thiệu, còn mỗi tin hiện số phiếu của bạn đọc.",
    },
  },
  {
    date: "2026-09",
    text: {
      en: "New tab matches the live homepage, with day-grouped stories, header actions, footer and the same reader fonts.",
      vi: "Tab mới giống trang chủ, có tin xếp theo ngày, các nút trên đầu trang, chân trang và cùng phông chữ đọc tin.",
    },
    image: {
      src: "/releases/v0.1.0/chrome-new-tab.webp",
      width: 1080,
      height: 570,
      alt: {
        en: "The Chrome tab on Get AI;DR. The extension card has a Chrome Web Store button beside a preview of the new tab page.",
        vi: "Thẻ Chrome trên trang Nhận AI;DR. Khung tiện ích có nút Chrome Web Store, bên cạnh là bản xem trước tab mới.",
      },
    },
  },
  {
    date: "2026-09",
    text: {
      en: "New AI;DR logo on the extension icon and a clearer branded new-tab header.",
      vi: "Biểu tượng tiện ích dùng logo AI;DR mới, đầu trang của tab mới cũng mang nhận diện rõ hơn.",
    },
  },
  {
    date: "2026-09",
    text: {
      en: "Ready for Chrome Web Store listing and automatic updates once published.",
      vi: "Sẵn sàng lên Chrome Web Store, đăng xong là tự cập nhật.",
    },
  },
  {
    date: "2026-09",
    text: {
      en: "New tab matches the live homepage AI;DR layout, with a clearer install guide.",
      vi: "Tab mới theo đúng bố cục AI;DR trên trang chủ, hướng dẫn cài cũng rõ hơn.",
    },
  },
  {
    date: "2026-08",
    text: {
      en: "First Chrome new-tab extension. Open a new tab to see today's AI;DR and top stories.",
      vi: "Ra mắt tiện ích tab mới cho Chrome. Mở tab mới là thấy AI;DR và các tin đầu trong ngày.",
    },
  },
];

export const EARLIER_ENTRIES: EarlierEntry[] = [
  {
    date: "2026-08",
    text: {
      en: "AI;DR bullets stay short (two lines) and highlight model and company names in the same colors as the feed.",
      vi: "Mỗi ý trong AI;DR gói trong hai dòng, tô màu tên model và tên công ty giống bảng tin.",
    },
  },
  {
    date: "2026-08",
    text: {
      en: "Each AI;DR bullet shows a small story image on the right when one is available.",
      vi: "Ý nào trong AI;DR có ảnh thì hiện ảnh nhỏ bên phải.",
    },
  },
  {
    date: "2026-08",
    text: {
      en: "Pick the font, size, spacing, background and which sections you see. Your browser saves the choice.",
      vi: "Tự chọn phông chữ, cỡ chữ, khoảng cách, màu nền và mục nào hiện. Trình duyệt sẽ lưu lại lựa chọn.",
    },
  },
  {
    date: "2026-08",
    text: {
      en: "Stories show key sources, a thumbnail when available, and longer multi-paragraph summaries.",
      vi: "Mỗi tin có các nguồn chính, ảnh thu nhỏ nếu có, và tóm tắt dài hơn, nhiều đoạn.",
    },
  },
  {
    date: "2026-06",
    text: {
      en: "Email digest so you can follow the feed in your inbox.",
      vi: "Có bản tin email, theo dõi tin ngay trong hộp thư.",
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
