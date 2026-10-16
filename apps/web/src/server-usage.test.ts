import { describe, expect, it, vi } from "vitest";
import type { Env } from "../worker/types";

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: vi.fn(async () => new Response("{}", { status: 200 })) },
}));
vi.mock("../worker/ingest-schedule", () => ({
  ensureIngestAlarm: vi.fn(),
  tickIngest: vi.fn(),
}));
vi.mock("../worker/ingest-scheduler", () => ({
  NewsIngestScheduler: class {},
}));
vi.mock("../worker/workflow", () => ({ NewsIngestWorkflow: class {} }));

const { default: server } = await import("./server");
const { handleMcpRequest } = await import("../worker/admin/mcp");

describe("usage counters", () => {
  it("counts one /api/public request under its route template", async () => {
    const USAGE = { writeDataPoint: vi.fn() };
    const env = { DB: {}, USAGE } as unknown as Env;
    const response = await server.fetch(
      new Request("https://aidr.today/api/public?lang=en&utm=x", {
        headers: { "User-Agent": "Mozilla/5.0 Safari/605" },
      }),
      env
    );
    expect(response.status).toBe(200);
    expect(USAGE.writeDataPoint).toHaveBeenCalledOnce();
    expect(USAGE.writeDataPoint).toHaveBeenCalledWith({
      blobs: ["api", "/api/public", "", "browser"],
      doubles: [1, 200],
      indexes: ["api"],
    });
  });

  it("serves the request when the binding is absent", async () => {
    const response = await server.fetch(
      new Request("https://aidr.today/api/public"),
      { DB: {} } as unknown as Env
    );
    expect(response.status).toBe(200);
  });

  it("counts one MCP tool call with the tool name and no arguments", async () => {
    const USAGE = { writeDataPoint: vi.fn() };
    const env = { DB: {}, USAGE } as unknown as Env;
    const call = (name: string) =>
      handleMcpRequest(
        new Request("https://aidr.today/api/mcp", {
          method: "POST",
          headers: { "User-Agent": "Claude-User/1.0" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: { query: "private text" } },
          }),
        }),
        env
      );
    await call("not_a_tool_xyz");
    expect(USAGE.writeDataPoint).toHaveBeenCalledOnce();
    expect(USAGE.writeDataPoint).toHaveBeenCalledWith({
      blobs: ["mcp", "/api/mcp", "unknown", "mcp-client"],
      doubles: [1, 200],
      indexes: ["mcp"],
    });
    expect(JSON.stringify(USAGE.writeDataPoint.mock.calls)).not.toContain(
      "private text"
    );
  });
});
