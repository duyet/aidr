import { Button } from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { useState } from "react";
import { withLang } from "../lib/locale-url";
import type { MailFormat } from "../lib/mail-format";
import type { Lang } from "../lib/types";
import { formAnnotationAttributes, webmcpForm } from "../lib/webmcp";
import { MailFormatField } from "./subscribe/MailFormatField";

const DIGEST_SIZES = [3, 5, 10] as const;

/** Digest settings chosen in the form. The parent holds them so the
 *  preview can render the same choices. */
export interface DigestPrefs {
  lang: Lang;
  size: (typeof DIGEST_SIZES)[number];
  format: MailFormat;
}

export function EmailSubscribeForm({
  lang,
  source,
  prefs,
  onPrefsChange,
}: {
  lang: Lang;
  source: string;
  prefs: DigestPrefs;
  onPrefsChange: (prefs: DigestPrefs) => void;
}) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [email, setEmail] = useState("");
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
    track("subscribe_submit", { channel: "email", source });
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          lang: prefs.lang,
          timezone,
          source,
          digest_size: prefs.size,
          mail_format: prefs.format,
        }),
      });
      if (res.ok) {
        track("subscribe_success", { channel: "email", source });
        setStatus("done");
      } else {
        track("subscribe_error", { channel: "email", source });
        setStatus("error");
      }
    } catch {
      track("subscribe_error", { channel: "email", source });
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
            href={withLang("/sign-up", lang)}
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
    <form
      {...formAnnotationAttributes(webmcpForm("subscribe-email"))}
      onSubmit={onSubmit}
      className="space-y-4"
    >
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
            checked={prefs.lang === "vi"}
            onChange={() => onPrefsChange({ ...prefs, lang: "vi" })}
          />
          Tiếng Việt
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="digest-lang"
            checked={prefs.lang === "en"}
            onChange={() => onPrefsChange({ ...prefs, lang: "en" })}
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
          value={prefs.size}
          onChange={(e) =>
            onPrefsChange({
              ...prefs,
              size: Number(e.target.value) as DigestPrefs["size"],
            })
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

      <MailFormatField
        lang={lang}
        name="digest-format"
        value={prefs.format}
        onChange={(format) => onPrefsChange({ ...prefs, format })}
      />

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
