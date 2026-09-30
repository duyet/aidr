import { useState } from "react";
import type { Lang } from "../../lib/types";
import { type DigestPrefs, EmailSubscribeForm } from "../EmailSubscribeForm";
import { DigestPreview } from "./DigestPreview";

/** The form owns no digest settings: they live here so the preview below
 *  re-renders the real mail for whatever the form currently says. */
export function EmailChannel({ lang }: { lang: Lang }) {
  const [prefs, setPrefs] = useState<DigestPrefs>({
    lang,
    size: 5,
    format: "design",
  });

  return (
    <>
      <EmailSubscribeForm
        lang={lang}
        source="extension"
        prefs={prefs}
        onPrefsChange={setPrefs}
      />
      <DigestPreview
        lang={lang}
        src={`/api/subscribe/preview?lang=${prefs.lang}&n=${prefs.size}&format=${prefs.format}`}
      />
    </>
  );
}
