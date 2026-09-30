import { useState } from "react";
import type { Lang } from "../../lib/types";
import { type DigestPrefs, EmailSubscribeForm } from "../EmailSubscribeForm";
import { ChannelSplit } from "./ChannelSplit";
import { DigestPreview } from "./DigestPreview";

/** The form owns no digest settings: they live here so the preview beside it
 *  re-renders the real mail for whatever the form currently says. */
export function EmailChannel({ lang }: { lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [prefs, setPrefs] = useState<DigestPrefs>({
    lang,
    size: 5,
    format: "design",
  });

  return (
    <ChannelSplit
      controls={
        <div className="space-y-6">
          <p className="text-base leading-relaxed text-muted-foreground">
            {t(
              "Daily digest by email. No account required — you can link one later.",
              "Bản tin hằng ngày qua email. Không cần tài khoản — có thể liên kết sau."
            )}
          </p>
          <EmailSubscribeForm
            lang={lang}
            source="extension"
            prefs={prefs}
            onPrefsChange={setPrefs}
          />
        </div>
      }
      preview={
        <DigestPreview
          lang={lang}
          src={`/api/subscribe/preview?lang=${prefs.lang}&n=${prefs.size}&format=${prefs.format}`}
        />
      }
    />
  );
}
