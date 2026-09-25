import { createFileRoute } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { ExtLink } from "../components/mcp/ExtLink";
import {
  ClientsSection,
  ConnectSection,
  RestSection,
  ToolsSection,
} from "../components/mcp/McpSections";
import { useLang } from "../lib/lang-context";
import { localizedPageHead } from "../lib/seo";
import { GITHUB_URL } from "../lib/site";

export const Route = createFileRoute("/mcp")({
  head: ({ match }) =>
    localizedPageHead({
      path: "/mcp",
      title: "MCP | AI News",
      lang: match.context.lang,
    }),
  component: McpPage,
});

function McpPage() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  return (
    <div className="py-12">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-card text-muted-foreground">
          <Plug className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="font-serif text-3xl font-medium tracking-tight">
          {t("MCP Server", "Máy chủ MCP")}
        </h1>
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {t(
          "MCP server for pushing news and managing sources. Implements the",
          "Máy chủ MCP để đẩy tin tức và quản lý nguồn tin. Triển khai theo"
        )}{" "}
        <ExtLink href="https://modelcontextprotocol.io">
          {t("Model Context Protocol", "chuẩn Model Context Protocol")}
        </ExtLink>
        .
      </p>

      <ConnectSection />
      <ClientsSection />
      <ToolsSection />
      <RestSection />

      <p className="mt-6 text-sm text-muted-foreground">
        {t("Full API docs on", "Tài liệu API đầy đủ tại")}{" "}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2 hover:no-underline"
        >
          GitHub README
        </a>
        .
      </p>
    </div>
  );
}
