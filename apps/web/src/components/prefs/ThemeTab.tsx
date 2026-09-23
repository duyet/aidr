import { track } from "@aidr/ui/track";
import { AArrowDown, AArrowUp, Moon, Rows2, Rows4, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  applyReaderTheme,
  type ReaderBg,
  type ReaderDensity,
  type ReaderFont,
  usePrefs,
} from "../../lib/prefs";

const BG_SWATCHES: { key: ReaderBg; color: string }[] = [
  { key: "default", color: "var(--background)" },
  { key: "cream", color: "#faf6ec" },
  { key: "gray", color: "#d9d9d6" },
  { key: "dark", color: "#2a2a28" },
  { key: "black", color: "#000000" },
];

const DENSITIES: ReaderDensity[] = ["compact", "comfortable", "spacious"];

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
    track("prefs_change", { pref: "bg" });
    setPrefs({ bg });
    applyReaderTheme(bg);
  };

  const setDarkMode = (dark: boolean) => {
    track("prefs_change", { pref: "theme" });
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

  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1.5 block text-xs text-muted-foreground">
          {t("Appearance", "Giao diện")}
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDarkMode(false)}
            aria-pressed={!isDark}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
              !isDark
                ? "border-accent bg-muted font-medium"
                : "border-border hover:bg-muted/60"
            }`}
          >
            <Sun className="size-4" aria-hidden />
            {t("Light", "Sáng")}
          </button>
          <button
            type="button"
            onClick={() => setDarkMode(true)}
            aria-pressed={isDark}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
              isDark
                ? "border-accent bg-muted font-medium"
                : "border-border hover:bg-muted/60"
            }`}
          >
            <Moon className="size-4" aria-hidden />
            {t("Dark", "Tối")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["sans", "serif"] satisfies ReaderFont[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              track("prefs_change", { pref: "font" });
              setPrefs({ font: f });
            }}
            aria-pressed={prefs.font === f}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
              prefs.font === f
                ? "border-accent bg-muted"
                : "border-border hover:bg-muted/60"
            }`}
          >
            <span className={f === "serif" ? "font-serif text-xl" : "text-xl"}>
              Aa
            </span>
            <div className="text-xs text-muted-foreground">
              {f === "sans" ? t("Sans", "Không chân") : t("Serif", "Có chân")}
            </div>
          </button>
        ))}
      </div>

      <label className="block">
        <span className="mb-1.5 flex items-baseline justify-between text-xs text-muted-foreground">
          <span>{t("Text size", "Cỡ chữ")}</span>
          <span>{Math.round(prefs.fontSize * 100)}%</span>
        </span>
        <div className="flex items-center gap-2">
          <AArrowDown className="h-4 w-4 shrink-0 text-muted-foreground" />
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
          <AArrowUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs text-muted-foreground">
          {t("Density", "Mật độ")}
        </span>
        <div className="flex items-center gap-2">
          <Rows4 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={DENSITIES.indexOf(prefs.density)}
            onChange={(e) => {
              track("prefs_change", { pref: "density" });
              setPrefs({ density: DENSITIES[Number(e.target.value)] });
            }}
            className="reader-slider w-full"
            aria-label={t("Density", "Mật độ")}
          />
          <Rows2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </label>

      <div>
        <span className="mb-1.5 block text-xs text-muted-foreground">
          {t("Background", "Nền")}
        </span>
        <div className="flex gap-2.5">
          {BG_SWATCHES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setBg(s.key)}
              aria-label={s.key}
              aria-pressed={prefs.bg === s.key}
              style={{ background: s.color }}
              className={`h-6 w-6 shrink-0 rounded-full border ${
                prefs.bg === s.key
                  ? "border-accent ring-2 ring-accent ring-offset-2 ring-offset-background"
                  : "border-border"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
