import type { McpInstallTarget } from "./analytics/events";
import { SITE_URL } from "./site";

export const MCP_SERVER_NAME = "aidr";
export const MCP_ENDPOINT = `${SITE_URL}/api/mcp`;

function base64Json(value: unknown): string {
  return encodeURIComponent(btoa(JSON.stringify(value)));
}

function vscodeInstall(scheme: "vscode" | "vscode-insiders"): string {
  const config = { name: MCP_SERVER_NAME, type: "http", url: MCP_ENDPOINT };
  return `${scheme}:mcp/install?${encodeURIComponent(JSON.stringify(config))}`;
}

export type McpClient =
  | { id: McpInstallTarget; label: string; kind: "deeplink"; href: string }
  | {
      id: McpInstallTarget;
      label: string;
      kind: "copy";
      text: string;
      settingsHref?: string;
    };

/**
 * One row per MCP client. Deeplinks follow each vendor's documented format:
 * - Cursor: https://cursor.com/docs/context/mcp/install-links
 * - VS Code: https://code.visualstudio.com/api/extension-guides/ai/mcp
 * - LM Studio: https://lmstudio.ai/docs/app/mcp/deeplink
 * Claude.ai custom connectors have no install link, only the settings page:
 * https://support.claude.com/en/articles/11175166
 */
export const MCP_CLIENTS = [
  {
    id: "cursor",
    label: "Cursor",
    kind: "deeplink",
    href: `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_NAME}&config=${base64Json({ url: MCP_ENDPOINT })}`,
  },
  {
    id: "vscode",
    label: "VS Code",
    kind: "deeplink",
    href: vscodeInstall("vscode"),
  },
  {
    id: "vscode-insiders",
    label: "VS Code Insiders",
    kind: "deeplink",
    href: vscodeInstall("vscode-insiders"),
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    kind: "deeplink",
    href: `lmstudio://add_mcp?name=${MCP_SERVER_NAME}&config=${base64Json({ url: MCP_ENDPOINT })}`,
  },
  {
    id: "claude-ai",
    label: "Claude",
    kind: "copy",
    text: MCP_ENDPOINT,
    settingsHref: "https://claude.ai/customize/connectors",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    kind: "copy",
    text: `claude mcp add --transport http ${MCP_SERVER_NAME} ${MCP_ENDPOINT}`,
  },
] as const satisfies readonly McpClient[];
