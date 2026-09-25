import handler from "@tanstack/react-start/server-entry";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../worker/types";

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: vi.fn() },
}));
vi.mock("../worker/ingest-schedule", () => ({
  ensureIngestAlarm: vi.fn(),
  tickIngest: vi.fn(),
}));
vi.mock("../worker/ingest-scheduler", () => ({
  NewsIngestScheduler: class {},
}));
vi.mock("../worker/workflow", () => ({
  NewsIngestWorkflow: class {},
}));

const { default: server } = await import("./server");

const FN_ID = "src_lib_submit-fn_ts--submitStory";
const FN_PATH = `/_serverFn/${FN_ID}`;

/**
 * Synthetic 64-char hex shaped like a server-fn id: the same length and
 * alphabet the transport uses, invented here so no live identifier is
 * committed to the test suite.
 */
const HEX_FN_ID = "deadbeef".repeat(8);

/** Headers the Start client sends for a server-function POST. */
const TSS_HEADERS = {
  accept: "application/x-tss-framed, application/x-ndjson, application/json",
  "x-tsr-serverFn": "true",
  "content-type": "application/json",
};

function call(request: Request): Promise<Response> {
  const result = server.fetch(request, {} as Env);
  return result instanceof Promise
    ? result
    : Promise.resolve(result as Response);
}

function serverFnRequest(search = ""): Request {
  return new Request(`https://aidr.today${FN_PATH}${search}`, {
    method: "POST",
    headers: TSS_HEADERS,
    body: "{}",
  });
}

/** Stands in for Start's serialized server-function response. */
function serialized(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json", "x-tss-serialized": "true" },
  });
}

beforeEach(() => {
  vi.mocked(handler.fetch).mockReset();
});

describe("server-function transport path", () => {
  it("lets a valid TSS request reach the server function untouched", async () => {
    vi.mocked(handler.fetch).mockImplementation(async () =>
      serialized('{"t":10,"i":0,"p":{}}')
    );

    for (const search of ["", "?lang=vi", "?lang=en"]) {
      const response = await call(serverFnRequest(search));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-tss-serialized")).toBe("true");
      // The RPC body and its own headers must pass through as Start made them.
      expect(response.headers.get("Content-Language")).toBeNull();
      expect(response.headers.get("X-Robots-Tag")).toBeNull();
    }
    expect(handler.fetch).toHaveBeenCalledTimes(3);
  });

  it("does not answer a server-function call with a redirect", async () => {
    vi.mocked(handler.fetch).mockImplementation(async () =>
      serialized('{"t":10,"i":0,"p":{}}')
    );

    // A legacy alias is document-level vocabulary. Redirecting an RPC call
    // hands the client a 307 instead of a deserializable result.
    const response = await call(serverFnRequest("?locale=vi"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
  });

  it("rejects a bad locale on the transport path in JSON, not HTML", async () => {
    vi.mocked(handler.fetch).mockImplementation(async () =>
      serialized('{"t":10,"i":0,"p":{}}')
    );

    for (const search of [
      "?lang=fr",
      "?locale=fr",
      "?lang=vi&lang=en",
      "?lang=vi&locale=vi",
    ]) {
      const response = await call(serverFnRequest(search));
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain(
        "application/json"
      );
      expect(response.headers.get("Content-Language")).toBe("en, vi");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const payload = (await response.json()) as { error: string };
      expect(payload.error).toMatch(/locale/i);
      expect(JSON.stringify(payload)).not.toMatch(/<html/i);
    }
    expect(handler.fetch).not.toHaveBeenCalled();
  });

  it("preserves the unauthenticated server-function rejection", async () => {
    // Start answers an unauthenticated submit with a serialized Error and a
    // 200 status; the client deserializes the Error and throws it. The Worker
    // must not rewrite that status or body.
    const body =
      '{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":2,"s":1},{"t":25,"i":1,"s":{"message":{"t":1,"s":"Sign in required"}},"c":"$TSR/Error"},{"t":10,"i":2,"p":{"k":[],"v":[]},"o":0}]},"o":0}';
    vi.mocked(handler.fetch).mockImplementation(async () => serialized(body));

    const response = await call(serverFnRequest("?lang=vi"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(body);
    expect(response.headers.get("Content-Language")).toBeNull();
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("leaves a server-function error status alone", async () => {
    vi.mocked(handler.fetch).mockImplementation(async () =>
      serialized('{"t":10,"i":0,"p":{}}', 500)
    );

    const response = await call(serverFnRequest());
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("still applies the document locale gate to page routes", async () => {
    vi.mocked(handler.fetch).mockImplementation(
      async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        })
    );

    const invalidPage = await call(
      new Request("https://aidr.today/submit?lang=fr")
    );
    expect(invalidPage.status).toBe(400);
    expect(invalidPage.headers.get("content-type")).toContain("text/html");

    const legacyPage = await call(
      new Request("https://aidr.today/mcp?locale=vi")
    );
    expect(legacyPage.status).toBe(307);
    expect(legacyPage.headers.get("Location")).toBe(
      "https://aidr.today/mcp?lang=vi"
    );

    const validPage = await call(
      new Request("https://aidr.today/submit?lang=vi")
    );
    expect(validPage.status).toBe(200);
    expect(validPage.headers.get("Content-Language")).toBe("vi");
  });

  it("never redirects a server function to a story page", async () => {
    vi.mocked(handler.fetch).mockImplementation(async () =>
      serialized('{"t":10,"i":0,"p":{}}')
    );

    // The regression: the legacy /{cat}/{hash} story compat rule matched
    // /_serverFn/<sha256-id> and answered the submit call with a 307 to
    // /deadbeef?lang=vi. The client then followed it to a page route, where
    // Start's HTML-only guard returned 406 and the form reported
    // "Failed to submit".
    const response = await call(
      new Request(`https://aidr.today/_serverFn/${HEX_FN_ID}`, {
        method: "POST",
        headers: TSS_HEADERS,
        body: "{}",
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
    expect(handler.fetch).toHaveBeenCalledOnce();
  });

  it("leaves a non-HTML request to a page route to Start's own guard", async () => {
    // A page URL carrying server-function headers is the request a manual
    // curl makes. It must still be rejected, and the Worker must not turn
    // the rejection into a document or a locale error.
    vi.mocked(handler.fetch).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ error: "Only HTML requests are supported here" }),
          { status: 406, headers: { "content-type": "application/json" } }
        )
    );

    const response = await call(
      new Request("https://aidr.today/deadbeef?lang=vi", {
        headers: { accept: TSS_HEADERS.accept, "x-tsr-serverFn": "true" },
      })
    );
    expect(response.status).toBe(406);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("Content-Language")).toBe("vi");
  });
});
