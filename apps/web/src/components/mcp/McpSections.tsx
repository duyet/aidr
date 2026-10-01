import { BookOpen, Plug, ShieldCheck, Terminal } from "lucide-react";
import { useLang } from "../../lib/lang-context";
import { SITE_URL } from "../../lib/site";
import { CodeBlock } from "./CodeBlock";
import { ExtLink } from "./ExtLink";
import {
  ADMIN_CLIENT_CONFIG,
  ADMIN_TOOL_NAMES,
  ADMIN_TOOL_VI,
  CLAUDE_CODE_ADMIN_EXAMPLE,
  CLAUDE_CODE_EXAMPLE,
  DAYS_RANGE,
  PUBLIC_CLIENT_CONFIG,
  PUBLIC_READ_TRUST_NOTICE,
  PUSH_ITEM_EXAMPLE,
  READ_RATE_LIMIT,
  READ_RATE_WINDOW_SEC,
  READ_TOOL_VI,
  READ_TOOLS,
  READ_TOOLS_CALL_EXAMPLE,
  RESOURCES_CALL_EXAMPLE,
} from "./lib";

/**
 * Anonymous first, operator second.
 *
 * The page used to open with "every request needs a bearer token", which
 * was true and also hid the fact that the site already served a complete
 * read API. Now the read tools lead, the auth boundary is stated exactly
 * once in its own section, and the operator tools are a clearly separated
 * appendix.
 */
export function ConnectSection() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Plug className="h-3.5 w-3.5" aria-hidden />
        {t("Connect (no auth)", "Kết nối (không cần auth)")}
      </h2>
      <CodeBlock code={PUBLIC_CLIENT_CONFIG} />
      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          "No header, no token, no key. These four read tools are rate limited per IP; operator tools need a bearer token.",
          "Không header, không token, không key. Bốn công cụ đọc này bị giới hạn theo IP; công cụ vận hành cần bearer token."
        )}
      </p>
    </section>
  );
}

export function ClientsSection() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Terminal className="h-3.5 w-3.5" aria-hidden />
        {t("Use with your app", "Dùng với ứng dụng của bạn")}
      </h2>
      <div className="mt-2 space-y-3 text-sm">
        <div>
          <p className="font-semibold text-foreground">
            <ExtLink href="https://docs.claude.com/en/docs/claude-code/mcp">
              Claude Code
            </ExtLink>
          </p>
          <CodeBlock code={CLAUDE_CODE_EXAMPLE} />
        </div>
        <div>
          <p className="font-semibold text-foreground">
            <ExtLink href="https://modelcontextprotocol.io/quickstart/user">
              Claude Desktop
            </ExtLink>
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(
              "Use the same connect config above.",
              "Dùng cấu hình kết nối ở trên."
            )}{" "}
            {t(
              "Paste it under Settings → Developer → Edit Config.",
              "Dán vào Settings → Developer → Edit Config."
            )}
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground">
            <ExtLink href="https://platform.openai.com/docs/actions">
              ChatGPT
            </ExtLink>
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(
              "Add it as a connector with the same URL and no headers.",
              "Thêm làm connector với cùng URL và không cần header."
            )}
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground">
            {t("Other MCP clients", "Client MCP khác")}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(
              "Any MCP-capable client works the same way — e.g.",
              "Bất kỳ client hỗ trợ MCP nào cũng dùng được — vd."
            )}{" "}
            <ExtLink href="https://cursor.com/docs/context/mcp">Cursor</ExtLink>
            {" — "}
            {t("the URL is all you need.", "chỉ cần URL.")}
          </p>
        </div>
      </div>
    </section>
  );
}

