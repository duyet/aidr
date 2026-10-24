import { Button } from "@aidr/ui";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { track } from "../../lib/analytics/track";
import type { Lang } from "../../lib/types";
import { ClientsSection, ConnectSection } from "../mcp/McpSections";
import { ChannelSplit } from "./ChannelSplit";

export function McpChannel({ lang }: { lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  return (
    <ChannelSplit
      controls={
        <>
          <p className="text-base leading-relaxed text-muted-foreground">
            {t(
              "Ask your AI assistant for today's AI news. Add the AI;DR MCP server to Claude, ChatGPT, Cursor or any MCP client. No account, no key.",
              "Hỏi trợ lý AI của bạn về tin AI hôm nay. Thêm máy chủ MCP của AI;DR vào Claude, ChatGPT, Cursor hoặc bất kỳ ứng dụng nào hỗ trợ MCP. Không cần tài khoản, không cần khóa API."
            )}
          </p>
          <ConnectSection />
          <Button variant="outline" asChild>
            <Link
              to="/mcp"
              search={{ lang }}
              onClick={() =>
                track("nav_click", { to: "/mcp", placement: "subscribe_page" })
              }
            >
              {t("Tools and full setup", "Công cụ và hướng dẫn đầy đủ")}
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Link>
          </Button>
        </>
      }
      preview={
        <div className="rounded-xl border border-border bg-card p-6 [&>section]:mt-0">
          <ClientsSection />
        </div>
      }
    />
  );
}
