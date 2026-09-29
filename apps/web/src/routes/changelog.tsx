import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import { localizedPageHead } from "../lib/seo";

interface ChangelogEntry {
  date: string;
  en: string;
  vi: string;
}

const WEBSITE_ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-09",
    en: "aidr.today is now subscribable: an RSS feed at aidr.today/feed.xml (also /rss.xml), in English and Vietnamese, plus a Google News sitemap and a sitemap that no longer drops older stories. The homepage and Get AI;DR link the feed so any reader can pick it up.",
    vi: "aidr.today giờ đã đăng ký được: bản tin RSS tại aidr.today/feed.xml (cũng là /rss.xml), có tiếng Anh và tiếng Việt, kèm sitemap Google News và sitemap không còn bỏ sót tin cũ. Trang chủ và trang Nhận AI;DR đã có liên kết tới bản tin.",
  },
  {
    date: "2026-09",
    en: "If your browser supports agent tools, this page now hands them four read-only ones: the latest AI news, a search, any single story as bounded Markdown, and the TL;DR digest. They are the same tools the MCP endpoint serves and the same bytes behind them, each labelled read-only and untrusted-content so a model treats story text as data. The /submit and email-subscribe forms are labelled too, so an agent knows what it can fill. Sign-in is deliberately not exposed — a tool that takes a password is a way to steal one. Nothing is added to the page load.",
    vi: "Nếu trình duyệt của bạn hỗ trợ công cụ cho agent, trang này giờ trao cho nó bốn công cụ chỉ-đọc: tin AI mới nhất, tìm kiếm, bất kỳ tin đơn lẻ nào ở dạng Markdown có giới hạn, và bản TL;DR. Đó là cùng bốn công cụ mà endpoint MCP phục vụ và cùng dữ liệu phía sau, mỗi cái đều được đánh dấu chỉ-đọc và nội dung- không-đáng-tin để model coi văn bản tin là dữ liệu. Form /submit và form đăng ký email cũng được dán nhãn, để agent biết mình có thể điền gì. Đăng nhập thì cố ý không mở — một công cụ nhận mật khẩu là cách đi đánh cắp mật khẩu. Không có gì được thêm vào thời gian tải trang.",
  },
  {
    date: "2026-09",
    en: "The agent instructions file now uses real links instead of bare URLs, and points at the OpenAPI document, the agent card, the MCP server card, the new AI catalog, the agent skill, and the authentication guide — so an agent can follow them rather than guess. Every endpoint answers to the same locale rules as before, and the ranking formula, the story-text trust boundary, and the submit and suggest flows are all still there.",
    vi: "File hướng dẫn cho agent giờ dùng liên kết thật thay vì URL trần, và trỏ tới tài liệu OpenAPI, agent card, MCP server card, AI catalog mới, agent skill, cùng hướng dẫn xác thực — để agent có thể bám theo thay vì phải đoán. Mọi endpoint vẫn tuân theo đúng quy tắc locale như trước, và công thức xếp hạng, ranh giới tin cậy của văn bản tin, cùng luồng submit và suggest đều vẫn còn.",
  },
  {
    date: "2026-09",
    en: "Anyone can now read aidr over MCP with no account and no API key. The endpoint publishes four read-only tools — latest AI news, search, one story as bounded Markdown, and the TL;DR digest — plus two resources, and every one of them is labelled read-only and untrusted-content so an agent treats story text as data. Operator tools (push items, manage sources, trigger an ingest run) still require an admin token, and an unauthenticated call to one is refused without revealing what else exists. Anonymous reads are rate limited per IP.",
    vi: "Giờ bất kỳ ai cũng đọc aidr qua MCP mà không cần tài khoản hay API key. Endpoint công bố bốn công cụ chỉ-đọc — tin AI mới nhất, tìm kiếm, một tin dưới dạng Markdown có giới hạn, và bản TL;DR — cùng hai tài nguyên, và mỗi công cụ đều được đánh dấu chỉ-đọc và nội dung- không-đáng-tin để agent coi văn bản tin là dữ liệu. Công cụ vận hành (đẩy tin, quản lý nguồn, chạy ingest) vẫn cần token admin, và lời gọi ẩn danh sẽ bị từ chối mà không tiết lộ còn công cụ nào khác. Lượt đọc ẩn danh bị giới hạn theo IP.",
  },
  {
    date: "2026-09",
    en: "The machine-discovery documents now tell the truth. The MCP server card lists the real read tools, the resources, the per-IP rate limit, and which tools need authorization — and no longer advertises a prompts capability the server never implemented. The agent card, the agent skill, and openapi.json were updated to match, and the /mcp page leads with what you can read for free.",
    vi: "Các tài liệu khám phá máy-móc giờ nói đúng sự thật. Server card MCP liệt kê các công cụ đọc thật, các tài nguyên, giới hạn theo IP, và công cụ nào cần xác thực — và không còn quảng bá năng lực prompts mà máy chủ chưa bao giờ triển khai. Agent card, agent skill và openapi.json đã được cập nhật khớp, và trang /mcp dẫn dắt bằng những gì bạn đọc được miễn phí.",
  },
  {
    date: "2026-09",
    en: "The Email tab on Get AI;DR shows a live preview of the latest digest — exactly what lands in your inbox. The Chrome tab now spells out what the extension does.",
    vi: "Tab Email trong Get AI;DR hiển thị bản tin mới nhất đúng như email bạn sẽ nhận. Tab Chrome giải thích rõ tiện ích làm gì.",
  },
  {
    date: "2026-09",
    en: "Story links share a branded AI;DR card with a story photo when available — and a clean fallback when a source image is missing, broken, or too large. Long headlines stay inside the card instead of running over the logo. The homepage has its own masthead card.",
    vi: "Link tin chia sẻ kèm thẻ AI;DR có ảnh minh hoạ khi có — và bố cục dự phòng gọn khi ảnh nguồn không tồn tại, hỏng, hoặc quá lớn. Tiêu đề dài vẫn nằm gọn trong thẻ thay vì đè lên logo. Trang chủ có thẻ masthead riêng.",
  },
  {
    date: "2026-09",
    en: "Header actions merged into one Get AI;DR menu: Chrome Extension, Telegram Channel (Vietnamese), Submit, Data Analytics, and Algorithms.",
    vi: "Các nút trên header gộp vào menu Get AI;DR: Chrome Extension, Telegram Channel (Vietnamese), Submit, Data Analytics và Algorithms.",
  },
  {
    date: "2026-09",
    en: "On phones, the menu opens as a near-full-screen dialog with an icon for each link.",
    vi: "Trên điện thoại, menu mở gần toàn màn hình với biểu tượng cho từng mục.",
  },
  {
    date: "2026-09",
    en: "Subscribe tabs (Chrome, Telegram, Email) keep their state in the URL, and the header menu links straight to Email Subscription.",
    vi: "Các tab Subscribe (Chrome, Telegram, Email) lưu trạng thái trong URL, và menu header có link tới Email Subscription.",
  },
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
  head: ({ match }) =>
    localizedPageHead({
      path: "/changelog",
      title: "Changelog | AI News",
      lang: match.context.lang,
      route: headRouteInput(match),
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
              Hướng dẫn cài đặt tại{" "}
              <Link to="/subscribe" search={{ lang }}>
                /subscribe
              </Link>
              .
            </>
          ) : (
            <>
              Install guide at{" "}
              <Link to="/subscribe" search={{ lang }}>
                /subscribe
              </Link>
              .
            </>
          )}
        </p>
        <EntryList entries={EXTENSION_ENTRIES} />
      </section>
    </div>
  );
}
