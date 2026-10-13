import {
  AArrowDown,
  AArrowUp,
  Moon,
  RotateCcw,
  Rows2,
  Rows4,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { track } from "../../lib/analytics/track";
import {
  applyReaderTheme,
  DEFAULT_PREFS,
  READER_DENSITIES,
  type ReaderBg,
  type ReaderFont,
  usePrefs,
} from "../../lib/prefs";
import { PREFS_LABEL, Segmented } from "./Segmented";

const BG_SWATCHES: { key: ReaderBg; color: string }[] = [
  { key: "default", color: "var(--background)" },
  { key: "cream", color: "#faf6ec" },
  { key: "gray", color: "#d9d9d6" },
  { key: "dark", color: "#2a2a28" },
  { key: "black", color: "#000000" },
];

export function ThemeTab({ t }: { t: (en: string, vi: string) => string }) {
  const { prefs, setPrefs } = usePrefs();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark =
    mounted &&
    (resolvedTheme === "dark" || prefs.bg === "dark" || prefs.bg === "black");

  const setBg = (bg: ReaderBg) => {
    track("prefs_change", { pref: "bg", pref_value: bg });
    setPrefs({ bg });
    applyReaderTheme(bg);
  };

  const setDarkMode = (dark: boolean) => {
    track("prefs_change", {
      pref: "theme",
      pref_value: dark ? "dark" : "light",
    });
    const bg: ReaderBg = dark
      ? prefs.bg === "black"
        ? "black"
        : "dark"
      : prefs.bg === "cream" || prefs.bg === "gray"
        ? prefs.bg
        : "default";
    setPrefs({ bg });
    applyReaderTheme(bg);
    setTheme(dark ? "dark" : "light");
  };

  const isDefault =
    prefs.font === DEFAULT_PREFS.font &&
    prefs.fontSize === DEFAULT_PREFS.fontSize &&
    prefs.density === DEFAULT_PREFS.density &&
    prefs.bg === DEFAULT_PREFS.bg &&
    (!mounted || resolvedTheme !== "dark");

  /** Back to the default look; other settings (sections, TL;DR count) stay. */
  const resetAppearance = () => {
    track("prefs_change", { pref: "reset" });
    setPrefs({
      font: DEFAULT_PREFS.font,
      fontSize: DEFAULT_PREFS.fontSize,
      density: DEFAULT_PREFS.density,
      bg: DEFAULT_PREFS.bg,
    });
    applyReaderTheme(DEFAULT_PREFS.bg);
    setTheme("system");
  };

  const sliderRow =
    "grid grid-cols-[4.5rem_1fr_2.25rem] items-center gap-2 text-xs";

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className={`block ${PREFS_LABEL}`}>
          {t("Appearance", "Giao diện")}
        </span>
        <Segmented
          label={t("Appearance", "Giao diện")}
          value={isDark ? "dark" : "light"}
          onChange={(v) => setDarkMode(v === "dark")}
          options={[
            {
              value: "light",
              label: (
                <>
                  <Sun className="size-3.5" aria-hidden />
                  {t("Light", "Sáng")}
                </>
              ),
            },
            {
              value: "dark",
              label: (
                <>
                  <Moon className="size-3.5" aria-hidden />
                  {t("Dark", "Tối")}
                </>
              ),
            },
          ]}
        />
      </div>

      <div className="space-y-1.5">
        <span className={`block ${PREFS_LABEL}`}>{t("Font", "Phông chữ")}</span>
        <Segmented
          label={t("Font", "Phông chữ")}
          value={prefs.font}
          onChange={(f: ReaderFont) => {
            track("prefs_change", { pref: "font", pref_value: f });
            setPrefs({ font: f });
          }}
          options={(["sans", "serif"] satisfies ReaderFont[]).map((f) => ({
            value: f,
            label: (
              <>
                <span
                  className="text-sm leading-none"
                  style={
                    f === "serif"
                      ? { fontFamily: "var(--reader-font-serif)" }
                      : undefined
                  }
                  aria-hidden
                >
                  Aa
                </span>
                {f === "sans" ? t("Sans", "Không chân") : t("Serif", "Có chân")}
              </>
            ),
          }))}
        />
      </div>

      <label className={sliderRow}>
        <span className="text-muted-foreground">
          {t("Text size", "Cỡ chữ")}
        </span>
        <span className="flex items-center gap-1.5">
          <AArrowDown
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            type="range"
            min={0.85}
            max={1.25}
            step={0.05}
            value={prefs.fontSize}
            onChange={(e) => {
              track("prefs_change", { pref: "fontSize" });
              setPrefs({ fontSize: Number(e.target.value) });
            }}
            className="reader-slider w-full"
            aria-label={t("Text size", "Cỡ chữ")}
          />
          <AArrowUp
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </span>
        <span className="text-right tabular-nums text-muted-foreground">
          {Math.round(prefs.fontSize * 100)}%
        </span>
      </label>

      <label className={sliderRow}>
        <span className="text-muted-foreground">{t("Density", "Mật độ")}</span>
        <span className="flex items-center gap-1.5">
          <Rows4
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            type="range"
            min={0}
            max={READER_DENSITIES.length - 1}
            step={1}
            value={READER_DENSITIES.indexOf(prefs.density)}
            onChange={(e) => {
              const density = READER_DENSITIES[Number(e.target.value)];
              track("prefs_change", { pref: "density", pref_value: density });
              setPrefs({ density });
            }}
            className="reader-slider w-full"
            aria-label={t("Density", "Mật độ")}
          />
          <Rows2
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </span>
        <span />
      </label>

      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs">
        <span className="text-muted-foreground">{t("Background", "Nền")}</span>
        <div className="flex gap-2">
          {BG_SWATCHES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setBg(s.key)}
              aria-label={s.key}
              aria-pressed={prefs.bg === s.key}
              style={{ background: s.color }}
              className={`size-5 shrink-0 rounded-full border border-border transition-shadow ${
                prefs.bg === s.key
                  ? "ring-1 ring-foreground/70 ring-offset-2 ring-offset-card"
                  : "hover:ring-1 hover:ring-border hover:ring-offset-2 hover:ring-offset-card"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-2">
        <button
          type="button"
          onClick={resetAppearance}
          disabled={isDefault}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {t("Reset to default", "Khôi phục mặc định")}
        </button>
      </div>
    </div>
  );
}
