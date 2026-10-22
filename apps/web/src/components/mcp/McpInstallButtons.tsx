import { Button } from "@aidr/ui";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { useState } from "react";
import { track } from "../../lib/analytics/track";
import { useLang } from "../../lib/lang-context";
import { MCP_CLIENTS, type McpClient } from "../../lib/mcp-install";

type CopyClient = Extract<McpClient, { kind: "copy" }>;

function CopyButton({ client }: { client: CopyClient }) {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [copied, setCopied] = useState(false);
  const what =
    client.id === "claude-code" ? t("command", "lệnh") : t("URL", "địa chỉ");

  async function copy() {
    track("mcp_install", { target: client.id });
    try {
      await navigator.clipboard.writeText(client.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void copy()}
      aria-label={t(
        `Copy ${client.label} ${what}`,
        `Sao chép ${what} cho ${client.label}`
      )}
    >
      {copied ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
      {copied
        ? t("Copied", "Đã chép")
        : `${client.label}: ${t(`copy ${what}`, `chép ${what}`)}`}
    </Button>
  );
}

export function McpInstallButtons() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const claude = MCP_CLIENTS.find((c) => c.id === "claude-ai");

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {MCP_CLIENTS.map((client) =>
          client.kind === "deeplink" ? (
            <Button key={client.id} variant="secondary" size="sm" asChild>
              <a
                href={client.href}
                onClick={() => track("mcp_install", { target: client.id })}
              >
                <Download className="size-4" aria-hidden />
                {t(`Add to ${client.label}`, `Thêm vào ${client.label}`)}
              </a>
            </Button>
          ) : (
            <CopyButton key={client.id} client={client} />
          )
        )}
      </div>
      {claude?.kind === "copy" && claude.settingsHref ? (
        <p className="text-xs text-muted-foreground">
          {t(
            "Claude has no install link. Copy the URL, then add it as a custom connector in",
            "Claude chưa có liên kết cài đặt. Chép địa chỉ rồi thêm làm connector tùy chỉnh tại"
          )}{" "}
          <a
            href={claude.settingsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-accent underline underline-offset-2 hover:no-underline"
          >
            {t("Claude settings", "cài đặt Claude")}
            <ExternalLink className="size-3" aria-hidden />
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}
