import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Separator,
} from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { RiChromeLine } from "@remixicon/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FolderOpen,
  RefreshCw,
  Send,
  ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  AIDR_ZIP_ERROR_IMG,
  CHROME_EXTENSIONS_HREF,
  GUIDE_COPY,
} from "../lib/aidr-guide";
import {
  AIDR_ZIP_ERROR_IMG_HEIGHT,
  AIDR_ZIP_ERROR_IMG_WIDTH,
  AIDR_ZIP_HREF,
} from "../lib/aidr-public";
import { useLang } from "../lib/lang-context";
import { CHROME_WEB_STORE_URL, TELEGRAM_URL } from "../lib/site";

export const Route = createFileRoute("/extension")({
  head: () => ({
    meta: [{ title: "Chrome new tab | AI News" }],
  }),
  component: ExtensionPage,
});

function ZipLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={AIDR_ZIP_HREF}
      download="aidr.zip"
      onClick={() => track("extension_download")}
      className={className}
    >
      {children}
    </a>
  );
}

function ChromeExtensionsLink() {
  return (
    <a
      href={CHROME_EXTENSIONS_HREF}
      className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
    >
      chrome://extensions
    </a>
  );
}

function StepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-3">
        <Badge
          variant="secondary"
          className="mt-0.5 size-7 shrink-0 justify-center rounded-full px-0 font-mono text-xs"
        >
          {step}
        </Badge>
        <CardTitle className="text-base font-medium leading-snug">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

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
          <Badge variant="outline" className="rounded-full">
            {t("Unpacked install", "Cài unpacked")}
          </Badge>
        </div>

        <div className="space-y-3">
          <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground">
            {t("Chrome new tab", "Tab mới Chrome")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t(
              "Replace Chrome's new tab with today's AI;DR and top stories from aidr.today. Get it on the Chrome Web Store or download the zip to Load unpacked.",
              "Thay tab mới của Chrome bằng AI;DR hôm nay và tin nổi bật từ aidr.today. Lấy trên Chrome Web Store hoặc tải zip để Load unpacked."
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
          <Button variant="outline" size="lg" asChild>
            <ZipLink>
              <Download data-icon="inline-start" aria-hidden />
              {t("Download zip", "Tải zip")}
            </ZipLink>
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
        <p className="text-sm text-muted-foreground">
          {t(
            "The Chrome Web Store version auto-updates. For development or local server, download and Load unpacked the zip.",
            "Phiên bản Chrome Web Store tự cập nhật. Cho phát triển hoặc server local, tải và Load unpacked file zip."
          )}
        </p>
      </div>

      <Separator />

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("Load unpacked", "Load unpacked")}
          </h2>
        </div>

        <div className="grid gap-4">
          <StepCard
            step={1}
            title={t(GUIDE_COPY.unzipFirst.en, GUIDE_COPY.unzipFirst.vi)}
          >
            <p>{t(GUIDE_COPY.unzipDetail.en, GUIDE_COPY.unzipDetail.vi)}</p>
            <figure className="overflow-hidden rounded-2xl border border-border bg-muted/30">
              <img
                src={AIDR_ZIP_ERROR_IMG}
                alt={t(GUIDE_COPY.zipErrorAlt.en, GUIDE_COPY.zipErrorAlt.vi)}
                width={AIDR_ZIP_ERROR_IMG_WIDTH}
                height={AIDR_ZIP_ERROR_IMG_HEIGHT}
                className="h-auto w-full"
              />
              <figcaption className="flex items-start gap-2 border-t border-border px-3 py-2 text-xs">
                <ShieldAlert
                  className="mt-0.5 size-3.5 shrink-0 text-destructive"
                  aria-hidden
                />
                <span>
                  {t(
                    GUIDE_COPY.zipErrorCaption.en,
                    GUIDE_COPY.zipErrorCaption.vi
                  )}
                </span>
              </figcaption>
            </figure>
          </StepCard>

          <StepCard
            step={2}
            title={t("Open Chrome extensions", "Mở trang tiện ích Chrome")}
          >
            <p>
              {t(GUIDE_COPY.openExtensions.en, GUIDE_COPY.openExtensions.vi)}{" "}
              <ChromeExtensionsLink />.{" "}
              {t(GUIDE_COPY.pasteExtensions.en, GUIDE_COPY.pasteExtensions.vi)}
            </p>
          </StepCard>

          <StepCard
            step={3}
            title={t(GUIDE_COPY.developerMode.en, GUIDE_COPY.developerMode.vi)}
          >
            <p>
              {t(
                "Use the toggle in the top-right corner of the extensions page.",
                "Dùng công tắc ở góc trên bên phải trang extensions."
              )}
            </p>
          </StepCard>

          <StepCard
            step={4}
            title={t(GUIDE_COPY.loadFolder.en, GUIDE_COPY.loadFolder.vi)}
          >
            <p>
              {t(
                "Pick the unzipped aidr folder — the one that contains manifest.json.",
                "Chọn thư mục aidr vừa giải nén — thư mục có file manifest.json."
              )}
            </p>
          </StepCard>

          <StepCard
            step={5}
            title={t(GUIDE_COPY.newTab.en, GUIDE_COPY.newTab.vi)}
          >
            <p>
              {t(
                "You should see today's AI;DR and stories from this site.",
                "Bạn sẽ thấy AI;DR hôm nay và tin từ site này."
              )}
            </p>
          </StepCard>
        </div>
      </section>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="size-4" aria-hidden />
            {t("Updates", "Cập nhật")}
          </CardTitle>
          <CardDescription>
            {t(
              "Chrome never auto-updates unpacked zips. A banner appears on the new tab when a newer zip is published. Store installs would auto-update.",
              "Chrome không tự cập nhật zip unpacked. Tab mới hiện banner khi có zip mới. Bản trên Store thì tự cập nhật."
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
              "Chrome will warn that the extension is unpacked. That is expected.",
              "Chrome sẽ cảnh unpacked extension. Đó là bình thường."
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
