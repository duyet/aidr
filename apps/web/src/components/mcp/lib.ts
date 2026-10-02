import { ADMIN_MCP_TOOL_NAMES } from "../../../worker/mcp/admin-tools";
import {
  MCP_READ_LIMIT,
  MCP_READ_WINDOW_SEC,
} from "../../../worker/mcp/rate-limit";
import {
  PUBLIC_READ_DAYS_MAX,
  PUBLIC_READ_DAYS_MIN,
  PUBLIC_READ_TOOLS,
  PUBLIC_READ_TRUST_NOTICE,
} from "../../lib/public-read-tools";
import { SITE_URL } from "../../lib/site";

/**
 * The public docs page is human-facing bilingual prose, but the FACTS it
 * states — tool names, order, operator tool list, rate-limit numbers — are
 * read straight off the contract modules rather than typed here. A docs
 * page that restates the tool list is a docs page that will be wrong
 * within one release; this one cannot be.
 *
 * Only the Vietnamese one-liners live here, because the contract module's
 * descriptions are English by design: they are protocol text read by a
 * model, not UI copy.
 */
export const READ_TOOLS = PUBLIC_READ_TOOLS;

export const READ_TOOL_VI: Record<string, string> = {
  latest_ai_news:
    "Bản tin xếp hạng: tối đa 8 tin nổi bật kèm TL;DR song ngữ. Giống hệt GET /api/public.",
  search_news:
    "Tìm tin đã đăng theo từ khoá, số ngày, chủ đề và ngày bắt đầu. Trả về kèm permalink, xu hướng và thống kê chủ đề.",
  get_story:
    "Đọc một tin đã đăng dưới dạng Markdown có giới hạn (aidr-story-markdown/v1) kèm permalink chuẩn.",
  get_ai_digest:
    "Chỉ lấy các gạch đầu dòng TL;DR cho một ngôn ngữ, mỗi gạch liên kết tới id của tin.",
};

export const ADMIN_TOOL_NAMES = ADMIN_MCP_TOOL_NAMES;

export const ADMIN_TOOL_VI: Record<string, string> = {
  push_items: "Đẩy một hoặc nhiều tin vào bảng tin.",
  list_sources: "Liệt kê tất cả nguồn tin đã cấu hình.",
  upsert_source: "Tạo mới hoặc cập nhật một nguồn tin.",
  delete_source: "Xóa một nguồn tin theo id.",
  trigger_ingest: "Kích hoạt một lượt thu thập tin tức mới.",
  get_status: "Xem 10 lượt chạy gần nhất và số lượng tin theo trạng thái.",
  preview_ranking:
    "Chỉ đọc: các tin đứng đầu hiện tại và dữ liệu tính điểm xếp hạng.",
  preview_tldr: "Xem trước TL;DR từ dữ liệu hiện tại mà không xuất bản.",
  set_day_video:
    "Gắn video YouTube (máy tính) và/hoặc Short (điện thoại) cho trang /date/YYYY-MM-DD.",
  delete_day_video: "Gỡ video và Short khỏi trang một ngày.",
};

/** Anonymous client config: no credential at all. */
export const PUBLIC_CLIENT_CONFIG = `{
  "url": "${SITE_URL}/api/mcp"
}`;

export const ADMIN_CLIENT_CONFIG = `{
  "url": "${SITE_URL}/api/mcp",
  "headers": { "Authorization": "Bearer <token>" }
}`;

export const CLAUDE_CODE_EXAMPLE = `claude mcp add --transport http aidr \\
  ${SITE_URL}/api/mcp`;

export const CLAUDE_CODE_ADMIN_EXAMPLE = `claude mcp add --transport http aidr-admin \\
  ${SITE_URL}/api/mcp \\
  --header "Authorization: Bearer <token>"`;

export const PUSH_ITEM_EXAMPLE = `curl -X POST ${SITE_URL}/api/admin/items \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/post","title":"New AI model released"}'`;

export const READ_TOOLS_CALL_EXAMPLE = `curl -X POST ${SITE_URL}/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"latest_ai_news","arguments":{"lang":"en"}}}'`;

export const RESOURCES_CALL_EXAMPLE = `curl -X POST ${SITE_URL}/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"aidr://digest?lang=vi"}}'`;

export const READ_RATE_LIMIT = MCP_READ_LIMIT;
export const READ_RATE_WINDOW_SEC = MCP_READ_WINDOW_SEC;
export const DAYS_RANGE = `${PUBLIC_READ_DAYS_MIN}–${PUBLIC_READ_DAYS_MAX}`;
export { PUBLIC_READ_TRUST_NOTICE };
