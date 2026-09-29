import { Search } from "lucide-react";
import type { Lang } from "../../lib/types";
import { HighlightedText } from "../HighlightedText";

const NEW_TAB_STORIES = [
  {
    en: "OpenAI ships a faster reasoning model for agents",
    vi: "OpenAI ra mắt mô hình suy luận nhanh hơn cho agent",
    src: "news.ycombinator.com",
  },
  {
    en: "Anthropic open-sources Claude interpretability tools",
    vi: "Anthropic mở mã nguồn bộ công cụ diễn giải Claude",
    src: "anthropic.com",
  },
  {
    en: "Google DeepMind brings Gemini on-device to Chrome",
    vi: "Google DeepMind đưa Gemini chạy on-device lên Chrome",
    src: "deepmind.google",
  },
  {
    en: "NVIDIA releases an open inference stack for Blackwell",
    vi: "NVIDIA phát hành stack inference mở cho Blackwell",
    src: "developer.nvidia.com",
  },
  {
    en: "Meta licenses Llama weights for commercial fine-tuning",
    vi: "Meta cấp phép trọng số Llama cho fine-tuning thương mại",
    src: "ai.meta.com",
  },
];

export function NewTabMock({ lang }: { lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-lg font-medium leading-none">
            AI;DR
          </span>
          <span className="text-xs text-muted-foreground">
            {t("What's new in AI today?", "Hôm nay AI có gì mới?")}
          </span>
        </div>
        <div
          className="hidden h-6 w-32 items-center gap-1.5 rounded-full border border-border px-2.5 text-[10px] text-muted-foreground sm:flex"
          aria-hidden
        >
          <Search className="size-3" />
          {t("Search…", "Tìm kiếm…")}
        </div>
      </div>
      <p className="pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("Today", "Hôm nay")}
      </p>
      <ol>
        {NEW_TAB_STORIES.map((s, i) => (
          <li
            key={s.en}
            className="animate-in fade-in-0 slide-in-from-bottom-1 flex items-baseline gap-2.5 border-b border-border/60 py-2 duration-500 last:border-0"
            style={{
              animationDelay: `${250 + i * 100}ms`,
              animationFillMode: "backwards",
            }}
          >
            <span
              className="w-4 shrink-0 font-serif text-xs text-accent"
              aria-hidden
            >
              {i + 1}.
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">
                <HighlightedText text={t(s.en, s.vi)} tags={[]} />
              </p>
              <p className="text-[11px] text-muted-foreground">{s.src}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
