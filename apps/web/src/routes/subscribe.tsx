import { Button } from "@aidr/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { EmailSubscribeForm } from "../components/EmailSubscribeForm";
import { useLang } from "../lib/lang-context";
import { pageHead } from "../lib/seo";
import { TELEGRAM_HANDLE, TELEGRAM_URL } from "../lib/site";
import type { Lang } from "../lib/types";

const DIGEST_SIZES = [3, 5, 10] as const;
type DigestSize = (typeof DIGEST_SIZES)[number];

export const Route = createFileRoute("/subscribe")({
  validateSearch: (
    search: Record<string, unknown>
  ): { unsubscribe?: string; settings?: string } => {
    const out: { unsubscribe?: string; settings?: string } = {};
    if (typeof search.unsubscribe === "string")
      out.unsubscribe = search.unsubscribe;
    if (typeof search.settings === "string") out.settings = search.settings;
    return out;
  },
  head: () =>
    pageHead({
      path: "/subscribe",
      title: "Subscribe | AI News",
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

function SubscribePage() {
  const lang = useLang();
  const { unsubscribe, settings } = Route.useSearch();

  if (unsubscribe) {
    return <UnsubscribeView token={unsubscribe} lang={lang} />;
  }
  if (settings) {
    return <SettingsView token={settings} lang={lang} />;
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="flex items-center gap-2 font-serif text-3xl font-medium tracking-tight">
        <Mail className="h-5 w-5 text-accent" aria-hidden />
        {lang === "vi" ? "Nhận bản tin hằng ngày" : "Daily AI News Digest"}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {lang === "vi"
          ? "Bản tin theo cài đặt của bạn, gửi vào khoảng 7 giờ sáng theo giờ của bạn. Không cần tài khoản."
          : "Digest size you choose, delivered around 7:00 AM your local time. No account required."}
      </p>
      <p className="mt-3 text-sm">
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline hover:underline-offset-2"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          {lang === "vi"
            ? `Theo dõi trên Telegram (${TELEGRAM_HANDLE})`
            : `Follow on Telegram (${TELEGRAM_HANDLE})`}
        </a>
      </p>
      <p className="mt-2 text-sm">
        <Link
          to="/extension"
          search={{ tab: "email" }}
          className="font-semibold text-accent hover:underline hover:underline-offset-2"
        >
          {lang === "vi"
            ? "Chrome, Telegram, hoặc email"
            : "Chrome, Telegram, or email"}
        </Link>
      </p>
      <div className="mt-6">
        <EmailSubscribeForm lang={lang} source="news" />
      </div>
    </div>
  );
}
