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
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Mail, RefreshCw, Send } from "lucide-react";
import { EmailSubscribeForm } from "../components/EmailSubscribeForm";
import { useLang } from "../lib/lang-context";
import { pageHead } from "../lib/seo";
import {
  CHROME_WEB_STORE_URL,
  TELEGRAM_HANDLE,
  TELEGRAM_URL,
} from "../lib/site";

const TABS = ["chrome", "telegram", "email"] as const;
type DeliverTab = (typeof TABS)[number];

function parseTab(value: unknown): DeliverTab {
  return TABS.includes(value as DeliverTab) ? (value as DeliverTab) : "chrome";
}

export const Route = createFileRoute("/extension")({
  validateSearch: (search: Record<string, unknown>): { tab?: DeliverTab } =>
    typeof search.tab === "string" ? { tab: parseTab(search.tab) } : {},
  head: () =>
    pageHead({
      path: "/extension",
      title: "Get AI;DR | Chrome, Telegram, Email",
    }),
  component: ExtensionPage,
});

function ExtensionPage() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const { tab } = Route.useSearch();
  const defaultTab = parseTab(tab);

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-12">
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

      <Tabs defaultValue={defaultTab} className="w-full">
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
