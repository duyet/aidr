import { SITE_DESCRIPTION, SITE_URL } from "./site";

export const AGENT_DISCOVERY_VERSION = "0.1.3";
export const SKILL_NAME = "consume-aidr";
export const SKILL_PATH = `/.well-known/agent-skills/${SKILL_NAME}/SKILL.md`;

const CACHE = "public, max-age=3600";
const CORS = { "access-control-allow-origin": "*" } as const;

export const CONSUME_SKILL_MD = `---
name: ${SKILL_NAME}
description: Consume aidr.today as the ranked AI news digest. Use GET /api/public for stories and TL;DR; do not scrape HN in parallel.
---

# Consume aidr.today

Canonical origin: ${SITE_URL}

## When to use

Use this skill when an agent needs today's ranked AI news, a bilingual TL;DR, or to submit a story to aidr.

## Read

- JSON digest (no auth): GET ${SITE_URL}/api/public
- HTML feed: ${SITE_URL}/
- MCP (read + admin): POST ${SITE_URL}/api/mcp
- Docs: ${SITE_URL}/mcp
- OpenAPI: ${SITE_URL}/openapi.json

Prefer GET /api/public for ids, titles, sources, rank, and TL;DR bullets.

## Submit

1. Sign in at ${SITE_URL}/sign-in (Clerk session / Bearer).
2. POST the submit path used by ${SITE_URL}/submit with JSON:
   { "url": "https://example.com/story", "title": "Five chars or more", "note": "why it matters", "via": "agent" }

Do not POST unauthenticated spam.

## Ranking (do not reimplement)

rank_score = importance × (0.6 + 0.4·quality/10) × exp(−ageHours/36) × (1 + log10(1 + points + 0.5·comments)) × (1 + 0.06·min(sourceCount, 6))
`;

export const AUTH_MD = `# auth.md

Agent authentication for **aidr.today**.

## Audience

Local coding agents and signed-in humans that submit stories or suggest edits. Public read APIs do not require auth.

## Register / provision

- Human and agent sign-up: ${SITE_URL}/sign-up
- Sign-in: ${SITE_URL}/sign-in
- Authorization server (Clerk, proxied): ${SITE_URL}/__clerk

There is no unauthenticated \`POST /agent/auth\`. Registration creates a Clerk user.

## Methods

1. **Clerk OAuth / session** — browser sign-in or Bearer token from Clerk.
2. **Bearer header** — \`Authorization: Bearer <token>\` on submit/suggest/admin MCP.

## Credential use

Send the Clerk session JWT as \`Authorization: Bearer\` on mutating routes. GET ${SITE_URL}/api/public stays anonymous.

Protected resource metadata: ${SITE_URL}/.well-known/oauth-protected-resource
Authorization server metadata: ${SITE_URL}/.well-known/oauth-authorization-server

\`\`\`yaml
agent_auth:
  skill: ${SITE_URL}${SKILL_PATH}
  register_uri: ${SITE_URL}/sign-up
  methods:
    - type: clerk_oauth
      authorization_endpoint: ${SITE_URL}/__clerk/oauth/authorize
      token_endpoint: ${SITE_URL}/__clerk/oauth/token
      issuer: ${SITE_URL}/__clerk
\`\`\`
`;

export function homepageLinkHeader(): string {
  return [
    `<${SITE_URL}/.well-known/api-catalog>; rel="api-catalog"`,
    `<${SITE_URL}/openapi.json>; rel="service-desc"; type="application/openapi+json"`,
    `<${SITE_URL}/mcp>; rel="service-doc"; type="text/html"`,
    `<${SITE_URL}/llms.txt>; rel="describedby"; type="text/plain"`,
  ].join(", ");
}

export function apiCatalogDocument(): unknown {
  return {
    linkset: [
      {
        anchor: `${SITE_URL}/api/public`,
        "service-desc": [
          {
            href: `${SITE_URL}/openapi.json`,
            type: "application/openapi+json",
          },
        ],
        "service-doc": [
          { href: `${SITE_URL}/mcp`, type: "text/html" },
          { href: `${SITE_URL}/llms.txt`, type: "text/plain" },
        ],
        status: [{ href: `${SITE_URL}/api/system`, type: "application/json" }],
      },
      {
        anchor: `${SITE_URL}/api/mcp`,
        "service-desc": [
          {
            href: `${SITE_URL}/.well-known/mcp/server-card.json`,
            type: "application/json",
          },
        ],
        "service-doc": [{ href: `${SITE_URL}/mcp`, type: "text/html" }],
        status: [{ href: `${SITE_URL}/api/system`, type: "application/json" }],
      },
      {
        anchor: `${SITE_URL}/api/feed`,
        "service-desc": [
          {
            href: `${SITE_URL}/openapi.json`,
            type: "application/openapi+json",
          },
        ],
        "service-doc": [{ href: `${SITE_URL}/about`, type: "text/html" }],
      },
    ],
  };
}

