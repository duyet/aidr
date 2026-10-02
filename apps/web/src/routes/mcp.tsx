import { createFileRoute } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { ExtLink } from "../components/mcp/ExtLink";
import {
  AdminClientSection,
  AuthSection,
  ClientsSection,
  ConnectSection,
  ReadToolsSection,
  ResourcesSection,
  RestSection,
  TrustSection,
} from "../components/mcp/McpSections";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import { localizedPageHead } from "../lib/seo";
import { GITHUB_URL } from "../lib/site";

export const Route = createFileRoute("/mcp")({
  head: ({ match }) =>
    localizedPageHead({
      path: "/mcp",
      title: "MCP | AI News",
      description:
        "Read the AI;DR digest and individual stories from an agent through the Model Context Protocol.",
      lang: match.context.lang,
      route: headRouteInput(match),
    }),
  component: McpPage,
});

/**
 * This page is the public, indexed documentation for `/api/mcp`. It used
 * to document only the six operator tools, which is why an agent that read
 * it — or the machine-discovery card, which advertised an anonymous read
 * surface — got a 401 on its first call. It now leads with the read tools,
 * which need nothing, and states the credential boundary once.
 */
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
          "Read ranked AI news over MCP with no authentication, and run the ingest pipeline as an operator. Implements the",
          "Đọc tin AI đã xếp hạng qua MCP mà không cần xác thực, và điều khiển pipeline ingest ở vai trò vận hành. Triển khai theo"
        )}{" "}
        <ExtLink href="https://modelcontextprotocol.io">
          {t("Model Context Protocol", "chuẩn Model Context Protocol")}
        </ExtLink>
        .
      </p>

      <ConnectSection />
      <ClientsSection />
      <ReadToolsSection />
      <TrustSection />
      <ResourcesSection />
      <AuthSection />
      <AdminClientSection />
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
