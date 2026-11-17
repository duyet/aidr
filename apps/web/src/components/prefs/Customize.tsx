import { Button } from "@ui-sdk/react/button";
import { useTheme } from "next-themes";
import type { EventParams } from "../../lib/analytics/events";
import { track } from "../../lib/analytics/track";
import { useLang } from "../../lib/lang-context";
import {
  type Accent,
  applyReaderTheme,
  DEFAULT_PREFS,
  FEED_DAYS,
  type Highlight,
  type Layout,
  NEWS_COLS,
  type Prefs,
  type ReaderBg,
  type ReaderFont,
  type ReaderSections,
  TLDR_COLS,
  TLDR_COUNTS,
  type TldrView,
  usePrefs,
} from "../../lib/prefs";
import type { Lang } from "../../lib/types";
import { Bi } from "../Bi";
import { Choice, EYEBROW, Toggle } from "./controls";
import { LOOKS, type LookSpec, type Mode } from "./looks";

interface Text {
  vi: string;
  en: string;
}
type Option<V> = Text & { value: V; color?: string };

type EnumPref =
  | "layout"
  | "accent"
  | "highlight"
  | "headFont"
  | "font"
  | "newsCols"
  | "tldrCount"
  | "tldrCols"
  | "tldrView"
  | "feedDays";
type FlagPref = "thumbs" | "summaries" | "infiniteDays";

const LAYOUTS: Option<Layout>[] = [
  { value: "compact", vi: "Gọn", en: "Compact" },
  { value: "comfortable", vi: "Thường", en: "Normal" },
  { value: "newspaper", vi: "Báo giấy", en: "Newspaper" },
];
const MODES: Option<Mode>[] = [
  { value: "auto", vi: "Tự động", en: "Auto" },
  { value: "light", vi: "Sáng", en: "Light" },
  { value: "dark", vi: "Tối", en: "Dark" },
];
const BACKGROUNDS: Option<ReaderBg>[] = [
  { value: "default", vi: "Giấy", en: "Paper", color: "#FFFFFF" },
  { value: "gray", vi: "Xám", en: "Gray", color: "#E4E4DF" },
  { value: "black", vi: "Đen", en: "Black", color: "#000000" },
];
const ACCENTS: Option<Accent>[] = [
  { value: "yellow", vi: "Vàng", en: "Yellow", color: "#F5C518" },
  { value: "blue", vi: "Xanh dương", en: "Blue", color: "#4C8DFF" },
  { value: "green", vi: "Xanh lá", en: "Green", color: "#2BB673" },
  { value: "rose", vi: "Hồng", en: "Rose", color: "#F0527A" },
  { value: "violet", vi: "Tím", en: "Violet", color: "#8B5CF6" },
];
const HIGHLIGHTS: Option<Highlight>[] = [
  { value: "topic", vi: "Theo chủ đề", en: "By topic" },
  { value: "one", vi: "Một màu", en: "One color" },
  { value: "none", vi: "Tắt", en: "Off" },
];
const FONTS: Option<ReaderFont>[] = [
  { value: "serif", vi: "Có chân", en: "Serif" },
  { value: "sans", vi: "Không chân", en: "Sans" },
];
const TEXT_SIZES: Option<number>[] = [
  { value: 0.94, vi: "A−", en: "A−" },
  { value: 1, vi: "100%", en: "100%" },
  { value: 1.12, vi: "A+", en: "A+" },
  { value: 1.24, vi: "A++", en: "A++" },
];
const TLDR_VIEWS: Option<TldrView>[] = [
  { value: "image", vi: "Ảnh", en: "Image" },
  { value: "text", vi: "Chữ", en: "Text" },
];
const LANGS: Option<Lang | "both">[] = [
  { value: "vi", vi: "VI", en: "VI" },
  { value: "en", vi: "EN", en: "EN" },
  { value: "both", vi: "VI + EN", en: "VI + EN" },
];
const LEADS: Option<Lang>[] = [
  { value: "vi", vi: "VI trước", en: "VI first" },
  { value: "en", vi: "EN trước", en: "EN first" },
];

const NEXT_THEME: Record<Mode, string> = {
  auto: "system",
  light: "light",
  dark: "dark",
};

function numbers<N extends number>(values: readonly N[]): Option<N>[] {
  return values.map((n) => ({ value: n, vi: String(n), en: String(n) }));
}

const onOff = (on: boolean) => (on ? "on" : "off");

function choiceOptions<V>(options: readonly Option<V>[]) {
  return options.map((o) => ({
    value: String(o.value),
    color: o.color,
    label: o.vi === o.en ? o.vi : <Bi vi={o.vi} en={o.en} />,
  }));
}

function nearest(options: readonly Option<number>[], value: number): number {
  return options.reduce((best, o) =>
    Math.abs(o.value - value) < Math.abs(best.value - value) ? o : best
  ).value;
}

