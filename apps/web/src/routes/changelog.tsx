import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useLang } from "../lib/lang-context";

interface ChangelogEntry {
  date: string;
  en: string;
  vi: string;
}

const WEBSITE_ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-09",
    en: "Clerk sign-in proxied on-site (/__clerk), suggest-as-guest CTA, footer legal links (Privacy / Terms), and dark mode moved into the Aa reader panel.",
    vi: "Đăng nhập Clerk qua proxy trên site (/__clerk), CTA gợi ý khi chưa đăng nhập, footer pháp lý (Privacy / Terms), và chuyển dark mode vào bảng Aa.",
  },
  {
    date: "2026-08",
    en: "AI;DR bullets are a 2-line digest (truncated with an ellipsis) and highlight model and org names in the same topic colors as the feed.",
    vi: "Mỗi gạch đầu dòng AI;DR là bản tóm tắt 2 dòng (cắt bằng dấu ba chấm khi dài hơn) và tô màu tên model/tổ chức giống bảng tin.",
  },
  {
    date: "2026-08",
    en: "AI;DR bullets show a small story thumbnail on the right (or the site mark when a story has no image).",
    vi: "Mỗi gạch đầu dòng AI;DR có ảnh thumbnail nhỏ bên phải (hoặc logo trang nếu tin chưa có ảnh).",
  },
  {
    date: "2026-08",
    en: "Added a reader-preferences panel (font, text size, density, background, and section visibility), saved to your browser.",
    vi: "Thêm bảng tuỳ chỉnh hiển thị (font chữ, cỡ chữ, mật độ, màu nền, ẩn/hiện từng mục), lưu trên trình duyệt của bạn.",
  },
  {
    date: "2026-08",
    en: "Story cards now show key sources and a thumbnail image when available, plus multi-paragraph summaries.",
    vi: "Mỗi tin hiển thị nguồn chính và ảnh minh hoạ (nếu có), cùng tóm tắt nhiều đoạn.",
  },
  {
    date: "2026-06",
    en: "Launched an email digest and an MCP server so agents and inboxes can consume the feed directly.",
    vi: "Ra mắt bản tin email và MCP server để agent và hộp thư có thể đọc tin trực tiếp.",
  },
  {
    date: "2026-05",
    en: "Initial launch: an hourly ingestion pipeline, a daily AI;DR summary, and English/Vietnamese translations for every story.",
    vi: "Ra mắt lần đầu: pipeline thu thập tin theo giờ, tóm tắt AI;DR hằng ngày, và bản dịch song ngữ Anh/Việt cho từng tin.",
  },
];

const EXTENSION_ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-09",
    en: "v0.1.3 — Chrome Web Store auto-update prep and first-review checklist.",
    vi: "v0.1.3 — Chuẩn bị auto-update Chrome Web Store và checklist review lần đầu.",
  },
  {
    date: "2026-09",
    en: "v0.1.2 — New tab matches the live homepage AI;DR layout; public /aidr.zip and load-unpacked guide at /extension.",
    vi: "v0.1.2 — Tab mới khớp layout AI;DR trên trang chủ; công khai /aidr.zip và hướng dẫn Load unpacked tại /extension.",
  },
  {
    date: "2026-08",
    en: "v0.1.1 — First Chrome new-tab extension: unzip /aidr.zip, then Load unpacked the aidr folder (not the zip).",
    vi: "v0.1.1 — Tiện ích tab mới Chrome đầu tiên: giải nén /aidr.zip, rồi Load unpacked thư mục aidr (không phải file zip).",
  },
];

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [{ title: "Changelog | AI News" }],
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
    <div className="typeset typeset-page py-6">
      <h1>{vi ? "Nhật ký thay đổi" : "Changelog"}</h1>
      <p className="text-muted-foreground">
        {vi
          ? "Những thay đổi đáng chú ý của website và tiện ích Chrome. Danh sách này được viết tay và không đầy đủ."
          : "Notable changes to the website and Chrome extension. This list is hand-written and not exhaustive."}
      </p>

      <section id="website" className="mt-8 scroll-mt-20">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Website
        </h2>
        <EntryList entries={WEBSITE_ENTRIES} />
      </section>

      <section id="chrome-extension" className="mt-10 scroll-mt-20">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {vi ? "Tiện ích Chrome" : "Chrome extension"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {vi ? (
            <>
              Cài đặt và hướng dẫn tại <Link to="/extension">/extension</Link>.
            </>
          ) : (
            <>
              Install and setup guide at <Link to="/extension">/extension</Link>
              .
            </>
          )}
        </p>
        <EntryList entries={EXTENSION_ENTRIES} />
      </section>

      <p className="mt-10 text-muted-foreground">
        {vi
          ? "Xem toàn bộ lịch sử commit trên "
          : "See the full commit history on "}
        <a
          href="https://github.com/duyet/aidr/commits/master"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        .
      </p>
    </div>
  );
}
