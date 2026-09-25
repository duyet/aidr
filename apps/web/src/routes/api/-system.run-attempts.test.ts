import { describe, expect, it } from "vitest";
import { parseRunIdParam, Route } from "./system.run-attempts";

function fakeDb() {
  const prepare = (sql: string) => {
    const statement = {
      bind: () => statement,
      all: async () => {
        if (sql.includes("FROM llm_calls") && sql.includes("run_id = ?")) {
          return {
            results: [
              {
                ts: 123,
                run_id: "run-1",
                task: "score",
                model: "anyrouter/auto",
                ok: 0,
                tokens: 0,
                duration_ms: 5,
                prompt_chars: 100,
                error:
                  'Bearer sk-live-secret https://provider.test/debug {"prompt":"raw"}',
                error_code: "provider_error",
                error_status: 502,
                prompt_tokens: null,
                completion_tokens: null,
                cached_tokens: null,
                response_snippet: "raw provider response",
              },
            ],
          };
        }
        return { results: [] };
      },
    };
    return statement;
  };
  return { prepare };
}

describe("run-attempts API contract", () => {
  it("requires an explicit, bounded run id", () => {
    expect(parseRunIdParam("461457a8-a71a-4dc0-95e9-69a1a3f17e9b")).toBe(
      "461457a8-a71a-4dc0-95e9-69a1a3f17e9b"
    );
    expect(parseRunIdParam("1700000000000")).toBeNull();
    expect(parseRunIdParam("run/with/slashes")).toBeNull();
    expect(parseRunIdParam("run?window=1")).toBeNull();
    expect(parseRunIdParam(null)).toBeNull();
  });

  it("returns only structured, redacted attempt fields for the requested run", async () => {
    const server = Route.options?.server as unknown as {
      handlers: {
        GET: (args: {
          request: Request;
          context: unknown;
        }) => Promise<Response>;
      };
    };
    const handler = server.handlers.GET;
    const response = await handler({
      request: new Request(
        "https://aidr.test/api/system/run-attempts?run_id=run-1"
      ),
      context: { env: { DB: fakeDb() } },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      attempts: Array<Record<string, unknown>>;
    };
    expect(body.attempts).toHaveLength(1);
    expect(body.attempts[0]).toMatchObject({
      runId: "run-1",
      error: "Provider request failed",
      errorCode: "provider_error",
      errorStatus: 502,
    });
    expect(JSON.stringify(body)).not.toContain("sk-live-secret");
    expect(JSON.stringify(body)).not.toContain("provider.test");
    expect(JSON.stringify(body)).not.toContain("raw");
  });

  it("rejects timestamp-window requests", async () => {
    const server = Route.options?.server as unknown as {
      handlers: {
        GET: (args: {
          request: Request;
          context: unknown;
        }) => Promise<Response>;
      };
    };
    const handler = server.handlers.GET;
    const response = await handler({
      request: new Request(
        "https://aidr.test/api/system/run-attempts?since=1&until=2"
      ),
      context: { env: { DB: fakeDb() } },
    });
    expect(response.status).toBe(400);
  });
});
