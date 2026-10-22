import { describe, expect, it } from "vitest";
import { MCP_CLIENTS, MCP_ENDPOINT } from "./mcp-install";

const client = (id: string) => {
  const found = MCP_CLIENTS.find((c) => c.id === id);
  if (!found) throw new Error(`no client ${id}`);
  return found;
};

function decodeBase64Config(href: string): unknown {
  const config = new URL(href).searchParams.get("config");
  return JSON.parse(atob(config ?? ""));
}

describe("MCP install links", () => {
  it("points every client at the public no-auth endpoint", () => {
    expect(MCP_ENDPOINT).toBe("https://aidr.today/api/mcp");
  });

  it("Cursor deeplink carries name aidr and a base64 url-only config", () => {
    const { href } = client("cursor") as { href: string };
    expect(
      href.startsWith("cursor://anysphere.cursor-deeplink/mcp/install?")
    ).toBe(true);
    expect(new URL(href).searchParams.get("name")).toBe("aidr");
    expect(decodeBase64Config(href)).toEqual({ url: MCP_ENDPOINT });
  });

  it("LM Studio deeplink carries the same base64 config", () => {
    const { href } = client("lmstudio") as { href: string };
    expect(href.startsWith("lmstudio://add_mcp?")).toBe(true);
    expect(new URL(href).searchParams.get("name")).toBe("aidr");
    expect(decodeBase64Config(href)).toEqual({ url: MCP_ENDPOINT });
  });

  it.each([
    ["vscode", "vscode:mcp/install?"],
    ["vscode-insiders", "vscode-insiders:mcp/install?"],
  ])("%s deeplink decodes to an http server named aidr", (id, prefix) => {
    const { href } = client(id) as { href: string };
    expect(href.startsWith(prefix)).toBe(true);
    expect(JSON.parse(decodeURIComponent(href.slice(prefix.length)))).toEqual({
      name: "aidr",
      type: "http",
      url: MCP_ENDPOINT,
    });
  });

  it("copy fallbacks hold the exact URL and Claude Code command", () => {
    expect(client("claude-ai")).toMatchObject({
      kind: "copy",
      text: MCP_ENDPOINT,
    });
    expect(client("claude-code")).toMatchObject({
      kind: "copy",
      text: "claude mcp add --transport http aidr https://aidr.today/api/mcp",
    });
  });
});
