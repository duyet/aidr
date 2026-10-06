import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aidr/ui";
import { trackChannelClick } from "@aidr/ui/track";
import {
  CheckCircle2,
  Languages,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { EXTENSION_VERSION } from "../../lib/extension-release";
import { CHROME_WEB_STORE_URL } from "../../lib/site";
import type { Lang } from "../../lib/types";
import { ChromeMark } from "../header/ChromeMark";
import { BrowserFrame } from "./BrowserFrame";
import { ChannelSplit } from "./ChannelSplit";
import { NewTabMock } from "./NewTabMock";

const FEATURES = [
  {
    icon: Newspaper,
    en: "Every new tab opens today's AI;DR and the ranked feed.",
    vi: "Mỗi tab mới mở AI;DR hôm nay và bảng tin đã xếp hạng.",
  },
  {
    icon: SlidersHorizontal,
    en: "Reorder, hide, or add sections — Daily feed, Trending, AI;DR, Categories.",
    vi: "Sắp xếp, ẩn hoặc thêm mục — Daily feed, Trending, AI;DR, Categories.",
  },
  {
    icon: Languages,
    en: "Works in English and Vietnamese.",
    vi: "Hỗ trợ tiếng Anh và tiếng Việt.",
  },
  {
    icon: ShieldCheck,
    en: "No account. Only the storage permission; connects to aidr.today only.",
    vi: "Không cần tài khoản. Chỉ cần quyền storage; chỉ kết nối tới aidr.today.",
  },
] as const;

/** Chrome tab of the deliver page: install CTA and features on the left,
 *  the new-tab mock on the right. */
export function ChromeChannel({ lang }: { lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  return (
    <ChannelSplit
      controls={
        <>
          <div className="flex items-center gap-4">
            <img
              src="/media/extension-icon.png"
              alt=""
              width={56}
              height={56}
              className="size-14 rounded-2xl border border-border"
            />
            <div className="space-y-1">
              <p className="font-medium leading-tight">aidr</p>
              <p className="text-sm text-muted-foreground">
                {t(
                  `Chrome extension · v${EXTENSION_VERSION}`,
                  `Tiện ích Chrome · v${EXTENSION_VERSION}`
                )}
              </p>
            </div>
          </div>
          <p className="text-base leading-relaxed text-muted-foreground">
            {t(
              "Replace Chrome's new tab with today's AI;DR and top stories from aidr.today. Install from the Chrome Web Store.",
              "Thay tab mới của Chrome bằng AI;DR hôm nay và tin nổi bật từ aidr.today. Cài đặt từ Chrome Web Store."
            )}
          </p>
          <Button size="lg" asChild>
            <a
              href={CHROME_WEB_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackChannelClick("chrome", { to: "chrome_web_store" })
              }
            >
              <ChromeMark className="mr-2 size-5" aria-hidden />
              {t("Chrome Web Store", "Chrome Web Store")}
            </a>
          </Button>
          {/* One column once the preview takes the right half, so the feature
              lines keep their full measure. */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {FEATURES.map((f, i) => (
              <li
                key={f.en}
                className="animate-in fade-in-0 slide-in-from-bottom-1 flex items-start gap-2.5 text-sm text-muted-foreground duration-500"
                style={{
                  animationDelay: `${i * 70}ms`,
                  animationFillMode: "backwards",
                }}
              >
                <f.icon
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden
                />
                <span>{t(f.en, f.vi)}</span>
              </li>
            ))}
          </ul>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <RefreshCw className="size-4" aria-hidden />
                {t("Updates", "Cập nhật")}
              </CardTitle>
              <CardDescription>
                {t(
                  "The Chrome Web Store version auto-updates automatically when new versions are published.",
                  "Phiên bản Chrome Web Store tự động cập nhật khi có phiên bản mới."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
              <span>
                {t(
                  "Install from the Chrome Web Store for automatic updates.",
                  "Cài đặt từ Chrome Web Store để có cập nhật tự động."
                )}
              </span>
            </CardContent>
          </Card>
        </>
      }
      preview={
        <div className="space-y-3">
          <BrowserFrame tab="New Tab" address="chrome://newtab">
            <NewTabMock lang={lang} />
          </BrowserFrame>
          <p className="text-xs text-muted-foreground">
            {t(
              "Sample stories — the new tab shows the live aidr.today feed.",
              "Tin mẫu — tab mới hiển thị bảng tin aidr.today trực tiếp."
            )}
          </p>
        </div>
      }
    />
  );
}
