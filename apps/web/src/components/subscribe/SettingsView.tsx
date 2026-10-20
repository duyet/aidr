import { Button } from "@aidr/ui";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { subscribeLinkState } from "../../lib/analytics/url-privacy";
import { withLang } from "../../lib/locale-url";
import { type MailFont, normalizeMailFont } from "../../lib/mail-font";
import { type MailFormat, normalizeMailFormat } from "../../lib/mail-format";
import {
  DEFAULT_WEEKLY_DAY,
  type MailFrequency,
  normalizeMailFrequency,
  normalizeWeeklyDay,
  type WeeklyDay,
} from "../../lib/mail-frequency";
import type { Lang } from "../../lib/types";
import { FrequencyField } from "./FrequencyField";
import { MailFontField } from "./MailFontField";
import { MailFormatField } from "./MailFormatField";
import { SettingsPreview } from "./SettingsPreview";

const DIGEST_SIZES = [3, 5, 10] as const;
type DigestSize = (typeof DIGEST_SIZES)[number];

export function SettingsView({ token, lang }: { token: string; lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const navigate = useNavigate();
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [masked, setMasked] = useState("");
  const [prefLang, setPrefLang] = useState<Lang>("en");
  const [digestSize, setDigestSize] = useState<DigestSize>(5);
  const [format, setFormat] = useState<MailFormat>("design");
  const [font, setFont] = useState<MailFont>("sans");
  const [frequency, setFrequency] = useState<MailFrequency>("daily");
  const [weeklyDay, setWeeklyDay] = useState<WeeklyDay>(DEFAULT_WEEKLY_DAY);
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
          mail_format?: string;
          mail_font?: string;
          frequency?: string;
          weekly_day?: number;
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
        setFormat(normalizeMailFormat(data.mail_format));
        setFont(normalizeMailFont(data.mail_font));
        setFrequency(normalizeMailFrequency(data.frequency));
        setWeeklyDay(normalizeWeeklyDay(data.weekly_day));
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
          body: JSON.stringify({
            lang: prefLang,
            digest_size: digestSize,
            mail_format: format,
            mail_font: font,
            frequency,
            weekly_day: weeklyDay,
          }),
        }
      );
      setSave(res.ok ? "done" : "error");
    } catch {
      setSave("error");
    }
  };

  if (load === "loading") {
    return (
      <div className="mx-auto w-full max-w-md py-16 text-sm text-muted-foreground">
        {t("Loading settings…", "Đang tải cài đặt…")}
      </div>
    );
  }
  if (load === "error") {
    return (
      <div className="mx-auto w-full max-w-md py-16 text-sm text-destructive">
        {t("This settings link is invalid.", "Liên kết cài đặt không hợp lệ.")}
      </div>
    );
  }

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="mx-auto w-full max-w-md py-12">
      <h1 className="font-serif text-3xl font-medium tracking-tight">
        {t("Digest settings", "Cài đặt bản tin")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{masked}</p>
      <form onSubmit={onSave} className="mt-6 space-y-4">
        <FrequencyField
          lang={lang}
          name="settings-frequency"
          value={frequency}
          onChange={setFrequency}
          weeklyDay={weeklyDay}
          onWeeklyDayChange={setWeeklyDay}
        />
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
            {t("Stories per email", "Số tin mỗi email")}
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
        <MailFormatField
          lang={lang}
          name="settings-format"
          value={format}
          onChange={setFormat}
        />
        <MailFontField
          lang={lang}
          name="settings-font"
          value={font}
          onChange={setFont}
        />
        <SettingsPreview
          lang={lang}
          src={`/api/subscribe/preview?lang=${prefLang}&n=${digestSize}&format=${format}&font=${font}&freq=${frequency}`}
        />
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
          href={withLang("/sign-up", lang)}
          className="text-accent underline-offset-2 hover:underline"
        >
          {t("Create account", "Tạo tài khoản")}
        </a>
      </p>
      <p className="mt-4 text-xs">
        <button
          type="button"
          onClick={() =>
            // The token rides in history state, not the href: a recorded
            // link would put it in front of analytics vendors.
            void navigate({
              href: withLang("/subscribe", lang),
              state: subscribeLinkState({ kind: "unsubscribe", token }),
            })
          }
          className="cursor-pointer text-muted-foreground underline-offset-2 hover:underline"
        >
          {t("Unsubscribe", "Hủy đăng ký")}
        </button>
      </p>
    </div>
  );
}
