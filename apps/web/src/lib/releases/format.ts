import { GITHUB_URL } from "../site";
import type { Lang } from "../types";
import type { Bilingual, ChangeKind, Release, ReleaseChange } from "./types";

export function t(text: Bilingual, lang: Lang): string {
  return lang === "vi" ? text.vi : text.en;
}

/** "Oct 10, 2026" / "10 thg 10, 2026". */
export function formatReleaseDate(date: string, lang: Lang): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatReleaseRange(release: Release, lang: Lang): string {
  return `${formatReleaseDate(release.from, lang)} – ${formatReleaseDate(release.to, lang)}`;
}

export function commitUrl(sha: string): string {
  return `${GITHUB_URL}/commit/${sha}`;
}

export function prUrl(n: number): string {
  return `${GITHUB_URL}/pull/${n}`;
}

export function compareUrl(release: Release): string {
  return `${GITHUB_URL}/compare/${release.compare.base}...${release.compare.head}`;
}

export const CHANGE_KINDS: ChangeKind[] = ["feature", "fix", "perf"];

export const CHANGE_KIND_LABEL: Record<ChangeKind, Bilingual> = {
  feature: { en: "Features", vi: "Tính năng" },
  fix: { en: "Fixes", vi: "Sửa lỗi" },
  perf: { en: "Performance", vi: "Hiệu năng" },
};

/** Changes grouped by kind, in `CHANGE_KINDS` order; empty kinds dropped. */
export function groupChanges(
  changes: ReleaseChange[]
): { kind: ChangeKind; items: ReleaseChange[] }[] {
  return CHANGE_KINDS.map((kind) => ({
    kind,
    items: changes.filter((c) => c.kind === kind),
  })).filter((group) => group.items.length > 0);
}

/** "AI;DR v0.1.0 — Title". */
export function releaseDocumentTitle(release: Release, lang: Lang): string {
  return `AI;DR v${release.version} — ${t(release.title, lang)}`;
}

/** The film to show for a language: the Vietnamese cut when present. */
export function releaseFilmId(
  release: Release,
  lang: Lang
): string | undefined {
  return lang === "vi"
    ? (release.youtubeIdVi ?? release.youtubeId)
    : release.youtubeId;
}
