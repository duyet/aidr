import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { RiChromeLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Languages,
  Lock,
  Mail,
  Newspaper,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { type DeliverTab, parseDeliverTab } from "../../lib/deliver-tab";
import { EXTENSION_VERSION } from "../../lib/extension-release";
import { useLang } from "../../lib/lang-context";
import {
  CHROME_WEB_STORE_URL,
  TELEGRAM_HANDLE,
  TELEGRAM_URL,
} from "../../lib/site";
import type { Lang } from "../../lib/types";
import { EmailSubscribeForm } from "../EmailSubscribeForm";
import { HighlightedText } from "../HighlightedText";

export function DeliverPage({
  tab,
  onTabChange,
}: {
  tab: DeliverTab;
  onTabChange: (tab: DeliverTab) => void;
}) {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 py-12">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 rounded-full">
            {t("How you get AI;DR", "Cách nhận AI;DR")}
          </Badge>
        </div>
        <div className="space-y-3">
          <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground">
            {t("Get AI;DR delivered", "Nhận AI;DR")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t(
              "Same ranked feed. Chrome new tab, Telegram, or email digest — pick any, or all three.",
              "Cùng bảng tin đã xếp hạng. Tab mới Chrome, Telegram, hoặc email — chọn một, hoặc cả ba."
            )}
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(next) => onTabChange(parseDeliverTab(next))}
        className="w-full"
      >
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1">
          <TabsTrigger
            value="chrome"
            className="h-11 gap-2 text-sm sm:text-base"
          >
            <RiChromeLine className="size-4" aria-hidden />
            Chrome
          </TabsTrigger>
          <TabsTrigger
            value="telegram"
            className="h-11 gap-2 text-sm sm:text-base"
          >
            <Send className="size-4" aria-hidden />
            Telegram
          </TabsTrigger>
          <TabsTrigger
            value="email"
            className="h-11 gap-2 text-sm sm:text-base"
          >
            <Mail className="size-4" aria-hidden />
            Email
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chrome" className="mt-6 space-y-6">
          <div className="flex items-center gap-4">
            <img
              src="/media/extension-icon.png"
              alt=""
              width={56}
              height={56}
              className="size-14 rounded-2xl border border-border"
            />
            <div className="space-y-1">
              <p className="font-medium leading-tight">aidr</p>
              <p className="text-sm text-muted-foreground">
                {t(
                  `Chrome extension · v${EXTENSION_VERSION}`,
                  `Tiện ích Chrome · v${EXTENSION_VERSION}`
                )}
              </p>
            </div>
          </div>
          <p className="text-base leading-relaxed text-muted-foreground">
            {t(
              "Replace Chrome's new tab with today's AI;DR and top stories from aidr.today. Install from the Chrome Web Store.",
              "Thay tab mới của Chrome bằng AI;DR hôm nay và tin nổi bật từ aidr.today. Cài đặt từ Chrome Web Store."
            )}
          </p>
          <Button size="lg" asChild>
            <a
              href={CHROME_WEB_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("nav_click", { to: "chrome_web_store" })}
            >
              <RiChromeLine className="mr-2 size-5" aria-hidden />
              {t("Chrome Web Store", "Chrome Web Store")}
            </a>
          </Button>
          <BrowserFrame tab="New Tab" address="chrome://newtab">
            <NewTabMock lang={lang} />
          </BrowserFrame>
          <p className="text-xs text-muted-foreground">
            {t(
              "Illustrative layout — the new tab shows the live aidr.today feed.",
              "Bố cục minh họa — tab mới hiển thị bảng tin aidr.today trực tiếp."
            )}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              {
                icon: Newspaper,
                en: "Every new tab opens today's AI;DR and the ranked feed.",
                vi: "Mỗi tab mới mở AI;DR hôm nay và bảng tin đã xếp hạng.",
              },
              {
                icon: SlidersHorizontal,
                en: "Reorder, hide, or add sections — Daily feed, Trending, AI;DR, Categories.",
                vi: "Sắp xếp, ẩn hoặc thêm mục — Daily feed, Trending, AI;DR, Categories.",
              },
              {
                icon: Languages,
                en: "Works in English and Vietnamese.",
                vi: "Hỗ trợ tiếng Anh và tiếng Việt.",
              },
              {
                icon: ShieldCheck,
                en: "No account. Only the storage permission; connects to aidr.today only.",
                vi: "Không cần tài khoản. Chỉ cần quyền storage; chỉ kết nối tới aidr.today.",
              },
            ].map((f, i) => (
              <li
                key={f.en}
                className="animate-in fade-in-0 slide-in-from-bottom-1 flex items-start gap-2.5 text-sm text-muted-foreground duration-500"
                style={{
                  animationDelay: `${i * 70}ms`,
                  animationFillMode: "backwards",
                }}
              >
                <f.icon
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden
                />
                <span>{t(f.en, f.vi)}</span>
              </li>
            ))}
          </ul>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <RefreshCw className="size-4" aria-hidden />
                {t("Updates", "Cập nhật")}
              </CardTitle>
              <CardDescription>
                {t(
                  "The Chrome Web Store version auto-updates automatically when new versions are published.",
                  "Phiên bản Chrome Web Store tự động cập nhật khi có phiên bản mới."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
              <span>
                {t(
                  "Install from the Chrome Web Store for automatic updates.",
                  "Cài đặt từ Chrome Web Store để có cập nhật tự động."
                )}
              </span>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="telegram" className="mt-6 space-y-6">
          <p className="text-base leading-relaxed text-muted-foreground">
            {t(
              "Get the same ranked AI news in Telegram. Open the public channel — no Chrome install required.",
              "Nhận cùng tin AI đã xếp hạng trên Telegram. Mở kênh công khai — không cần cài Chrome."
            )}
          </p>
          <Button size="lg" asChild>
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("nav_click", { to: "telegram" })}
            >
              <Send className="mr-2 size-5" aria-hidden />
              {t(`Open ${TELEGRAM_HANDLE}`, `Mở ${TELEGRAM_HANDLE}`)}
            </a>
          </Button>
        </TabsContent>

        <TabsContent value="email" className="mt-6 space-y-6">
          <p className="text-base leading-relaxed text-muted-foreground">
            {t(
              "Daily digest by email. No account required — you can link one later.",
              "Bản tin hằng ngày qua email. Không cần tài khoản — có thể liên kết sau."
            )}
          </p>
          <EmailSubscribeForm lang={lang} source="extension" />
          <DigestPreview lang={lang} />
        </TabsContent>
      </Tabs>

      <CardFooter className="gap-2 px-0">
        <Button variant="outline" asChild>
          <Link to="/">
            {t("Back to the feed", "Về bảng tin")}
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/privacy">{t("Privacy", "Quyền riêng tư")}</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/terms">{t("Terms", "Điều khoản")}</Link>
        </Button>
      </CardFooter>
    </div>
  );
}

