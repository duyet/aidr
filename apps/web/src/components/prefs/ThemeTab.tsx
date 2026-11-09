import { Check, Moon, RotateCcw, Rows2, Rows4, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { track } from "../../lib/analytics/track";
import {
  applyReaderTheme,
  DEFAULT_PREFS,
  READER_DENSITIES,
  type ReaderBg,
  type ReaderDensity,
  type ReaderFont,
  usePrefs,
} from "../../lib/prefs";
import { PrefsRow, PrefsSlider, Segmented } from "./Segmented";

const BG_SWATCHES: {
  key: ReaderBg;
  color: string;
  en: string;
  vi: string;
  /** Check colour that contrasts with `color`. */
  check: string;
}[] = [
  {
    key: "default",
    color: "var(--background)",
    en: "Default",
    vi: "Mặc định",
    check: "text-foreground",
  },
  {
    key: "cream",
    color: "#faf6ec",
    en: "Cream",
    vi: "Kem",
    check: "text-neutral-900",
  },
  {
    key: "gray",
    color: "#d9d9d6",
    en: "Gray",
    vi: "Xám",
    check: "text-neutral-900",
  },
  { key: "dark", color: "#2a2a28", en: "Dark", vi: "Tối", check: "text-white" },
  {
    key: "black",
    color: "#000000",
    en: "Black",
    vi: "Đen",
    check: "text-white",
  },
];

const FONT_SIZE_MIN = 0.85;
const FONT_SIZE_MAX = 1.25;

const DENSITY_LABELS: Record<ReaderDensity, [string, string]> = {
  dense: ["Dense", "Rất sát"],
  compact: ["Compact", "Sát"],
  medium: ["Medium", "Vừa"],
  comfortable: ["Comfortable", "Thoáng"],
  relaxed: ["Relaxed", "Rộng"],
  spacious: ["Spacious", "Rất rộng"],
  airy: ["Airy", "Rộng nhất"],
};

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

  const sizeValue = Math.min(
    FONT_SIZE_MAX,
    Math.max(FONT_SIZE_MIN, prefs.fontSize)
  );
  const setSize = (value: number) => {
    track("prefs_change", { pref: "fontSize" });
    setPrefs({ fontSize: value });
  };

  const densityIndex = Math.max(0, READER_DENSITIES.indexOf(prefs.density));
  const setDensityIndex = (index: number) =>
    setDensity(READER_DENSITIES[index] ?? "medium");

  const setDensity = (density: ReaderDensity) => {
    track("prefs_change", { pref: "density", pref_value: density });
    setPrefs({ density });
  };

  return (
    <div className="space-y-0.5">
      <PrefsRow id="prefs-mode" label={t("Mode", "Chế độ")}>
        <Segmented
          labelledBy="prefs-mode"
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
      </PrefsRow>

      <PrefsRow id="prefs-bg" label={t("Background", "Nền")}>
        <fieldset aria-labelledby="prefs-bg" className="flex gap-1.5">
          {BG_SWATCHES.map((s) => {
            const on = prefs.bg === s.key;
            const name = t(s.en, s.vi);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setBg(s.key)}
                aria-label={name}
                title={name}
                aria-pressed={on}
                style={{ background: s.color }}
                className={`flex size-6 items-center justify-center rounded-full border border-border outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                  on
                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                    : "hover:ring-1 hover:ring-border hover:ring-offset-2 hover:ring-offset-card"
                }`}
              >
                {on && (
                  <Check
                    className={`size-3 ${s.check}`}
                    strokeWidth={3}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </fieldset>
      </PrefsRow>

      <div className="my-1.5 border-t border-border" />

      <PrefsRow id="prefs-font" label={t("Font", "Phông chữ")}>
        <Segmented
          labelledBy="prefs-font"
          value={prefs.font}
          onChange={(f: ReaderFont) => {
            track("prefs_change", { pref: "font", pref_value: f });
            setPrefs({ font: f });
          }}
          options={(["sans", "serif"] satisfies ReaderFont[]).map((f) => ({
            value: f,
            label: (
              <span
                style={
                  f === "serif"
                    ? { fontFamily: "var(--reader-font-serif)" }
                    : undefined
                }
              >
                {f === "sans" ? t("Sans", "Không chân") : t("Serif", "Có chân")}
              </span>
            ),
          }))}
        />
      </PrefsRow>

      <PrefsSlider
        id="prefs-size"
        label={t("Text size", "Cỡ chữ")}
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        step={0.05}
        value={sizeValue}
        onChange={setSize}
        readout={`${Math.round(prefs.fontSize * 100)}%`}
        start={
          <span className="text-[calc(10px*var(--reader-font-size,1))] leading-none">
            A
          </span>
        }
        end={
          <span className="text-[calc(15px*var(--reader-font-size,1))] leading-none">
            A
          </span>
        }
      />

      <PrefsSlider
        id="prefs-density"
        label={t("Density", "Mật độ")}
        min={0}
        max={READER_DENSITIES.length - 1}
        step={1}
        value={densityIndex}
        onChange={setDensityIndex}
        readout={t(...DENSITY_LABELS[prefs.density])}
        start={<Rows4 className="size-3.5" strokeWidth={2} />}
        end={<Rows2 className="size-3.5" strokeWidth={2} />}
      />

      <div className="flex justify-end border-t border-border pt-1.5 mt-1.5">
        <button
          type="button"
          onClick={resetAppearance}
          disabled={isDefault}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {t("Reset to default", "Khôi phục mặc định")}
        </button>
      </div>
    </div>
  );
}
