import type { PREF_VALUES } from "../../lib/analytics/events";
import type { Prefs } from "../../lib/prefs";

export type Look = (typeof PREF_VALUES)["look"][number];
export type Mode = (typeof PREF_VALUES)["theme"][number];

export interface LookSpec {
  id: Look;
  vi: string;
  en: string;
  hintVi: string;
  hintEn: string;
  prefs: Partial<Prefs>;
  // Left out when the background already sets the mode, or the look keeps it.
  mode?: Mode;
}

export const LOOKS: readonly LookSpec[] = [
  {
    id: "compact",
    vi: "Gọn",
    en: "Compact",
    hintVi: "Dày, nhanh, sans",
    hintEn: "Dense, fast, sans",
    prefs: {
      layout: "compact",
      headFont: "sans",
      font: "sans",
      thumbs: true,
      summaries: false,
      bg: "default",
      accent: "yellow",
    },
    mode: "auto",
  },
  {
    id: "newspaper",
    vi: "Báo giấy",
    en: "Newspaper",
    hintVi: "Báo giấy, serif",
    hintEn: "Print feel, serif",
    prefs: {
      layout: "newspaper",
      headFont: "serif",
      font: "serif",
      bg: "default",
      summaries: true,
      thumbs: true,
      accent: "yellow",
      newsCols: 2,
    },
    mode: "light",
  },
  {
    id: "night",
    vi: "Chế độ đêm",
    en: "Night desk",
    hintVi: "Đen, nhấn xanh",
    hintEn: "Black, blue accent",
    prefs: {
      layout: "compact",
      bg: "black",
      accent: "blue",
      headFont: "sans",
      font: "sans",
      thumbs: true,
      summaries: false,
    },
  },
  {
    id: "bilingual",
    vi: "Song ngữ",
    en: "Bilingual",
    hintVi: "VI trên, EN dưới",
    hintEn: "VI over EN",
    prefs: {
      bilingual: true,
      bilingualFirst: "vi",
      layout: "comfortable",
      summaries: true,
      headFont: "serif",
      font: "serif",
    },
  },
];
