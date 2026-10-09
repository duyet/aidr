/**
 * Release notes shown at /release/$version. One file per version under
 * `apps/web/src/content/releases/`, registered in `./index.ts`.
 * Every reader-facing string is bilingual; Vietnamese never falls back to
 * English.
 */

export interface Bilingual {
  en: string;
  vi: string;
}

export interface ReleaseImage {
  /** Path under `apps/web/public`, e.g. `/releases/v0.1.0/day-page.png`. */
  src: string;
  width: number;
  height: number;
  alt: Bilingual;
  caption?: Bilingual;
}

export interface ReleaseHighlight {
  /** Short bold lead-in, e.g. "Day pages". */
  label: Bilingual;
  /** One or two sentences on what readers get. */
  text: Bilingual;
  image?: ReleaseImage;
  /** In-site path or absolute URL to try the feature. */
  href?: string;
}

export type ChangeKind = "feature" | "fix" | "perf";

export interface ReleaseChange {
  kind: ChangeKind;
  /** Area, e.g. "web", "extension", "mail", "telegram". */
  scope?: string;
  text: Bilingual;
  /** Short commit SHA (7 chars); linked to GitHub. */
  commit?: string;
  pr?: number;
}

export interface ReleaseStat {
  value: string;
  label: Bilingual;
}

export interface Release {
  /** Without the leading "v", e.g. "0.1.0". Used in the URL as `v0.1.0`. */
  version: string;
  /** ISO date the release shipped, YYYY-MM-DD. */
  date: string;
  /** Range covered, ISO dates. */
  from: string;
  to: string;
  /** Git refs bounding the release (tags or SHAs) for the compare link. */
  compare: { base: string; head: string };
  title: Bilingual;
  /** One-paragraph lead. */
  intro: Bilingual;
  stats: ReleaseStat[];
  highlights: ReleaseHighlight[];
  /** Hero screenshot; also the OG image. */
  cover?: ReleaseImage;
  /** YouTube video id of the release film, when uploaded. */
  youtubeId?: string;
  /** Vietnamese cut of the film; the vi page falls back to `youtubeId`. */
  youtubeIdVi?: string;
  changes: ReleaseChange[];
}
