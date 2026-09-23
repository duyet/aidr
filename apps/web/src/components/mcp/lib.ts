export const TOOLS = [
  {
    name: "push_items",
    en: "Push one or more news items into the feed.",
    vi: "Thêm một hoặc nhiều tin tức vào bảng tin.",
  },
  {
    name: "list_sources",
    en: "List all configured news sources.",
    vi: "Liệt kê tất cả nguồn tin đã cấu hình.",
  },
  {
    name: "upsert_source",
    en: "Create or update a news source.",
    vi: "Tạo mới hoặc cập nhật một nguồn tin.",
  },
  {
    name: "delete_source",
    en: "Delete a news source by id.",
    vi: "Xóa một nguồn tin theo id.",
  },
  {
    name: "trigger_ingest",
    en: "Trigger a new news ingestion workflow run.",
    vi: "Kích hoạt một lượt thu thập tin tức mới.",
  },
  {
    name: "get_status",
    en: "Get the last 10 workflow runs and item counts grouped by status.",
    vi: "Xem 10 lượt chạy gần nhất và số lượng tin theo trạng thái.",
  },
];

export const CLIENT_CONFIG = `{
  "url": "https://aidr.today/api/mcp",
  "headers": { "Authorization": "Bearer <token>" }
}`;

export const PUSH_ITEM_EXAMPLE = `curl -X POST https://aidr.today/api/admin/items \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/post","title":"New AI model released"}'`;

export const CLAUDE_CODE_EXAMPLE = `claude mcp add --transport http duyet-news \\
  https://aidr.today/api/mcp \\
  --header "Authorization: Bearer <token>"`;
