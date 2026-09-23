import { Button } from "@aidr/ui";
import { useEffect, useState } from "react";
import type { Lang } from "../../lib/types";

const DIGEST_SIZES = [3, 5, 10] as const;
type DigestSize = (typeof DIGEST_SIZES)[number];

export function SettingsView({ token, lang }: { token: string; lang: Lang }) {
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
