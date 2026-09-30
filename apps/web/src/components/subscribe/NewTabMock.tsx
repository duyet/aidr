import { ChevronDown, Menu, RotateCw, Search, TrendingUp } from "lucide-react";
import type { CSSProperties } from "react";
import { topicColor } from "../../lib/topic-color";
import type { Lang } from "../../lib/types";
import { HighlightedText } from "../HighlightedText";

/**
 * Sample content for the new-tab preview. Shapes follow what the extension
 * renders (`apps/extension/js/newtab.js`): category pills with counts,
 * trending chips with counts, and AI;DR bullets led by a topic label.
 */
export const NEW_TAB_SAMPLE = {
  date: "2026-09-30",
  total: 329,
  counts: [8, 12, 16],
  categories: [
    { en: "Agents", vi: "Tác nhân", count: 53 },
    { en: "Regulation", vi: "Chính sách", count: 50 },
    { en: "Models", vi: "Models", count: 47 },
    { en: "Products", vi: "Sản phẩm", count: 41 },
    { en: "Research", vi: "Nghiên cứu", count: 36 },
    { en: "Industry", vi: "Doanh nghiệp", count: 28 },
    { en: "Infra", vi: "Hạ tầng", count: 22 },
    { en: "Funding", vi: "Gọi vốn", count: 17 },
  ],
  trending: [
    { tag: "GPT-6.1 Astra", count: 8 },
    { tag: "Claude", count: 7 },
    { tag: "Gemini", count: 6 },
    { tag: "MCP", count: 5 },
    { tag: "Nvidia", count: 5 },
    { tag: "Llama", count: 4 },
    { tag: "Cursor", count: 3 },
  ],
  stories: [
    {
      label: "Anthropic",
      en: "Anthropic open-sources Claude interpretability tools",
      vi: "Anthropic mở mã nguồn bộ công cụ diễn giải Claude",
    },
    {
      label: "Regulation",
      en: "EU publishes draft guidance for general-purpose AI models",
      vi: "EU công bố dự thảo hướng dẫn cho mô hình AI đa dụng",
    },
    {
      label: "OpenAI",
      en: "OpenAI ships a faster reasoning model for agents",
      vi: "OpenAI ra mắt mô hình suy luận nhanh hơn cho agent",
    },
    {
      label: "Funding",
      en: "Mistral raises a new round to expand European compute",
      vi: "Mistral gọi vốn vòng mới để mở rộng hạ tầng tính toán châu Âu",
    },
    {
      label: "Google",
      en: "Google DeepMind brings Gemini on-device to Chrome",
      vi: "Google DeepMind đưa Gemini chạy on-device lên Chrome",
    },
    {
      label: "Nvidia",
      en: "Nvidia releases an open inference stack for Blackwell",
      vi: "Nvidia phát hành stack inference mở cho Blackwell",
    },
    {
      label: "Meta",
      en: "Meta licenses Llama weights for commercial fine-tuning",
      vi: "Meta cấp phép trọng số Llama cho fine-tuning thương mại",
    },
    {
      label: "Agents",
      en: "Cursor adds background agents that open pull requests",
      vi: "Cursor thêm agent chạy nền tự mở pull request",
    },
  ],
} as const;

function topicStyle(tag: string): CSSProperties {
  const color = topicColor(tag);
  return {
    "--tc-light": color.light,
    "--tc-dark": color.dark,
  } as CSSProperties;
}

/**
 * Static miniature of the extension's new tab. It mirrors the markup order
 * and the rem values of `apps/extension/css/newtab.css`, written in `em` so
 * the whole page scales with the frame width: 1em is the new tab's 16px at a
 * 1000px-wide window (wide layout) or a 390px phone (compact layout). The
 * layout switches on the frame's width, not the viewport's. Decorative only:
 * no links, buttons or inputs, and hidden from assistive tech.
 */