export function ReadToolsSection() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <section className="mt-6">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t("Read tools (no auth)", "Công cụ đọc (không cần auth)")}
      </h2>
      <div className="mt-2 divide-y divide-border rounded-md border border-border text-sm">
        {READ_TOOLS.map((tool) => (
          <div
            key={tool.name}
            className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3"
          >
            <code className="shrink-0 text-xs font-semibold sm:w-40">
              {tool.name}
            </code>
            <span className="text-muted-foreground">
              {lang === "vi" && READ_TOOL_VI[tool.name]
                ? READ_TOOL_VI[tool.name]
                : shortDescription(tool.description)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          `Every read tool declares readOnlyHint and untrustedContentHint. days is an integer in ${DAYS_RANGE}; before is YYYY-MM-DD; id is a lowercase hex prefix and an ambiguous prefix is an error, never a guess.`,
          `Mọi công cụ đọc đều khai báo readOnlyHint và untrustedContentHint. days là số nguyên trong ${DAYS_RANGE}; before là YYYY-MM-DD; id là tiền tố hex viết thường, tiền tố mơ hồ sẽ báo lỗi chứ không đoán.`
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("Same payload as REST:", "Cùng dữ liệu với REST:")}{" "}
        <CodeInline>/api/public</CodeInline>, <CodeInline>/api/feed</CodeInline>
        , <CodeInline>{"/api/story/{id}.md"}</CodeInline>
      </p>
    </section>
  );
}

/** First sentence of a contract description, for a table cell. The full
 *  text is what an agent reads over JSON-RPC; the page shows the claim. */
function shortDescription(description: string): string {
  const [first] = description.split(". ");
  return first ? `${first}.` : description;
}

function CodeInline({ children }: { children: string }) {
  return <code className="text-xs">{children}</code>;
}

export function TrustSection() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        {t("Trust boundary and limits", "Ranh giới tin cậy và giới hạn")}
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t(PUBLIC_READ_TRUST_NOTICE, PUBLIC_READ_TRUST_NOTICE)}</li>
        <li>
          {t(
            `Anonymous read calls are limited to ${READ_RATE_LIMIT} per IP per ${READ_RATE_WINDOW_SEC} seconds. Over the limit: HTTP 429, a JSON-RPC -32000 error, and a Retry-After header.`,
            `Lượt đọc ẩn danh bị giới hạn ${READ_RATE_LIMIT} lần mỗi IP trong ${READ_RATE_WINDOW_SEC} giây. Vượt quá: HTTP 429, lỗi JSON-RPC -32000 và header Retry-After.`
          )}
        </li>
        <li>
          {t(
            "Every read result is bounded to the same 50,000-byte cap as GET /api/public.",
            "Mọi kết quả đọc bị giới hạn ở 50.000 byte — cùng mức với GET /api/public."
          )}
        </li>
        <li>
          {t(
            "This endpoint is noindex, nofollow and must not be crawled.",
            "Endpoint này là noindex, nofollow và không được thu thập."
          )}
        </li>
      </ul>
    </section>
  );
}

export function AuthSection() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <section className="mt-6">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t("Operator tools (admin token)", "Công cụ vận hành (token admin)")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(
          "Sending Authorization: Bearer <admin token> adds the operator tools on top of the read tools. A wrong token gets a plain HTTP 401, never a silent downgrade to read-only.",
          "Gửi Authorization: Bearer <admin token> sẽ bổ sung công cụ vận hành bên cạnh công cụ đọc. Token sai nhận HTTP 401 thuần, không bao giờ tự hạ xuống chỉ-đọc."
        )}
      </p>
      <CodeBlock code={ADMIN_CLIENT_CONFIG} />
      <div className="mt-3 divide-y divide-border rounded-md border border-border text-sm">
        {ADMIN_TOOL_NAMES.map((name) => (
          <div
            key={name}
            className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3"
          >
            <code className="shrink-0 text-xs font-semibold sm:w-40">
              {name}
            </code>
            <span className="text-muted-foreground">
              {lang === "vi" ? ADMIN_TOOL_VI[name] : ADMIN_EN[name]}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          "An unauthenticated tools/list never returns these names, and an anonymous call to one of them fails without revealing which tools exist.",
          "tools/list không auth không bao giờ trả về các tên này, và gọi ẩn danh sẽ thất bại mà không tiết lộ những công cụ nào tồn tại."
        )}
      </p>
    </section>
  );
}

const ADMIN_EN: Record<string, string> = {
  push_items: "Push one or more news items into the feed.",
  list_sources: "List all configured news sources.",
  upsert_source: "Create or update a news source.",
  delete_source: "Delete a news source by id.",
  trigger_ingest: "Trigger a new news ingestion workflow run.",
  get_status: "Get the last 10 workflow runs and item counts by status.",
  preview_ranking: "Read-only: current top items with their rank score inputs.",
  preview_tldr: "Preview the TL;DR from current data without publishing it.",
};

export function ResourcesSection() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <section className="mt-6">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t("Resources", "Tài nguyên")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(
          "resources/list returns aidr://digest?lang=en and aidr://digest?lang=vi; resources/read also accepts aidr://story/{id}?lang=.",
          "resources/list trả về aidr://digest?lang=en và aidr://digest?lang=vi; resources/read còn nhận aidr://story/{id}?lang=."
        )}
      </p>
      <CodeBlock code={RESOURCES_CALL_EXAMPLE} />
    </section>
  );
}

export function RestSection() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" aria-hidden />
        {t("Try a read call", "Thử một lượt đọc")}
      </h2>
      <CodeBlock code={READ_TOOLS_CALL_EXAMPLE} />
      <p className="mt-2 text-xs text-muted-foreground">
        {t("Push an item via REST:", "Thêm một tin qua REST:")}
      </p>
      <CodeBlock code={PUSH_ITEM_EXAMPLE} />
    </section>
  );
}

export function AdminClientSection() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <section className="mt-6">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t("Operator client config", "Cấu hình client vận hành")}
      </h2>
      <CodeBlock code={CLAUDE_CODE_ADMIN_EXAMPLE} />
      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          `Authentication details: ${SITE_URL}/auth.md`,
          `Chi tiết xác thực: ${SITE_URL}/auth.md`
        )}
      </p>
    </section>
  );
}
