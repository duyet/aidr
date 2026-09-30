import { useState } from "react";
import type { Lang } from "../../lib/types";

/**
 * Digest preview iframe for the settings page. Same handling as the
 * /subscribe DigestPreview: a reserved height, a visible pending state
 * until the frame loads (the API serves a "still preparing" or error page
 * on empty or failed reads), and no transition under reduced motion.
 * The pending state resets whenever the preview URL changes.
 */
export function SettingsPreview({ lang, src }: { lang: Lang; src: string }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [loadedSrc, setLoadedSrc] = useState("");
  const loaded = loadedSrc === src;

  return (
    <div className="relative">
      {!loaded && (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center rounded-md border border-border bg-background text-sm text-muted-foreground"
        >
          {t("Loading preview…", "Đang tải bản xem trước…")}
        </div>
      )}
      <iframe
        title={t("Digest preview", "Xem trước bản tin")}
        className={`h-96 w-full rounded-md border border-border bg-background transition-opacity duration-300 motion-reduce:transition-none ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        src={src}
        onLoad={() => setLoadedSrc(src)}
      />
    </div>
  );
}