export function NewTabMock({ lang }: { lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const { stories } = NEW_TAB_SAMPLE;
  const mid = Math.ceil(stories.length / 2);
  const columns = [stories.slice(0, mid), stories.slice(mid)];

  return (
    <div className="@container select-none bg-background" aria-hidden="true">
      <div className="text-[length:clamp(12px,4.1cqw,15px)] text-foreground @xl:text-[length:clamp(9px,1.6cqw,13px)]">
        {/* Header: compact row on a narrow frame, wide row otherwise. */}
        <div className="flex items-center gap-[0.5em] border-b border-border/80 px-[0.75em] py-[0.375em] @xl:gap-[0.75em] @xl:px-[1.5em] @xl:py-[0.75em]">
          <span className="flex shrink-0 items-baseline gap-[0.5em]">
            <span className="font-serif text-[1.125em] font-medium leading-[1.55] tracking-tight">
              AI;DR
            </span>
            <span className="hidden text-[0.875em] text-muted-foreground @xl:inline">
              {t("What's happening in AI today?", "Hôm nay AI có gì mới?")}
            </span>
          </span>
          <span className="flex h-[2.75em] min-w-0 flex-1 items-center gap-[0.5em] rounded-[0.75em] bg-border/50 px-[0.75em] text-muted-foreground @xl:h-[2em] @xl:px-[0.65em]">
            <Search className="size-[0.9em] shrink-0" />
            <span className="truncate text-[0.875em]">
              {t("Search AI news...", "Tìm kiếm...")}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-[0.25em]">
            <span className="flex size-[2.75em] items-center justify-center gap-[0.25em] rounded-full @xl:h-[2em] @xl:w-auto @xl:px-[1em]">
              <img
                src="/favicon.svg"
                alt=""
                className="size-[1em] shrink-0 rounded-[0.25em]"
              />
              <span className="hidden whitespace-nowrap text-[0.875em] font-medium @xl:inline">
                Get AI;DR
              </span>
              <ChevronDown className="hidden size-[1em] shrink-0 @xl:block" />
            </span>
            <span className="mx-[0.25em] hidden h-[1.25em] w-px bg-border @xl:block" />
            <span className="flex size-[2.75em] items-center justify-center text-muted-foreground @xl:h-[2em] @xl:w-auto @xl:px-[0.875em]">
              <span className="font-serif text-[0.875em] font-semibold">
                Aa
              </span>
            </span>
            <span className="hidden h-[2em] items-center rounded-[1em] border border-border p-[0.25em] @xl:flex">
              {(["en", "vi"] as const).map((code) => (
                <span
                  key={code}
                  className={`flex h-[1.5em] items-center rounded-full px-[0.75em] ${
                    code === lang
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="text-[0.75em] font-semibold uppercase">
                    {code}
                  </span>
                </span>
              ))}
            </span>
            <span className="hidden h-[2em] items-center rounded-full border border-border px-[0.875em] @xl:flex">
              <span className="whitespace-nowrap text-[0.875em] font-medium">
                Sign in
              </span>
            </span>
            <span className="flex size-[2.75em] items-center justify-center text-muted-foreground @xl:hidden">
              <Menu className="size-[1.15em]" />
            </span>
          </span>
        </div>

        <div className="px-[1em] pb-[1.5em] @xl:px-[1.5em]">
          {/* Category pills */}
          <div className="flex items-center gap-[0.375em] overflow-hidden whitespace-nowrap py-[0.4em]">
            <span className="shrink-0 rounded-full bg-primary px-[0.875em] py-[0.375em] text-primary-foreground">
              <span className="text-[0.875em] font-medium">
                {t("All", "Tất cả")}
              </span>
            </span>
            {NEW_TAB_SAMPLE.categories.map((c) => (
              <span
                key={c.en}
                className="shrink-0 rounded-full px-[0.875em] py-[0.375em] text-muted-foreground"
              >
                <span className="text-[0.875em] font-medium">
                  {t(c.en, c.vi)}{" "}
                  <span className="text-[0.75em] opacity-70">{c.count}</span>
                </span>
              </span>
            ))}
          </div>

          {/* Trending chips */}
          <div className="flex items-center gap-[0.5em] overflow-hidden whitespace-nowrap py-[0.4em]">
            <span className="flex shrink-0 items-center gap-[0.35em] text-muted-foreground">
              <TrendingUp className="size-[0.875em]" />
              <span className="text-[0.75em] font-medium uppercase tracking-[0.06em]">
                {t("Trending", "Xu hướng")}
              </span>
            </span>
            {NEW_TAB_SAMPLE.trending.map((row) => (
              <span
                key={row.tag}
                className="topic-colored shrink-0 rounded-full border border-border px-[0.875em] py-[0.375em]"
                style={topicStyle(row.tag)}
              >
                <span className="flex items-baseline gap-[0.35em] text-[0.875em] font-medium">
                  {row.tag}
                  <span className="topic-muted text-[0.75em] font-semibold">
                    {row.count}
                  </span>
                </span>
              </span>
            ))}
          </div>

          {/* AI;DR card */}
          <div className="mt-[0.25em] rounded-[1.25em] border border-border/80 bg-card px-[1.125em] py-[1.25em]">
            <div className="mb-[0.75em] flex items-baseline justify-between gap-[0.75em]">
              <span className="flex items-baseline gap-[0.75em]">
                <span className="font-serif text-[1.5em] font-medium tracking-[-0.02em]">
                  AI;DR
                </span>
                <span className="text-[0.75em] text-muted-foreground">
                  {NEW_TAB_SAMPLE.date}
                </span>
              </span>
              <span className="flex gap-[0.15em] rounded-full bg-muted/80 p-[0.15em]">
                {NEW_TAB_SAMPLE.counts.map((n, i) => (
                  <span
                    key={n}
                    className={`rounded-full px-[0.625em] py-[0.25em] leading-none ${
                      i === 0
                        ? "bg-primary font-medium text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span className="text-[0.75em]">{n}</span>
                  </span>
                ))}
              </span>
            </div>
            <div className="grid gap-x-[2.5em] gap-y-[0.7em] @xl:grid-cols-2">
              {columns.map((col, ci) => (
                <ol
                  key={col[0].en}
                  start={ci * mid + 1}
                  className="list-decimal space-y-[0.7em] pl-[1.5em] leading-normal marker:text-muted-foreground"
                >
                  {col.map((s, i) => (
                    <li
                      key={s.en}
                      className="animate-in fade-in-0 slide-in-from-bottom-1 duration-500 motion-reduce:animate-none"
                      style={{
                        animationDelay: `${250 + (ci * mid + i) * 60}ms`,
                        animationFillMode: "backwards",
                      }}
                    >
                      <span className="flex min-h-[3em] items-stretch gap-[0.5em]">
                        <span className="line-clamp-2 min-w-0 flex-1 break-words">
                          <span
                            className="topic-colored mr-[0.5em] text-[0.75em] font-semibold uppercase tracking-[0.04em]"
                            style={topicStyle(s.label)}
                          >
                            {s.label}
                          </span>
                          <span className="underline decoration-border underline-offset-2">
                            <HighlightedText text={t(s.en, s.vi)} tags={[]} />
                          </span>
                        </span>
                        <span className="size-[3em] shrink-0 rounded-[0.75em] border border-border/80 bg-muted" />
                      </span>
                    </li>
                  ))}
                </ol>
              ))}
            </div>
            <p className="mt-[0.75em] text-accent">
              <span className="text-[0.75em] font-semibold">
                {t("Show more ↓", "Xem thêm ↓")}
              </span>
            </p>
            <div className="mt-[0.75em] flex items-center justify-between text-muted-foreground">
              <span className="text-[0.75em]">
                {NEW_TAB_SAMPLE.total} {t("stories", "tin")}
              </span>
              <span className="flex items-center gap-[0.35em]">
                <span className="text-[0.75em]">
                  {t("Updated 1m ago", "Cập nhật 1 phút trước")}
                </span>
                <RotateCw className="size-[0.85em] opacity-70" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