export function openApiDocument(): unknown {
  return {
    openapi: "3.1.0",
    info: {
      title: "aidr.today",
      version: AGENT_DISCOVERY_VERSION,
      description: SITE_DESCRIPTION,
    },
    servers: [{ url: SITE_URL }],
    paths: {
      "/api/public": {
        get: {
          summary: "Unauthenticated digest",
          responses: {
            "200": { description: "TL;DR bullets and ranked stories" },
          },
        },
      },
      "/api/feed": {
        get: {
          summary: "HTML-oriented feed JSON",
          responses: { "200": { description: "Feed days and items" } },
        },
      },
      "/api/system": {
        get: {
          summary: "Pipeline health and stats",
          responses: { "200": { description: "Totals, last run, models" } },
        },
      },
      "/api/mcp": {
        post: {
          summary: "MCP Streamable HTTP",
          responses: { "200": { description: "MCP JSON-RPC" } },
        },
      },
    },
  };
}

export function a2aAgentCard(): unknown {
  return {
    name: "aidr",
    version: AGENT_DISCOVERY_VERSION,
    description: SITE_DESCRIPTION,
    url: `${SITE_URL}/api/mcp`,
    preferredTransport: "JSONRPC",
    protocolVersion: "0.3.0",
    supportedInterfaces: [
      {
        url: `${SITE_URL}/api/mcp`,
        protocol: "JSONRPC",
        transport: "HTTP",
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
      tools: true,
    },
    skills: [
      {
        id: "public-digest",
        name: "Public digest",
        description:
          "Return ranked AI stories and bilingual TL;DR via GET /api/public.",
      },
      {
        id: "mcp-tools",
        name: "MCP tools",
        description:
          "Read the digest and (with admin auth) run ingest over POST /api/mcp.",
      },
    ],
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["application/json"],
  };
}

export function mcpServerCard(): unknown {
  return {
    serverInfo: {
      name: "aidr",
      version: AGENT_DISCOVERY_VERSION,
    },
    description: SITE_DESCRIPTION,
    documentationUrl: `${SITE_URL}/mcp`,
    transport: {
      type: "streamable-http",
      endpoint: `${SITE_URL}/api/mcp`,
    },
    endpoint: `${SITE_URL}/api/mcp`,
    capabilities: {
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
      prompts: { listChanged: false },
    },
  };
}

export function oauthProtectedResource(): unknown {
  return {
    resource: SITE_URL,
    authorization_servers: [`${SITE_URL}/__clerk`],
    scopes_supported: ["openid", "profile", "email"],
    bearer_methods_supported: ["header"],
  };
}

export function oauthAuthorizationServer(): unknown {
  return {
    issuer: `${SITE_URL}/__clerk`,
    authorization_endpoint: `${SITE_URL}/__clerk/oauth/authorize`,
    token_endpoint: `${SITE_URL}/__clerk/oauth/token`,
    jwks_uri: `${SITE_URL}/__clerk/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic"],
    scopes_supported: ["openid", "profile", "email"],
    code_challenge_methods_supported: ["S256"],
  };
}

export async function sha256Digest(bytes: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(bytes)
  );
  const hex = [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

export async function agentSkillsIndex(): Promise<unknown> {
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        name: SKILL_NAME,
        type: "skill-md",
        description:
          "Consume aidr.today as the ranked AI news digest. Use GET /api/public; do not scrape HN in parallel.",
        url: SKILL_PATH,
        digest: await sha256Digest(CONSUME_SKILL_MD),
      },
    ],
  };
}

function jsonResponse(
  body: unknown,
  contentType: string,
  extra?: HeadersInit
): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": CACHE,
      ...CORS,
      ...extra,
    },
  });
}

function textResponse(body: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": CACHE,
      ...CORS,
    },
  });
}

/** Worker-owned agent discovery paths (not the SPA shell). */
export async function handleAgentDiscovery(
  request: Request
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;

  const empty = (res: Response): Response =>
    method === "HEAD"
      ? new Response(null, { status: res.status, headers: res.headers })
      : res;

  if (path === "/.well-known/api-catalog") {
    return empty(
      jsonResponse(
        apiCatalogDocument(),
        'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
        {
          Link: `</.well-known/api-catalog>; rel="api-catalog"`,
        }
      )
    );
  }
  if (path === "/openapi.json") {
    return empty(jsonResponse(openApiDocument(), "application/openapi+json"));
  }
  if (
    path === "/.well-known/agent-card.json" ||
    path === "/.well-known/agent.json"
  ) {
    return empty(jsonResponse(a2aAgentCard(), "application/json"));
  }
  if (path === "/.well-known/mcp/server-card.json") {
    return empty(jsonResponse(mcpServerCard(), "application/json"));
  }
  if (path === "/.well-known/agent-skills/index.json") {
    return empty(jsonResponse(await agentSkillsIndex(), "application/json"));
  }
  if (path === SKILL_PATH) {
    return empty(
      textResponse(CONSUME_SKILL_MD, "text/markdown; charset=utf-8")
    );
  }
  if (path === "/auth.md") {
    return empty(textResponse(AUTH_MD, "text/markdown; charset=utf-8"));
  }
  if (path === "/.well-known/oauth-protected-resource") {
    return empty(jsonResponse(oauthProtectedResource(), "application/json"));
  }
  if (path === "/.well-known/oauth-authorization-server") {
    return empty(jsonResponse(oauthAuthorizationServer(), "application/json"));
  }
  return null;
}

export function withHomepageLinkHeaders(
  request: Request,
  response: Response
): Response {
  const path = new URL(request.url).pathname;
  if (path !== "/" && path !== "") return response;
  const headers = new Headers(response.headers);
  const extra = homepageLinkHeader();
  const existing = headers.get("Link");
  headers.set("Link", existing ? `${existing}, ${extra}` : extra);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
