import type { Lang } from "./types";

/**
 * YouTube id of the AI;DR introduction video (the part after `v=` in the
 * watch URL). The owner sets it after uploading the video. While it is
 * `null` the header renders no video control at all.
 */
export const INTRO_VIDEO_YOUTUBE_ID: string | null = "tynoWx03zDc";

/** Header video control and dialog copy. Each language has its own text. */
export const INTRO_VIDEO_COPY: Record<
  Lang,
  { open: string; menu: string; title: string }
> = {
  en: {
    open: "Watch the AI;DR intro video",
    menu: "Intro video",
    title: "What is AI;DR?",
  },
  vi: {
    open: "Xem video giới thiệu AI;DR",
    menu: "Video giới thiệu",
    title: "AI;DR là gì?",
  },
};

/**
 * Privacy-enhanced embed that starts playing as soon as it is mounted, with
 * the player controls hidden.
 */
export function introVideoEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&controls=0&rel=0`;
}
