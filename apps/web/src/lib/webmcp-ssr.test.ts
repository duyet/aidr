import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WEBMCP_TOOLS, webmcpToolRegistrations } from "./webmcp";

/**
 * #226 guards three things a unit test cannot see, so they are asserted
 * against the source that ships:
 *
 *  1. Nothing WebMCP-related is server-rendered. Registration is in an
 *     effect, so `modelContext` cannot appear in the SSR HTML — a claim
 *     that is easy to make and easy to break by moving one import.
 *  2. The Cloudflare bridge is never vendored or bundled. The whole point
 *     of the injected script is that it is not our dependency; an import
 *     or a `<script src>` would put 14 KiB on our critical path.
 *  3. Registration is client-side only — it is called from an effect, not
 *     during render and not at module scope.
 */
const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const routesDir = path.resolve(srcDir, "../routes");

describe("WebMCP is client-side only", () => {
  it("the root route registers inside an effect, not during render", () => {
    const root = readFileSync(path.join(routesDir, "__root.tsx"), "utf8");
    expect(root).toContain("<WebMcpTools />");
    // The component itself owns the effect; the root route only mounts it.
    const component = readFileSync(
      path.resolve(srcDir, "../components/WebMcpTools.tsx"),
      "utf8"
    );
    expect(component).toMatch(
      /useEffect\(\(\) => \{[\s\S]*registerWebmcpTools\(\)/
    );
    // No module-scope registration: a top-level call would run during SSR.
    expect(component).not.toMatch(/^registerWebmcpTools\(\)/m);
  });

  it("no SSR-reachable module calls registerTool outside an effect", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(srcDir)) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      if (file === "webmcp.ts" || file.endsWith(".test.ts")) continue;
      const source = readFileSync(path.join(srcDir, file), "utf8");
      if (/^registerWebmcpTools\(/m.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("never imports, vendors, or references /.webmcp/bridge.js", () => {
    const offenders: string[] = [];
    const scan = (dir: string, depth = 0): void => {
      if (depth > 4) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === "__tests__")
            continue;
          scan(full, depth + 1);
          continue;
        }
        if (!/\.(ts|tsx|js|jsx|html)$/.test(entry.name)) continue;
        if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx"))
          continue;
        const source = readFileSync(full, "utf8");
        // The catalog may NAME the URL so an agent knows where the bridge
        // comes from; it may never load it.
        if (/\.webmcp\/bridge\.js["']?\s*\)/.test(source)) offenders.push(full);
        if (/import\s[^;]*\.webmcp\/bridge/.test(source)) offenders.push(full);
        if (/<script[^>]+src=[^>]*\.webmcp\/bridge/.test(source))
          offenders.push(full);
      }
    };
    scan(srcDir);
    expect(offenders).toEqual([]);
  });

  it("ai-catalog names the bridge as Cloudflare-injected, not as ours", () => {
    const source = readFileSync(path.join(srcDir, "ai-catalog.ts"), "utf8");
    expect(source).toContain("/.webmcp/bridge.js");
    expect(source).toMatch(/inject/i);
  });
});

describe("registration shape", () => {
  it("registers only the four read tools, none of them a write", () => {
    const registrations = webmcpToolRegistrations();
    expect(registrations.map((tool) => tool.name)).toEqual(
      WEBMCP_TOOLS.map((tool) => tool.name)
    );
    for (const registration of registrations) {
      expect(registration.annotations.readOnlyHint).toBe(true);
      expect(registration.annotations.untrustedContentHint).toBe(true);
      expect(registration.annotations.destructiveHint).toBe(false);
      expect(registration.description).toContain("untrusted publisher data");
    }
  });

  it("every execute is a function, so a host can call any of them", () => {
    for (const registration of webmcpToolRegistrations()) {
      expect(typeof registration.execute).toBe("function");
    }
  });
});