// gray and black carry their own mode; paper and the legacy cream follow
// next-themes.
function modeOf(bg: ReaderBg, theme: string | undefined): Mode {
  if (bg === "black" || bg === "dark") return "dark";
  if (bg === "gray") return "light";
  return theme === "light" || theme === "dark" ? theme : "auto";
}

function isDefault(prefs: Prefs): boolean {
  return (Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]).every(
    (key) => JSON.stringify(prefs[key]) === JSON.stringify(DEFAULT_PREFS[key])
  );
}

function PrefChoice<P extends EnumPref>({
  pref,
  label,
  options,
  inline,
}: {
  pref: P;
  label: Text;
  options: readonly Option<Prefs[P]>[];
  inline?: boolean;
}) {
  const { prefs, setPrefs } = usePrefs();
  return (
    <Choice
      inline={inline}
      label={<Bi vi={label.vi} en={label.en} inline />}
      value={String(prefs[pref])}
      options={choiceOptions(options)}
      onPick={(raw) => {
        const picked = options.find((o) => String(o.value) === raw);
        if (!picked) return;
        track("prefs_change", {
          pref,
          pref_value: String(picked.value),
        } as EventParams<"prefs_change">);
        setPrefs({ [pref]: picked.value } as Partial<Prefs>);
      }}
    />
  );
}

