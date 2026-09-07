import { track } from "@aidr/ui/track";
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useLang } from "../lib/lang-context";
import type { SectionKey } from "../lib/prefs";
import { usePrefs } from "../lib/prefs";

const SECTION_LABELS: Record<SectionKey, { en: string; vi: string }> = {
  trending: { en: "Trending", vi: "Xu hưởng" },
  tldr: { en: "AI;DR", vi: "AI;DR" },
  days: { en: "Daily feed", vi: "Bảng tin theo ngày" },
  categories: { en: "Category nav", vi: "Danh mục" },
};

/** Header toolbar with Hide / Move up / Move down for a feed section.
 * Lives on each visible section so the user can tune the homepage layout
 * in-place; hidden sections are restorable via the "Thêm mục" button.
 * Syncs to news_prefs localStorage through the PrefsContext. */
export function SectionChrome({
  section,
  children,
}: {
  section: SectionKey;
  children: ReactNode;
}) {
  const lang = useLang();
  const { prefs, setPrefs } = usePrefs();
  const labels = SECTION_LABELS[section];
  const label = lang === "vi" ? labels.vi : labels.en;
  const order = prefs.sectionOrder ?? [];
  const idx = order.indexOf(section);

  const hideSection = () => {
    track("section_hide", { section });
    setPrefs({ sections: { ...prefs.sections, [section]: false } });
  };

  const moveUp = () => {
    if (idx <= 0) return;
    track("section_move_up", { section });
    const next = [...order];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setPrefs({ sectionOrder: next });
  };

  const moveDown = () => {
    if (idx === -1 || idx >= order.length - 1) return;
    track("section_move_down", { section });
    const next = [...order];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setPrefs({ sectionOrder: next });
  };

  return (
    <section className="section-chrome" data-section={section}>
      <div className="section-chrome-head flex items-center justify-between border-b border-border/60 pb-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={moveUp}
            disabled={idx <= 0}
            aria-label={lang === "vi" ? "Di chuyển lên" : "Move up"}
            title={lang === "vi" ? "Di chuyển lên" : "Move up"}
            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={moveDown}
            disabled={idx === -1 || idx >= order.length - 1}
            aria-label={lang === "vi" ? "Di chuyển xuống" : "Move down"}
            title={lang === "vi" ? "Di chuyển xuống" : "Move down"}
            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={hideSection}
            aria-label={lang === "vi" ? "Ẩn mục" : "Hide section"}
            title={lang === "vi" ? "Ẩn mục" : "Hide section"}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="section-chrome-body">{children}</div>
    </section>
  );
}

/** Button that restores hidden sections. Only renders when at least one
 * section is currently hidden. Clicking opens a small menu of hidden
 * sections to re-enable. */
export function AddSectionButton() {
  const lang = useLang();
  const { prefs, setPrefs } = usePrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close the restore popover on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hidden = (prefs.sectionOrder ?? []).filter((k) => !prefs.sections[k]);

  if (hidden.length === 0) return null;

  const restore = (section: SectionKey) => {
    track("section_restore", { section });
    setPrefs({ sections: { ...prefs.sections, [section]: true } });
    setOpen(false);
  };

  const label = lang === "vi" ? "Thêm mục" : "Add section";

  return (
    <div className="add-section" ref={ref}>
      {hidden.length === 1 ? (
        <button
          type="button"
          onClick={() => restore(hidden[0]!)}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-accent hover:text-accent"
        >
          <Eye className="h-3 w-3" />
          {label}: {SECTION_LABELS[hidden[0]!][lang === "vi" ? "vi" : "en"]}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-accent hover:text-accent"
          >
            <Eye className="h-3 w-3" />
            {label}
          </button>
          {open && (
            <div
              role="menu"
              className="absolute top-full left-0 mt-1 flex flex-col gap-0.5 rounded-xl border border-border bg-card p-1 text-xs shadow-lg"
            >
              {hidden.map((section) => {
                const name =
                  lang === "vi"
                    ? SECTION_LABELS[section].vi
                    : SECTION_LABELS[section].en;
                return (
                  <button
                    key={section}
                    type="button"
                    role="menuitem"
                    onClick={() => restore(section)}
                    className="rounded px-2.5 py-1 text-left text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
