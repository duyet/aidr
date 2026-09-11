import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useLang } from "../lib/lang-context";
import { pageHead } from "../lib/seo";

interface ChangelogEntry {
  date: string;
  en: string;
  vi: string;
}

const WEBSITE_ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-09",
    en: "The site and favicon use the full AI;DR wordmark. Chrome zip downloads always follow the latest extension release.",
    vi: "Site và favicon dùng wordmark AI;DR đầy đủ. Tải zip Chrome luôn theo bản extension mới nhất.",
  },
  {
    date: "2026-09",
    en: "Sign-in works more reliably. Suggest a translation while signed out, find Privacy and Terms in the footer, and switch light/dark mode from the Aa text panel.",
    vi: "Đăng nhập ổn định hơn. Gợi ý bản dịch khi chưa đăng nhập, tìm Privacy và Terms ở footer, và đổi sáng/tối trong bảng Aa.",
  },
  {
    date: "2026-08",
    en: "AI;DR bullets stay short (two lines) and highlight model and company names in the same colors as the feed.",
    vi: "Mỗi gạch đầu dòng AI;DR gọn trong hai dòng và tô màu tên model/công ty giống bảng tin.",
  },
  {
    date: "2026-08",
    en: "Each AI;DR bullet shows a small story image on the right when one is available.",
    vi: "Mỗi gạch đầu dòng AI;DR có ảnh nhỏ bên phải khi tin có hình.",
  },
  {
    date: "2026-08",
    en: "Customize reading: font, size, spacing, background, and which sections you see — saved in your browser.",
    vi: "Tuỳ chỉnh đọc tin: font, cỡ chữ, khoảng cách, nền, và các mục hiện/ẩn — lưu trên trình duyệt của bạn.",
  },
  {
    date: "2026-08",
    en: "Stories show key sources, a thumbnail when available, and longer multi-paragraph summaries.",
    vi: "Mỗi tin có nguồn chính, ảnh minh hoạ (nếu có), và tóm tắt nhiều đoạn.",
  },
  {
    date: "2026-06",
    en: "Email digest so you can follow the feed in your inbox.",
    vi: "Bản tin email để theo dõi tin trong hộp thư.",
  },
  {
    date: "2026-05",
    en: "Launch: fresh AI news hourly, a daily AI;DR, and English/Vietnamese for every story.",
    vi: "Ra mắt: tin AI cập nhật theo giờ, AI;DR hằng ngày, và bản Anh/Việt cho mọi tin.",
  },
];

const EXTENSION_ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-09",
    en: "New tab matches the live homepage: day-grouped stories, header actions, footer, and the same reader fonts.",
    vi: "Tab mới khớp trang chủ: tin theo ngày, nút trên header, footer, và cùng phông chữ đọc tin.",
  },
  {
    date: "2026-09",
    en: "New AI;DR logo on the extension icon and a clearer branded new-tab header.",
    vi: "Logo AI;DR mới trên icon tiện ích và header tab mới rõ brand hơn.",
  },
  {
    date: "2026-09",
    en: "Ready for Chrome Web Store listing and automatic updates once published.",
    vi: "Sẵn sàng lên Chrome Web Store và tự cập nhật sau khi phát hành.",
  },
  {
    date: "2026-09",
    en: "New tab matches the live homepage AI;DR layout, with a clearer install guide.",
    vi: "Tab mới khớp layout AI;DR trên trang chủ, kèm hướng dẫn cài rõ hơn.",
  },
  {
    date: "2026-08",
    en: "First Chrome new-tab extension: open a new tab to see today’s AI;DR and top stories.",
    vi: "Tiện ích tab mới Chrome đầu tiên: mở tab mới để xem AI;DR và tin nổi bật trong ngày.",
  },
];

export const Route = createFileRoute("/changelog")({
  head: () =>
    pageHead({
      path: "/changelog",
      title: "Changelog | AI News",
    }),
  component: ChangelogPage,
});

function EntryList({ entries }: { entries: ChangelogEntry[] }): ReactElement {
  const lang = useLang();
  return (
    <ol className="not-typeset mt-4 space-y-6 border-l border-border pl-5">
      {entries.map((entry) => (
        <li key={entry.en} className="relative">
          <span className="absolute -left-[23px] top-1.5 h-2 w-2 rounded-full bg-accent" />
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {entry.date}
          </div>
          <p className="mt-1 text-base leading-relaxed">
            {lang === "vi" ? entry.vi : entry.en}
          </p>
        </li>
      ))}
    </ol>
  );
}

function ChangelogPage(): ReactElement {
  const lang = useLang();
  const vi = lang === "vi";

  return (
    <div className="typeset typeset-page py-12">
      <h1>{vi ? "Nhật ký thay đổi" : "Changelog"}</h1>
      <p className="text-muted-foreground">
        {vi
          ? "Những thay đổi đáng chú ý cho người đọc. Danh sách này không đầy đủ."
          : "Notable changes for readers. This list is not exhaustive."}
      </p>

      <section id="website" className="mt-8 scroll-mt-20">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Website
        </h2>
        <EntryList entries={WEBSITE_ENTRIES} />
      </section>

      <section id="chrome-extension" className="mt-10 scroll-mt-20">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {vi ? "Tiện ích Chrome" : "Chrome extension"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {vi ? (
            <>
              Hướng dẫn cài đặt tại <Link to="/subscribe">/subscribe</Link>.
            </>
          ) : (
            <>
              Install guide at <Link to="/subscribe">/subscribe</Link>.
            </>
          )}
        </p>
        <EntryList entries={EXTENSION_ENTRIES} />
      </section>
    </div>
  );
}
