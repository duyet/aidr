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
 * every piece of the player's own chrome suppressed: `controls=0` (transport
 * bar), `modestbranding=1` + `showinfo=0` (YouTube logo and title strip),
 * `fs=0` (fullscreen button), `iv_load_policy=3` (annotations) and
 * `disablekb=1` (the keyboard-shortcut hint). `playsinline=1` keeps iOS from
 * throwing the video into its own fullscreen player.
 */
export function introVideoEmbedUrl(id: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    controls: "0",
    modestbranding: "1",
    showinfo: "0",
    fs: "0",
    rel: "0",
    iv_load_policy: "3",
    disablekb: "1",
    playsinline: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params}`;
}