export function Customize({
  onLangChange,
  langDisabled,
}: {
  onLangChange: (lang: Lang) => void;
  langDisabled: boolean;
}) {
  const lang = useLang();
  const { prefs, setPrefs } = usePrefs();
  const { theme, setTheme } = useTheme();
  const mode = modeOf(prefs.bg, theme);

  const lead = (next: Lang) => {
    if (!langDisabled && next !== lang) onLangChange(next);
  };

  const applyTheme = (bg: ReaderBg | undefined, nextMode: Mode | undefined) => {
    if (bg === "gray" || bg === "black") applyReaderTheme(bg);
    else if (nextMode) setTheme(NEXT_THEME[nextMode]);
  };

  const setFlag = (pref: FlagPref, on: boolean) => {
    track("prefs_change", { pref, pref_value: onOff(on) });
    setPrefs({ [pref]: on } as Partial<Prefs>);
  };

  const setSection = (section: keyof ReaderSections, on: boolean) => {
    track("prefs_change", {
      pref: `sections.${section}`,
      pref_value: onOff(on),
    });
    setPrefs({ sections: { ...prefs.sections, [section]: on } });
  };

  const setBilingual = (on: boolean) => {
    if (on === prefs.bilingual) return;
    track("prefs_change", { pref: "bilingual", pref_value: onOff(on) });
    setPrefs({ bilingual: on });
  };

  const pickLang = (value: string) => {
    if (value === "both") {
      setBilingual(true);
      lead(prefs.bilingualFirst);
    } else if (value === "vi" || value === "en") {
      setBilingual(false);
      lead(value);
    }
  };

  const pickLead = (value: string) => {
    if (value !== "vi" && value !== "en") return;
    track("prefs_change", { pref: "bilingualFirst", pref_value: value });
    setPrefs({ bilingualFirst: value });
    if (prefs.bilingual) lead(value);
  };

  const pickMode = (value: string) => {
    const next = MODES.find((o) => o.value === value)?.value;
    if (!next) return;
    track("prefs_change", { pref: "theme", pref_value: next });
    setPrefs({ bg: "default" });
    applyTheme("default", next);
  };

  const pickBg = (value: string) => {
    const bg = BACKGROUNDS.find((o) => o.value === value)?.value;
    if (!bg) return;
    track("prefs_change", { pref: "bg", pref_value: bg });
    setPrefs({ bg });
    applyTheme(bg, mode);
  };

  const pickSize = (value: string) => {
    track("prefs_change", { pref: "fontSize" });
    setPrefs({ fontSize: Number(value) });
  };

  const applyLook = (look: LookSpec) => {
    track("prefs_change", { pref: "look", pref_value: look.id });
    setPrefs(look.prefs);
    applyTheme(look.prefs.bg, look.mode);
    const next = { ...prefs, ...look.prefs };
    if (next.bilingual) lead(next.bilingualFirst);
  };

  const reset = () => {
    track("prefs_change", { pref: "reset" });
    setPrefs({ ...DEFAULT_PREFS });
    applyTheme(DEFAULT_PREFS.bg, "auto");
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className={EYEBROW}>
          <Bi vi="Bộ nhanh" en="Quick looks" inline />
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {LOOKS.map((look) => (
            <Button
              key={look.id}
              onClick={() => applyLook(look)}
              className="rounded-xl bg-muted p-2.5 text-left text-[12.5px] font-semibold leading-tight text-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--foreground)_10%,var(--muted))]"
            >
              <Bi vi={look.vi} en={look.en} inline />{" "}
              <span className="mt-0.5 block font-normal text-muted-foreground">
                <Bi vi={look.hintVi} en={look.hintEn} inline />
              </span>
            </Button>
          ))}
        </div>
      </section>

      <PrefChoice
        pref="layout"
        label={{ vi: "Bố cục", en: "Layout" }}
        options={LAYOUTS}
      />

      <div className="flex flex-col gap-2.5">
        <Choice
          label={<Bi vi="Ngôn ngữ" en="Language" inline />}
          value={prefs.bilingual ? "both" : lang}
          options={choiceOptions(LANGS)}
          onPick={pickLang}
          disabled={langDisabled}
        />
        <Choice
          label={<Bi vi="Hiện trước" en="Shown first" inline />}
          description={
            <Bi
              vi="Ở chế độ song ngữ, chọn ngôn ngữ đứng trên"
              en="In bilingual mode, pick which language leads"
              inline
            />
          }
          value={prefs.bilingualFirst}
          options={choiceOptions(LEADS)}
          onPick={pickLead}
          disabled={langDisabled}
        />
      </div>

      <Choice
        label={<Bi vi="Chế độ" en="Mode" inline />}
        value={mode}
        options={choiceOptions(MODES)}
        onPick={pickMode}
      />

      <Choice
        label={<Bi vi="Nền" en="Background" inline />}
        value={BACKGROUNDS.some((o) => o.value === prefs.bg) ? prefs.bg : null}
        options={choiceOptions(BACKGROUNDS)}
        onPick={pickBg}
      />

      <PrefChoice
        pref="accent"
        label={{ vi: "Màu nhấn", en: "Accent" }}
        options={ACCENTS}
      />
      <PrefChoice
        pref="highlight"
        label={{ vi: "Làm nổi bật theo chủ đề", en: "Highlight by topic" }}
        options={HIGHLIGHTS}
      />
      <PrefChoice
        pref="headFont"
        label={{ vi: "Phông tiêu đề", en: "Headlines" }}
        options={FONTS}
      />
      <PrefChoice
        pref="font"
        label={{ vi: "Phông nội dung", en: "Body" }}
        options={FONTS}
      />

      <Choice
        label={<Bi vi="Cỡ chữ" en="Text size" inline />}
        value={String(nearest(TEXT_SIZES, prefs.fontSize))}
        options={choiceOptions(TEXT_SIZES)}
        onPick={pickSize}
      />

      <PrefChoice
        pref="newsCols"
        label={{ vi: "Số cột báo giấy", en: "Newspaper columns" }}
        options={numbers(NEWS_COLS)}
      />

      <section className="flex flex-col gap-2.5">
        <h3 className={EYEBROW}>
          <Bi vi="Hiển thị" en="Show" inline />
        </h3>
        <Toggle
          label={<Bi vi="Thẻ AI;DR" en="AI;DR card" inline />}
          checked={prefs.sections.tldr}
          onChange={(on) => setSection("tldr", on)}
        />
        <PrefChoice
          inline
          pref="tldrCount"
          label={{ vi: "Số ý AI;DR", en: "AI;DR items" }}
          options={numbers(TLDR_COUNTS)}
        />
        <PrefChoice
          inline
          pref="tldrCols"
          label={{ vi: "Số cột AI;DR", en: "AI;DR columns" }}
          options={numbers(TLDR_COLS)}
        />
        <PrefChoice
          inline
          pref="tldrView"
          label={{ vi: "AI;DR dạng", en: "AI;DR as" }}
          options={TLDR_VIEWS}
        />
        <Toggle
          label={<Bi vi="Trending" en="Trending" inline />}
          checked={prefs.sections.trending}
          onChange={(on) => setSection("trending", on)}
        />
        <Toggle
          label={<Bi vi="Ảnh nhỏ" en="Thumbnails" inline />}
          checked={prefs.thumbs}
          onChange={(on) => setFlag("thumbs", on)}
        />
        <Toggle
          label={<Bi vi="Tóm tắt dưới tiêu đề" en="Summaries" inline />}
          checked={prefs.summaries}
          onChange={(on) => setFlag("summaries", on)}
        />
        <Toggle
          label={<Bi vi="Chủ đề" en="Categories" inline />}
          checked={prefs.sections.categories}
          onChange={(on) => setSection("categories", on)}
        />
        <Toggle
          label={<Bi vi="Danh sách tin xếp hạng" en="Ranked list" inline />}
          checked={prefs.sections.days}
          onChange={(on) => setSection("days", on)}
        />
        <PrefChoice
          inline
          pref="feedDays"
          label={{ vi: "Số ngày hiển thị", en: "Days shown" }}
          options={numbers(FEED_DAYS)}
        />
        <Toggle
          label={
            <Bi
              vi="Tải thêm ngày khi cuộn"
              en="Load more days on scroll"
              inline
            />
          }
          checked={prefs.infiniteDays}
          onChange={(on) => setFlag("infiniteDays", on)}
        />
      </section>

      <Button
        onClick={reset}
        disabled={isDefault(prefs) && mode === "auto"}
        className="btn-soft self-start"
      >
        <Bi vi="Đặt lại mặc định" en="Reset to defaults" inline />
      </Button>
    </div>
  );
}
