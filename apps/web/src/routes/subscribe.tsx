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
import { useEffect, useState } from "react";
import { EmailSubscribeForm } from "../components/EmailSubscribeForm";
import { useLang } from "../lib/lang-context";
import { pageHead } from "../lib/seo";
import {
  CHROME_WEB_STORE_URL,
  TELEGRAM_HANDLE,
  TELEGRAM_URL,
} from "../lib/site";
import type { Lang } from "../lib/types";

const TABS = ["chrome", "telegram", "email"] as const;
type DeliverTab = (typeof TABS)[number];
const DIGEST_SIZES = [3, 5, 10] as const;
type DigestSize = (typeof DIGEST_SIZES)[number];

function parseTab(value: unknown): DeliverTab {
  return TABS.includes(value as DeliverTab) ? (value as DeliverTab) : "chrome";
}

export const Route = createFileRoute("/subscribe")({
  validateSearch: (
    search: Record<string, unknown>
  ): { tab?: DeliverTab; unsubscribe?: string; settings?: string } => {
    const out: { tab?: DeliverTab; unsubscribe?: string; settings?: string } =
      {};
    if (typeof search.tab === "string") out.tab = parseTab(search.tab);
    if (typeof search.unsubscribe === "string")
      out.unsubscribe = search.unsubscribe;
    if (typeof search.settings === "string") out.settings = search.settings;
    return out;
  },
  head: () =>
    pageHead({
      path: "/subscribe",
      title: "Get AI;DR | Chrome, Telegram, Email",
    }),
  component: SubscribePage,
});

function UnsubscribeView({ token, lang }: { token: string; lang: Lang }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );

  const doUnsubscribe = async () => {
    setStatus("loading");
    try {
      const res = await fetch(
        `/api/subscribe?token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  };

  if (status === "idle") {
    void doUnsubscribe();
  }

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="font-serif text-3xl font-medium tracking-tight">
        {lang === "vi" ? "Hủy đăng ký" : "Unsubscribe"}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {status === "loading" &&
          (lang === "vi" ? "Đang xử lý…" : "Processing…")}
        {status === "done" &&
          (lang === "vi"
            ? "Bạn đã hủy đăng ký thành công."
            : "You have been unsubscribed.")}
        {status === "error" &&
          (lang === "vi"
            ? "Có lỗi xảy ra, vui lòng thử lại."
            : "Something went wrong, please try again.")}
      </p>
    </div>
  );
}

function SettingsView({ token, lang }: { token: string; lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [masked, setMasked] = useState("");
  const [prefLang, setPrefLang] = useState<Lang>("en");
  const [digestSize, setDigestSize] = useState<DigestSize>(5);
  const [save, setSave] = useState<"idle" | "saving" | "done" | "error">(
    "idle"
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/subscribe?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("bad");
        return res.json() as Promise<{
          email_masked: string;
          lang: Lang;
          digest_size: number;
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        setMasked(data.email_masked);
        setPrefLang(data.lang === "vi" ? "vi" : "en");
        setDigestSize(
          DIGEST_SIZES.includes(data.digest_size as DigestSize)
            ? (data.digest_size as DigestSize)
            : 5
        );
        setLoad("ready");
      })
      .catch(() => {
        if (!cancelled) setLoad("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSave("saving");
    try {
      const res = await fetch(
        `/api/subscribe?token=${encodeURIComponent(token)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang: prefLang, digest_size: digestSize }),
        }
      );
      setSave(res.ok ? "done" : "error");
    } catch {
      setSave("error");
    }
  };

  if (load === "loading") {
    return (
      <div className="mx-auto max-w-md py-16 text-sm text-muted-foreground">
        {t("Loading settings…", "Đang tải cài đặt…")}
      </div>
    );
  }
  if (load === "error") {
    return (
      <div className="mx-auto max-w-md py-16 text-sm text-destructive">
        {t("This settings link is invalid.", "Liên kết cài đặt không hợp lệ.")}
      </div>
    );
  }

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="font-serif text-3xl font-medium tracking-tight">
        {t("Digest settings", "Cài đặt bản tin")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{masked}</p>
      <form onSubmit={onSave} className="mt-6 space-y-4">
        <fieldset className="flex gap-4 text-sm">
          <legend className="mb-1 block font-medium">
            {t("Language", "Ngôn ngữ")}
          </legend>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={prefLang === "vi"}
              onChange={() => setPrefLang("vi")}
            />
            Tiếng Việt
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={prefLang === "en"}
              onChange={() => setPrefLang("en")}
            />
            English
          </label>
        </fieldset>
        <div>
          <label
            htmlFor="settings-size"
            className="mb-1 block text-sm font-medium"
          >
            {t("Stories per digest", "Số tin mỗi bản tin")}
          </label>
          <select
            id="settings-size"
            value={digestSize}
            onChange={(e) =>
              setDigestSize(Number(e.target.value) as DigestSize)
            }
            className={field}
          >
            {DIGEST_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={save === "saving"}>
          {save === "saving" ? t("Saving…", "Đang lưu…") : t("Save", "Lưu")}
        </Button>
        {save === "done" && (
          <p className="text-sm text-muted-foreground">
            {t("Saved.", "Đã lưu.")}
          </p>
        )}
        {save === "error" && (
          <p className="text-sm text-destructive">
            {t("Could not save.", "Không lưu được.")}
          </p>
        )}
      </form>
      <p className="mt-8 text-sm text-muted-foreground">
        {t("Optional: add an account later.", "Tuỳ chọn: thêm tài khoản sau.")}{" "}
        <a
          href="/sign-up"
          className="text-accent underline-offset-2 hover:underline"
        >
          {t("Create account", "Tạo tài khoản")}
        </a>
      </p>
      <p className="mt-4 text-xs">
        <a
          href={`/subscribe?unsubscribe=${encodeURIComponent(token)}`}
          className="text-muted-foreground underline-offset-2 hover:underline"
        >
          {t("Unsubscribe", "Hủy đăng ký")}
        </a>
      </p>
    </div>
  );
}

function DeliverPage() {
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

function SubscribePage() {
  const lang = useLang();
  const { unsubscribe, settings } = Route.useSearch();

  if (unsubscribe) {
    return <UnsubscribeView token={unsubscribe} lang={lang} />;
  }
  if (settings) {
    return <SettingsView token={settings} lang={lang} />;
  }

  return <DeliverPage />;
}
