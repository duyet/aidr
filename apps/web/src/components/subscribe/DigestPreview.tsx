import { Badge } from "@aidr/ui";
import { useState } from "react";
import type { Lang } from "../../lib/types";
import { BrowserFrame } from "./BrowserFrame";

export function DigestPreview({ lang }: { lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [subject, setSubject] = useState("");
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="space-y-3 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="rounded-full">
          {t("What lands in your inbox", "Email bạn sẽ nhận")}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {t(
            "Live preview of the latest digest",
            "Bản tin mới nhất, hiển thị trực tiếp"
          )}
        </span>
      </div>
      <BrowserFrame
        tab={t("Inbox — AI;DR", "Hộp thư — AI;DR")}
        address="aidr.today/api/subscribe/preview"
      >
        <div className="space-y-1 border-b border-border px-4 py-2.5 text-sm">
          <div className="flex gap-3">
            <span className="w-16 shrink-0 text-muted-foreground">
              {t("From", "Từ")}
            </span>
            <span className="truncate">AI;DR &lt;digest@aidr.today&gt;</span>
          </div>
          <div className="flex gap-3">
            <span className="w-16 shrink-0 text-muted-foreground">
              {t("Subject", "Tiêu đề")}
            </span>
            <span className="truncate">{subject || "AI;DR"}</span>
          </div>
        </div>
        <div className="relative">
          {!loaded && (
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center bg-[#f7f7f5] text-sm text-muted-foreground"
            >
              {t("Loading preview…", "Đang tải bản xem trước…")}
            </div>
          )}
          <iframe
            src={`/api/subscribe/preview?lang=${lang}`}
            title={t("Digest email preview", "Xem trước email bản tin")}
            className={`h-[560px] w-full bg-[#f7f7f5] transition-opacity duration-500 motion-reduce:transition-none ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={(e) => {
              setLoaded(true);
              const title = e.currentTarget.contentDocument?.title;
              if (title) setSubject(title);
            }}
          />
        </div>
      </BrowserFrame>
      <p className="text-xs text-muted-foreground">
        {t(
          "The actual latest digest — same layout arrives each morning around 7:00 your time.",
          "Đây là bản tin mới nhất — cùng bố cục mỗi sáng khoảng 7:00 theo giờ của bạn."
        )}
      </p>
    </div>
  );
}