function BrowserFrame({
  tab,
  address,
  children,
}: {
  tab: string;
  address: string;
  children: ReactNode;
}) {
  return (
    <div
      className="animate-in fade-in-0 slide-in-from-bottom-4 zoom-in-[0.98] overflow-hidden rounded-xl border border-border bg-card shadow-md shadow-foreground/5 duration-500"
      style={{ animationFillMode: "backwards" }}
    >
      <div className="flex items-end gap-1.5 bg-muted/60 px-2.5 pt-1.5">
        <div className="flex h-7 max-w-44 items-center gap-1.5 rounded-t-lg border border-b-0 border-border bg-card px-3 text-[11px]">
          <img src="/favicon.svg" alt="" className="size-3.5" />
          <span className="truncate">{tab}</span>
          <X className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        <Plus className="mb-2 size-3.5 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex items-center gap-2.5 border-b border-border bg-card px-3 py-2">
        <div
          className="flex items-center gap-2.5 text-muted-foreground"
          aria-hidden
        >
          <ArrowLeft className="size-3.5" />
          <ArrowRight className="size-3.5" />
          <RotateCw className="size-3.5" />
        </div>
        <div className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-muted/60 px-3 text-[11px] text-muted-foreground">
          <Lock className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{address}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

const NEW_TAB_STORIES = [
  {
    en: "OpenAI ships a faster reasoning model for agents",
    vi: "OpenAI ra mắt mô hình suy luận nhanh hơn cho agent",
    src: "news.ycombinator.com",
  },
  {
    en: "Anthropic open-sources Claude interpretability tools",
    vi: "Anthropic mở mã nguồn bộ công cụ diễn giải Claude",
    src: "anthropic.com",
  },
  {
    en: "Google DeepMind brings Gemini on-device to Chrome",
    vi: "Google DeepMind đưa Gemini chạy on-device lên Chrome",
    src: "deepmind.google",
  },
  {
    en: "NVIDIA releases an open inference stack for Blackwell",
    vi: "NVIDIA phát hành stack inference mở cho Blackwell",
    src: "developer.nvidia.com",
  },
  {
    en: "Meta licenses Llama weights for commercial fine-tuning",
    vi: "Meta cấp phép trọng số Llama cho fine-tuning thương mại",
    src: "ai.meta.com",
  },
];

function NewTabMock({ lang }: { lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-lg font-medium leading-none">
            AI;DR
          </span>
          <span className="text-xs text-muted-foreground">
            {t("What's new in AI today?", "Hôm nay AI có gì mới?")}
          </span>
        </div>
        <div
          className="hidden h-6 w-32 items-center gap-1.5 rounded-full border border-border px-2.5 text-[10px] text-muted-foreground sm:flex"
          aria-hidden
        >
          <Search className="size-3" />
          {t("Search…", "Tìm kiếm…")}
        </div>
      </div>
      <p className="pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("Today", "Hôm nay")}
      </p>
      <ol>
        {NEW_TAB_STORIES.map((s, i) => (
          <li
            key={s.en}
            className="animate-in fade-in-0 slide-in-from-bottom-1 flex items-baseline gap-2.5 border-b border-border/60 py-2 duration-500 last:border-0"
            style={{
              animationDelay: `${250 + i * 100}ms`,
              animationFillMode: "backwards",
            }}
          >
            <span
              className="w-4 shrink-0 font-serif text-xs text-accent"
              aria-hidden
            >
              {i + 1}.
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">
                <HighlightedText text={t(s.en, s.vi)} tags={[]} />
              </p>
              <p className="text-[11px] text-muted-foreground">{s.src}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DigestPreview({ lang }: { lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [subject, setSubject] = useState("");
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="space-y-3 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="rounded-full">
          {t("What lands in your inbox", "Email bạn sẽ nhận")}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {t(
            "Live preview of the latest digest",
            "Bản tin mới nhất, hiển thị trực tiếp"
          )}
        </span>
      </div>
      <BrowserFrame
        tab={t("Inbox — AI;DR", "Hộp thư — AI;DR")}
        address="aidr.today/api/subscribe/preview"
      >
        <div className="space-y-1 border-b border-border px-4 py-2.5 text-sm">
          <div className="flex gap-3">
            <span className="w-16 shrink-0 text-muted-foreground">
              {t("From", "Từ")}
            </span>
            <span className="truncate">AI;DR &lt;digest@aidr.today&gt;</span>
          </div>
          <div className="flex gap-3">
            <span className="w-16 shrink-0 text-muted-foreground">
              {t("Subject", "Tiêu đề")}
            </span>
            <span className="truncate">{subject || "AI;DR"}</span>
          </div>
        </div>
        <iframe
          src={`/api/subscribe/preview?lang=${lang}`}
          title={t("Digest email preview", "Xem trước email bản tin")}
          className={`h-[560px] w-full bg-[#f7f7f5] transition-opacity duration-500 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={(e) => {
            setLoaded(true);
            const title = e.currentTarget.contentDocument?.title;
            if (title) setSubject(title);
          }}
        />
      </BrowserFrame>
      <p className="text-xs text-muted-foreground">
        {t(
          "The actual latest digest — same layout arrives each morning around 7:00 your time.",
          "Đây là bản tin mới nhất — cùng bố cục mỗi sáng khoảng 7:00 theo giờ của bạn."
        )}
      </p>
    </div>
  );
}
