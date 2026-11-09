import type { ReactElement } from "react";
import type { Lang } from "../../lib/types";

const KEYS: Record<Lang, Array<[string[], string]>> = {
  en: [
    [["J", "K"], "Next / previous block"],
    [["Enter"], "Open the selected block"],
    [["C"], "Copy AI;DR for social"],
    [["O"], "Read the original"],
    [["S"], "Go to sources"],
    [["?"], "Show or hide this list"],
    [["Esc"], "Close"],
  ],
  vi: [
    [["J", "K"], "Mục tiếp / trước"],
    [["Enter"], "Mở mục đang chọn"],
    [["C"], "Chép AI;DR để đăng"],
    [["O"], "Đọc bài gốc"],
    [["S"], "Tới nguồn"],
    [["?"], "Hiện hoặc ẩn danh sách này"],
    [["Esc"], "Đóng"],
  ],
};

export const KBD_CLASS =
  "rounded border border-input border-b-2 px-1.5 font-mono text-[calc(11px*var(--reader-font-size,1))] font-medium text-foreground";

/** The story page's shortcut list, behind `?`. Not modal: the page keeps
 * working under it, and Esc or `?` hides it. */
export function ShortcutSheet({
  lang,
  onClose,
}: {
  lang: Lang;
  onClose: () => void;
}): ReactElement {
  const vi = lang === "vi";
  return (
    <section
      aria-label={vi ? "Phím tắt" : "Keyboard shortcuts"}
      className="fixed right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-40 w-[min(280px,calc(100%-32px))] rounded-xl border border-input bg-card px-4 py-3.5 text-[calc(13px*var(--reader-font-size,1))] shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground">
          {vi ? "Phím tắt" : "Shortcuts"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-8 rounded-full px-2 text-muted-foreground hover:text-foreground"
        >
          {vi ? "Đóng" : "Close"}
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {KEYS[lang].map(([keys, label]) => (
          <div key={label} className="contents">
            <dt className="flex gap-1">
              {keys.map((k) => (
                <kbd key={k} className={KBD_CLASS}>
                  {k}
                </kbd>
              ))}
            </dt>
            <dd className="text-muted-foreground">{label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
