import { describe, expect, it } from "vitest";
import {
  AUTH_MD,
  a2aAgentCard,
  agentSkillsIndex,
  apiCatalogDocument,
  CONSUME_SKILL_MD,
  handleAgentDiscovery,
  homepageLinkHeader,
  mcpServerCard,
  oauthAuthorizationServer,
  oauthProtectedResource,
  SKILL_NAME,
  SKILL_PATH,
  sha256Digest,
  withHomepageLinkHeaders,
} from "./agent-discovery";
import { SITE_URL } from "./site";

describe("api catalog", () => {
  it("lists public, mcp, and feed anchors with service-desc and service-doc", () => {
    const doc = apiCatalogDocument() as {
      linkset: Array<Record<string, unknown>>;
    };
    expect(doc.linkset.length).toBeGreaterThanOrEqual(2);
    const publicApi = doc.linkset.find(
      (e) => e.anchor === `${SITE_URL}/api/public`
    );
    expect(publicApi?.["service-desc"]).toBeTruthy();
    expect(publicApi?.["service-doc"]).toBeTruthy();
    expect(publicApi?.status).toBeTruthy();
  });
});

describe("a2a + mcp cards", () => {
  it("includes name, version, description, interfaces, skills", () => {
    const card = a2aAgentCard() as Record<string, unknown>;
    expect(card.name).toBe("aidr");
    expect(card.version).toBeTruthy();
    expect(String(card.description).length).toBeGreaterThan(8);
    expect(Array.isArray(card.supportedInterfaces)).toBe(true);
    expect(card.capabilities).toBeTruthy();
    const skills = card.skills as Array<{ id: string }>;
    expect(skills[0].id).toBeTruthy();
  });

  it("lists MCP serverInfo, endpoint, and capabilities", () => {
    const card = mcpServerCard() as {
      serverInfo: { name: string; version: string };
      endpoint: string;
      capabilities: unknown;
    };
    expect(card.serverInfo.name).toBe("aidr");
    expect(card.serverInfo.version).toBeTruthy();
    expect(card.endpoint).toContain("/api/mcp");
    expect(card.capabilities).toBeTruthy();
  });
});

describe("oauth + auth.md", () => {
  it("H1 contains auth.md", () => {
    expect(AUTH_MD.startsWith("# auth.md")).toBe(true);
    expect(AUTH_MD).toContain("register_uri");
    expect(AUTH_MD).toContain("agent_auth");
  });

  it("PRM has resource, authorization_servers, scopes, bearer header", () => {
    const prm = oauthProtectedResource() as {
      resource: string;
      authorization_servers: string[];
      scopes_supported: string[];
      bearer_methods_supported: string[];
    };
    expect(prm.resource).toBe(SITE_URL);
    expect(prm.authorization_servers[0]).toBe(`${SITE_URL}/__clerk`);
    expect(prm.bearer_methods_supported).toContain("header");
    const as = oauthAuthorizationServer() as { issuer: string };
    expect(as.issuer).toBe(prm.authorization_servers[0]);
  });
});

describe("skills index", () => {
  it("matches v0.2.0 schema and digest of SKILL.md", async () => {
    const index = (await agentSkillsIndex()) as {
      $schema: string;
      skills: Array<{
        name: string;
        type: string;
        digest: string;
        url: string;
      }>;
    };
    expect(index.$schema).toBe(
      "https://schemas.agentskills.io/discovery/0.2.0/schema.json"
    );
    expect(index.skills[0].name).toBe(SKILL_NAME);
    expect(index.skills[0].type).toBe("skill-md");
    expect(index.skills[0].url).toBe(SKILL_PATH);
    expect(index.skills[0].digest).toBe(await sha256Digest(CONSUME_SKILL_MD));
  });
});

describe("handleAgentDiscovery", () => {
  it("serves api-catalog as linkset+json 200", async () => {
    const res = await handleAgentDiscovery(
      new Request(`${SITE_URL}/.well-known/api-catalog`)
    );
    expect(res?.status).toBe(200);
    expect(res?.headers.get("content-type")).toMatch(
      /application\/linkset\+json/
    );
    const body = (await res?.json()) as { linkset: unknown[] };
    expect(Array.isArray(body.linkset)).toBe(true);
  });

  it("serves agent-card.json as JSON", async () => {
    const res = await handleAgentDiscovery(
      new Request(`${SITE_URL}/.well-known/agent-card.json`)
    );
    expect(res?.headers.get("content-type")).toMatch(/application\/json/);
    const body = (await res?.json()) as { name: string };
    expect(body.name).toBe("aidr");
  });

  it("returns null for unrelated paths", async () => {
    expect(
      await handleAgentDiscovery(new Request(`${SITE_URL}/about`))
    ).toBeNull();
  });
});

describe("homepage Link header", () => {
  it("includes api-catalog, service-desc, service-doc, describedby", () => {
    const h = homepageLinkHeader();
    expect(h).toContain('rel="api-catalog"');
    expect(h).toContain('rel="service-desc"');
    expect(h).toContain('rel="service-doc"');
    expect(h).toContain('rel="describedby"');
  });

  it("appends Link on /", () => {
    const res = withHomepageLinkHeaders(
      new Request(`${SITE_URL}/`),
      new Response("ok")
    );
    expect(res.headers.get("Link")).toContain("api-catalog");
  });
});
