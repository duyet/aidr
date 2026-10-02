import type {
  StoryRanking,
  TelegramTrendingStatus,
} from "../../../worker/notify/story-ranking";
import type { Lang } from "../../lib/types";
import { formatStoryScore } from "./story-meta";

export type { StoryRanking };

const REASON_COPY = {
  en: {
    below_rank: (r: StoryRanking) =>
      `Not posted: score ${formatStoryScore(r.rankScore)} is below the trending bar ${formatStoryScore(r.bar)}.`,
    below_importance: (r: StoryRanking) =>
      `Not posted: importance ${r.importance ?? "—"} is below ${r.importanceMin}.`,
    too_old: () => "Not posted: older than the 24h trending window.",
    outside_hours: () =>
      "Not posted yet: trending posts only go out 09:00–23:00 local time.",
    budget_spent: () => "Not posted: today's trending cap or gap is used up.",
    pending: () => "Qualifies; waiting for the next hourly run.",
    ambiguous: () => "Telegram did not confirm delivery; not retried.",
    posted: (at: string) => `Posted ${at}`,
  },
  vi: {
    below_rank: (r: StoryRanking) =>
      `Chưa đăng: điểm ${formatStoryScore(r.rankScore)} thấp hơn ngưỡng nổi bật ${formatStoryScore(r.bar)}.`,
    below_importance: (r: StoryRanking) =>
      `Chưa đăng: độ quan trọng ${r.importance ?? "—"} thấp hơn ${r.importanceMin}.`,
    too_old: () => "Chưa đăng: đã quá cửa sổ nổi bật 24 giờ.",
    outside_hours: () =>
      "Chưa đăng: bài nổi bật chỉ đăng trong 09:00–23:00 giờ địa phương.",
    budget_spent: () =>
      "Chưa đăng: đã hết hạn mức hoặc khoảng cách đăng trong ngày.",
    pending: () => "Đủ điều kiện; chờ lượt chạy hàng giờ tiếp theo.",
    ambiguous: () => "Telegram chưa xác nhận đã gửi; không gửi lại.",
    posted: (at: string) => `Đã đăng ${at}`,
  },
} as const;

/** One human sentence for a channel's trending outcome. */
export function describeTelegramStatus(
  lang: Lang,
  status: TelegramTrendingStatus,
  ranking: StoryRanking,
  formatTime: (ms: number) => string
): string {
  const copy = REASON_COPY[lang];
  if (status.state === "posted")
    return copy.posted(formatTime(status.postedAt));
  if (status.state === "ambiguous") return copy.ambiguous();
  return copy[status.reason](ranking);
}
