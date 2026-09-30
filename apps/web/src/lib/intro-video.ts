import type { Lang } from "./types";

/**
 * YouTube id of the AI;DR introduction video (the part after `v=` in the
 * watch URL). The owner sets it after uploading the video. While it is
 * `null` the header renders no video control at all.
 */
export const INTRO_VIDEO_YOUTUBE_ID: string | null = null;

/** Header video control and dialog copy. Each language has its own text. */
export const INTRO_VIDEO_COPY: Record<
  Lang,
  { open: string; menu: string; title: string; close: string }
> = {
  en: {
    open: "Watch the AI;DR intro video",
    menu: "Intro video",
    title: "What is AI;DR?",
    close: "Close",
  },
  vi: {
    open: "Xem video giới thiệu AI;DR",
    menu: "Video giới thiệu",
    title: "AI;DR là gì?",
    close: "Đóng",
  },
};

/** Privacy-enhanced embed that starts playing as soon as it is mounted. */
export function introVideoEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
}
