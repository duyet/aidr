import { Button } from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { useState } from "react";
import type { Lang } from "../lib/types";

const DIGEST_SIZES = [3, 5, 10] as const;

export function EmailSubscribeForm({
  lang,
  source,
}: {
  lang: Lang;
  source: string;
}) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [email, setEmail] = useState("");
  const [prefLang, setPrefLang] = useState<Lang>(lang);
  const [digestSize, setDigestSize] =
    useState<(typeof DIGEST_SIZES)[number]>(5);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [timezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "Asia/Ho_Chi_Minh";
    }
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    track("subscribe_submit");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          lang: prefLang,
          timezone,
          source,
          digest_size: digestSize,
        }),
      });
      if (res.ok) {
        track("subscribe_success");
        setStatus("done");
      } else {
        track("subscribe_error");
        setStatus("error");
      }
    } catch {
      track("subscribe_error");
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="space-y-3 rounded-md border border-border bg-muted/40 p-4 text-sm">
        <p>
          {t(
            `Subscribed. First digest around 7:00 AM (${timezone}).`,
            `Đã đăng ký. Bản tin đầu tiên khoảng 7:00 sáng (${timezone}).`
          )}
        </p>
        <p className="text-muted-foreground">
          {t(
            "Optional: add an account later to submit stories and suggest edits.",
            "Tuỳ chọn: thêm tài khoản sau để gửi tin và gợi ý sửa."
          )}{" "}
          <a
            href="/sign-up"
            className="text-accent underline-offset-2 hover:underline"
          >
            {t("Create account", "Tạo tài khoản")}
          </a>
        </p>
      </div>
    );
  }

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="digest-email"
          className="mb-1 block text-sm font-medium"
        >
          Email
        </label>
        <input
          id="digest-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={field}
        />
      </div>

      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-1 block font-medium">
          {t("Language", "Ngôn ngữ")}
        </legend>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="digest-lang"
            checked={prefLang === "vi"}
            onChange={() => setPrefLang("vi")}
          />
          Tiếng Việt
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="digest-lang"
            checked={prefLang === "en"}
            onChange={() => setPrefLang("en")}
          />
          English
        </label>
      </fieldset>

      <div>
        <label htmlFor="digest-size" className="mb-1 block text-sm font-medium">
          {t("Stories per digest", "Số tin mỗi bản tin")}
        </label>
        <select
          id="digest-size"
          value={digestSize}
          onChange={(e) =>
            setDigestSize(
              Number(e.target.value) as (typeof DIGEST_SIZES)[number]
            )
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

      <p className="text-xs text-muted-foreground">
        {t(
          `Around 7:00 AM your time (${timezone}). No account required.`,
          `Khoảng 7:00 sáng theo giờ của bạn (${timezone}). Không cần tài khoản.`
        )}
      </p>

      <Button type="submit" disabled={status === "loading"}>
        {status === "loading"
          ? t("Submitting…", "Đang gửi…")
          : t("Subscribe", "Đăng ký")}
      </Button>

      {status === "error" && (
        <p className="text-sm text-destructive">
          {t(
            "Something went wrong, please try again.",
            "Có lỗi xảy ra, vui lòng thử lại."
          )}
        </p>
      )}
    </form>
  );
}
