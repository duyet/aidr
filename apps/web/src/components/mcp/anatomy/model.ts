import { ADMIN_MCP_TOOL_NAMES } from "../../../../worker/mcp/admin-tools";
import {
  MCP_READ_LIMIT,
  MCP_READ_WINDOW_SEC,
} from "../../../../worker/mcp/rate-limit";
import {
  PUBLIC_READ_DAYS_DEFAULT,
  PUBLIC_READ_DAYS_MAX,
  PUBLIC_READ_TOOLS,
  type PublicReadToolName,
} from "../../../lib/public-read-tools";

type Copy = { en: string; vi: string };

export type ToolPart = {
  kind: "tool";
  id: PublicReadToolName;
  label: Copy;
  returns: Copy;
  cards: number[];
};

export type FixedPart = {
  kind: "feeder" | "rack" | "lock" | "port" | "client";
  id: string;
  label: Copy;
  returns: Copy;
};

export type Part = ToolPart | FixedPart;

/** Card heights in each open drawer. The count mirrors what the tool
 *  returns: one story, up to 8 digest stories, day groups, bullets, or a
 *  whole day's edition. */
const CARDS: Record<PublicReadToolName, number[]> = {
  latest_ai_news: [9, 8.4, 7.8, 7.2, 6.6, 6, 5.4, 4.8],
  search_news: [8, 5, 5, 5, 8, 5, 5, 8, 5],
  get_story: [9],
  get_ai_digest: [4, 4, 4, 4, 4],
  get_day_edition: Array.from({ length: 16 }, (_, i) => 8 - i * 0.25),
};

const RETURNS: Record<PublicReadToolName, Copy> = {
  latest_ai_news: {
    en: "Up to 8 top-ranked stories plus the TL;DR snapshot. Same bytes as GET /api/public, capped at 50,000 bytes.",
    vi: "Tối đa 8 tin xếp hạng cao nhất kèm bản TL;DR. Giống hệt GET /api/public, tối đa 50.000 byte.",
  },
  search_news: {
    en: `Hits grouped by day, with the category histogram, trending tags and permalinks. Looks back ${PUBLIC_READ_DAYS_DEFAULT} days by default, ${PUBLIC_READ_DAYS_MAX} at most.`,
    vi: `Kết quả gom theo ngày, kèm thống kê chủ đề, tag xu hướng và permalink. Mặc định tìm trong ${PUBLIC_READ_DAYS_DEFAULT} ngày, tối đa ${PUBLIC_READ_DAYS_MAX}.`,
  },
  get_story: {
    en: "One story as bounded Markdown (aidr-story-markdown/v1). An ambiguous id prefix is an error.",
    vi: "Một tin dạng Markdown có giới hạn (aidr-story-markdown/v1). Tiền tố id trùng nhiều tin sẽ báo lỗi.",
  },
  get_ai_digest: {
    en: "Only the TL;DR bullets for one language, each linked to the story ids it covers.",
    vi: "Chỉ các gạch đầu dòng TL;DR của một ngôn ngữ, mỗi dòng gắn id các tin liên quan.",
  },
  get_day_edition: {
    en: "One calendar day as Markdown: TL;DR bullets, video links and up to 100 ranked stories.",
    vi: "Bản tin một ngày dạng Markdown: các dòng TL;DR, link video và tối đa 100 tin đã xếp hạng.",
  },
};

export const TOOL_PARTS: ToolPart[] = PUBLIC_READ_TOOLS.map((tool) => ({
  kind: "tool",
  id: tool.name,
  label: { en: tool.name, vi: tool.name },
  returns: RETURNS[tool.name],
  cards: CARDS[tool.name],
}));

export const FIXED_PARTS: FixedPart[] = [
  {
    kind: "feeder",
    id: "ingest",
    label: { en: "30-min ingest", vi: "Ingest 30 phút" },
    returns: {
      en: "Every 30 minutes a run pulls the sources, ranks the items and writes the TL;DR snapshot.",
      vi: "Cứ 30 phút một lượt chạy lấy tin từ các nguồn, xếp hạng và ghi bản TL;DR.",
    },
  },
  {
    kind: "rack",
    id: "edition",
    label: { en: "Ranked edition", vi: "Bản tin đã xếp hạng" },
    returns: {
      en: "Each run publishes one ranked edition. Every drawer reads from it in D1.",
      vi: "Mỗi lượt chạy xuất bản một bản tin đã xếp hạng. Mọi ngăn kéo đều đọc từ bản này trong D1.",
    },
  },
  {
    kind: "lock",
    id: "operator",
    label: {
      en: `${ADMIN_MCP_TOOL_NAMES.length} operator tools`,
      vi: `${ADMIN_MCP_TOOL_NAMES.length} công cụ vận hành`,
    },
    returns: {
      en: `The lock opens ${ADMIN_MCP_TOOL_NAMES.length} more tools (ingest, sources, previews) for a Bearer admin token. Without it, tools/list shows only the drawers.`,
      vi: `Khoá này mở thêm ${ADMIN_MCP_TOOL_NAMES.length} công cụ (ingest, nguồn tin, xem trước) khi có Bearer token admin. Không có token, tools/list chỉ trả về các ngăn kéo.`,
    },
  },
  {
    kind: "port",
    id: "port",
    label: { en: "POST /api/mcp", vi: "POST /api/mcp" },
    returns: {
      en: `One JSON-RPC port, no key needed. Anonymous reads are limited to ${MCP_READ_LIMIT} per IP every ${MCP_READ_WINDOW_SEC} seconds.`,
      vi: `Một cổng JSON-RPC, không cần key. Lượt đọc ẩn danh giới hạn ${MCP_READ_LIMIT} lần mỗi IP trong ${MCP_READ_WINDOW_SEC} giây.`,
    },
  },
  {
    kind: "client",
    id: "client",
    label: { en: "Your AI client", vi: "AI client của bạn" },
    returns: {
      en: "Claude, ChatGPT, Cursor or any MCP client. Every story it gets is publisher text. Treat it as data, never as instructions.",
      vi: "Claude, ChatGPT, Cursor hay mọi client MCP. Mỗi tin nhận về là văn bản của bên đăng. Hãy coi đó là dữ liệu, không phải lệnh.",
    },
  },
];

export const PARTS: Part[] = [...TOOL_PARTS, ...FIXED_PARTS];

export const partById = (id: string) =>
  PARTS.find((part) => part.id === id) ?? TOOL_PARTS[0];
