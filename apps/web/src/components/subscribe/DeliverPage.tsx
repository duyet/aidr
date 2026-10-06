import {
  Badge,
  Button,
  CardFooter,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@aidr/ui";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Mail, Send } from "lucide-react";
import { type DeliverTab, parseDeliverTab } from "../../lib/deliver-tab";
import { useLang } from "../../lib/lang-context";
import { RSS_FEED_PATH } from "../../lib/site";
import { ChromeMark } from "../header/ChromeMark";
import { ChromeChannel } from "./ChromeChannel";
import { EmailChannel } from "./EmailChannel";
import { TelegramChannel } from "./TelegramChannel";

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
    <div className="mx-auto w-full max-w-6xl space-y-10 py-12">
      {/* The heading keeps a readable measure; the channel rows below it need
          the full width for the controls/preview pair. */}
      <div className="max-w-3xl space-y-5">
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
            <ChromeMark className="size-4" aria-hidden />
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

        <TabsContent value="chrome" className="mt-8">
          <ChromeChannel lang={lang} />
        </TabsContent>

        <TabsContent value="telegram" className="mt-8">
          <TelegramChannel lang={lang} />
        </TabsContent>

        <TabsContent value="email" className="mt-8">
          <EmailChannel lang={lang} />
        </TabsContent>
      </Tabs>

      <p className="max-w-3xl text-sm text-muted-foreground">
        {t("Prefer your own reader? ", "Thích dùng trình đọc riêng? ")}
        <a
          href={`${RSS_FEED_PATH}?lang=${lang}`}
          rel="alternate"
          type="application/rss+xml"
          className="font-medium text-foreground underline underline-offset-4"
        >
          {t("Subscribe to the RSS feed", "Đăng ký bản tin RSS")}
        </a>
        {t(
          " — the same ranked stories, in any reader.",
          " — cùng những tin đã xếp hạng, trong mọi trình đọc."
        )}
      </p>

      <CardFooter className="gap-2 px-0">
        <Button variant="outline" asChild>
          <Link to="/" search={{ lang }}>
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
