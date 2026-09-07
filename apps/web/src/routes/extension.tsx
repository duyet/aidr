import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { RiChromeLine } from "@remixicon/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, RefreshCw, Send } from "lucide-react";
import { useLang } from "../lib/lang-context";
import { CHROME_WEB_STORE_URL, TELEGRAM_URL } from "../lib/site";

export const Route = createFileRoute("/extension")({
  head: () => ({
    meta: [{ title: "Chrome new tab | AI News" }],
  }),
  component: ExtensionPage,
});

function ExtensionPage() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-12">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 rounded-full">
            <RiChromeLine className="size-3.5" aria-hidden />
            Manifest V3
          </Badge>
        </div>

        <div className="space-y-3">
          <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground">
            {t("Chrome new tab", "Tab mới Chrome")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t(
              "Replace Chrome's new tab with today's AI;DR and top stories from aidr.today. Install from the Chrome Web Store.",
              "Thay tab mới của Chrome bằng AI;DR hôm nay và tin nổi bật từ aidr.today. Cài đặt từ Chrome Web Store."
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          <Button variant="ghost" size="icon" asChild>
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("nav_click", { to: "telegram" })}
              aria-label="Telegram"
              title="Telegram"
            >
              <Send aria-hidden />
              <span className="sr-only">Telegram</span>
            </a>
          </Button>
        </div>
      </div>

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
        <CardFooter className="gap-2">
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
      </Card>
    </div>
  );
}
