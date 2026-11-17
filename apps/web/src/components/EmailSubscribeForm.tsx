import { useState, useSyncExternalStore } from "react";
import type { EventParams } from "../lib/analytics/events";
import { withLang } from "../lib/locale-url";
import type { MailFont } from "../lib/mail-font";
import type { MailFormat } from "../lib/mail-format";
import {
  type MailFrequency,
  type WeeklyDay,
  weekdayName,
} from "../lib/mail-frequency";
import {
  browserTimezone,
  FALLBACK_TIMEZONE,
  postSubscribe,
} from "../lib/subscribe-post";
import type { Lang } from "../lib/types";
import { formAnnotationAttributes, webmcpForm } from "../lib/webmcp";
import { Bi } from "./Bi";
import { FrequencyField } from "./subscribe/FrequencyField";
import { MailFontField } from "./subscribe/MailFontField";
import { MailFormatField } from "./subscribe/MailFormatField";

const DIGEST_SIZES = [3, 5, 10] as const;

/** Digest settings chosen in the form. The parent holds them so the
 *  preview can render the same choices. */
export interface DigestPrefs {
  lang: Lang;
  size: (typeof DIGEST_SIZES)[number];
  format: MailFormat;
  font: MailFont;
  frequency: MailFrequency;
  weeklyDay: WeeklyDay;
}

const subscribeNever = () => () => {};
const serverTimezone = () => null;

export function EmailSubscribeForm({
  lang,
  source,
  prefs,
  onPrefsChange,
}: {
  lang: Lang;
  source: EventParams<"subscribe_submit">["source"];
  prefs: DigestPrefs;
  onPrefsChange: (prefs: DigestPrefs) => void;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const timezone = useSyncExternalStore(
    subscribeNever,
    browserTimezone,
    serverTimezone
  );
  const zone = timezone ? ` (${timezone})` : "";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    const ok = await postSubscribe(source, {
      email,
      lang: prefs.lang,
      timezone: timezone ?? FALLBACK_TIMEZONE,
      digest_size: prefs.size,
      mail_format: prefs.format,
      mail_font: prefs.font,
      frequency: prefs.frequency,
      weekly_day: prefs.weeklyDay,
    });
    setStatus(ok ? "done" : "error");
  };

  if (status === "done") {
    return (
      <div className="space-y-3 rounded-2xl bg-muted p-4 text-sm">
        <p>
          <Bi
            en={`Almost done. Check your inbox and click the confirmation link. ${
              prefs.frequency === "weekly"
                ? `The weekly digest arrives ${weekdayName(prefs.weeklyDay, "en")} around 7:00 AM${zone}.`
                : `Digests start around 7:00 AM${zone} once confirmed.`
            }`}
            vi={`Sắp xong. Hãy mở hộp thư và bấm link xác nhận. ${
              prefs.frequency === "weekly"
                ? `Bản tin tuần đến vào sáng ${weekdayName(prefs.weeklyDay, "vi")}, khoảng 7:00${zone}.`
                : `Bản tin bắt đầu khoảng 7:00 sáng${zone} sau khi xác nhận.`
            }`}
          />
        </p>
        <p className="text-muted-foreground">
          <Bi
            en="Optional: add an account later to submit stories and suggest edits."
            vi="Tùy chọn: thêm tài khoản sau để gửi tin và gợi ý sửa."
          />{" "}
          <a
            href={withLang("/sign-up", lang)}
            className="btn-link inline-flex h-auto"
          >
            <Bi en="Create account" vi="Tạo tài khoản" inline />
          </a>
        </p>
      </div>
    );
  }

  const field =
    "w-full rounded-xl bg-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

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
          <Bi en="Email" vi="Email" />
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

      <FrequencyField
        lang={lang}
        name="digest-frequency"
        value={prefs.frequency}
        onChange={(frequency) => onPrefsChange({ ...prefs, frequency })}
        weeklyDay={prefs.weeklyDay}
        onWeeklyDayChange={(weeklyDay) =>
          onPrefsChange({ ...prefs, weeklyDay })
        }
      />

      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-1 block font-medium">
          <Bi en="Language" vi="Ngôn ngữ" />
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
          <Bi en="Stories per email" vi="Số tin mỗi email" />
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

      <MailFontField
        lang={lang}
        name="digest-font"
        value={prefs.font}
        onChange={(font) => onPrefsChange({ ...prefs, font })}
      />

      <p className="text-xs text-muted-foreground">
        <Bi
          en={
            prefs.frequency === "weekly"
              ? `${weekdayName(prefs.weeklyDay, "en")}s around 7:00 AM your time${zone}. No account required.`
              : `Around 7:00 AM your time${zone}. No account required.`
          }
          vi={
            prefs.frequency === "weekly"
              ? `Sáng ${weekdayName(prefs.weeklyDay, "vi")}, khoảng 7:00 theo giờ của bạn${zone}. Không cần tài khoản.`
              : `Khoảng 7:00 sáng theo giờ của bạn${zone}. Không cần tài khoản.`
          }
        />
      </p>

      <button
        type="submit"
        className="btn-primary"
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <Bi en="Submitting…" vi="Đang gửi…" inline />
        ) : (
          <Bi en="Subscribe" vi="Đăng ký" inline />
        )}
      </button>

      {status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          <Bi
            en="Something went wrong, please try again."
            vi="Có lỗi xảy ra, vui lòng thử lại."
          />
        </p>
      )}
    </form>
  );
}
