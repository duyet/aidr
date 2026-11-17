import type { CSSProperties } from "react";
import { type CATEGORY_NAMES, categoryColor } from "./topic-color";
import type { Lang } from "./types";

type Category = (typeof CATEGORY_NAMES)[number];

/** Vietnamese names for the scoring taxonomy (redesign spec, then the
 * extension's CATEGORY_VI where the spec names none). Keys stay English: the
 * name is display text, filters and URLs keep the English key. */
const VI_NAMES: Record<Category, string> = {
  Models: "Model",
  Regulation: "Chính sách",
  Products: "Sản phẩm",
  Agents: "Tác nhân",
  Research: "Nghiên cứu",
  Industry: "Ngành",
  Legal: "Pháp lý",
  Infra: "Hạ tầng",
  Releases: "Phát hành",
  Chips: "Chip",
  Funding: "Gọi vốn",
  Tools: "Công cụ",
  Frameworks: "Frameworks",
  Data: "Dữ liệu",
  "Open Source": "Mã nguồn mở",
};

const VI_BY_KEY = new Map(
  Object.entries(VI_NAMES).map(([key, vi]) => [key.toLowerCase(), vi])
);

/** A category's display name. Unknown categories pass through unchanged. */
export function topicLabel(category: string, lang: Lang): string {
  if (lang === "en") return category;
  return VI_BY_KEY.get(category.trim().toLowerCase()) ?? category;
}

/** The two classes that paint with a topic's color (styles.css). Put them
 * inside an element that carries topicStyle(). The dot is decorative; the ink
 * colors a key name and follows the highlight pref. */
export const TOPIC_CLASS = { dot: "topic-dot", ink: "topic-ink" } as const;

/** Sets --tc-light/--tc-dark, the category's existing color pair from
 * topic-color.ts. Unknown categories get the neutral pair. */
export function topicStyle(category: string | null | undefined): CSSProperties {
  const color = categoryColor(category);
  return {
    "--tc-light": color.light,
    "--tc-dark": color.dark,
  } as CSSProperties;
}
