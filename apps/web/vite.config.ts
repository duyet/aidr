import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig, loadEnv, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { writeSubsetFonts } from "./scripts/subset-fonts.js";
import { requireClerkProxyUrl } from "./src/lib/clerk-proxy-config.js";

function readWranglerVar(wrangler: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escapedName}\\s*=\\s*"([^"]*)"\\s*$`, "m").exec(
    wrangler
  )?.[1];
}

/** Root .env files (where .env.example is documented) then app-local ones,
 *  which win. Vite itself only reads VITE_* from the app dir, so anything
 *  the browser needs from the root env is passed through `define` below. */
function buildEnv(mode: string): Record<string, string> {
  const appEnvDir = fileURLToPath(new URL(".", import.meta.url));
  const repoEnvDir = fileURLToPath(new URL("../../", import.meta.url));
  return {
    ...loadEnv(mode, repoEnvDir, ""),
    ...loadEnv(mode, appEnvDir, ""),
  };
}

function configuredPublicProxyUrl(mode: string): string {
  const env = buildEnv(mode);

  if (env.VITE_CLERK_PROXY_URL !== undefined) {
    throw new Error(
      "VITE_CLERK_PROXY_URL is derived; configure only CLERK_PROXY_URL"
    );
  }

  // wrangler.toml is the canonical deploy source. Development may use an
  // explicit loopback override, but production builds must match it exactly.
  const wrangler = readFileSync(
    new URL("./wrangler.toml", import.meta.url),
    "utf8"
  );
  const canonicalUrl = requireClerkProxyUrl(
    readWranglerVar(wrangler, "CLERK_PROXY_URL")
  );
  const environmentUrl = env.CLERK_PROXY_URL;
  if (environmentUrl === undefined) return canonicalUrl;

  const normalizedEnvironmentUrl = requireClerkProxyUrl(environmentUrl);
  if (mode !== "development" && normalizedEnvironmentUrl !== canonicalUrl) {
    throw new Error("CLERK_PROXY_URL must match wrangler.toml for this build");
  }
  return normalizedEnvironmentUrl;
}

const baseConfig: UserConfig = {
  plugins: [
    // src/fonts.css points at a subset woff2 that is generated from
    // node_modules, not committed (scripts/subset-fonts.ts). `config` runs
    // once per dev/build start, before any CSS is transformed.
    {
      name: "subset-fonts",
      async config() {
        await writeSubsetFonts();
      },
    },
    // src/start.ts statically imports clerkMiddleware from a server-only
    // module; TanStack Start also bundles start.ts into the client graph
    // (startInstance.getOptions()), which would otherwise drag the whole
    // Clerk SDK back into the entry chunk. Request middleware never runs
    // client-side, so resolve it to an inert stub in the client env only.
    {
      name: "clerk-server-stub",
      enforce: "pre",
      resolveId(id) {
        if (
          id === "@clerk/tanstack-react-start/server" &&
          this.environment?.name === "client"
        ) {
          return fileURLToPath(
            new URL("./src/lib/clerk-server-stub.ts", import.meta.url)
          );
        }
        return null;
      },
    },
    // cloudflare() must come before tanstackStart() so SSR runs inside workerd
    // (makes `cloudflare:workers` and bindings resolvable in dev).
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      router: {
        routesDirectory: "./routes",
        generatedRouteTree: "./routeTree.gen.ts",
      },
    }),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    rollupOptions: {
      external: ["cloudflare:workers", "vinxi/http"],
    },
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: {
            // Split stable runtimes out of the entry chunk: their hashes
            // stay stable across app deploys, so repeat visitors only
            // re-download the small app chunk. (Rolldown merges every name
            // returned by one manualChunks fn into a single chunk, so use
            // native codeSplitting groups instead.)
            codeSplitting: {
              groups: [
                {
                  name: "react-vendor",
                  test: /node_modules\/(react|react-dom|scheduler)\//,
                  priority: 20,
                },
                // No clerk group on purpose: a named chunk also captures
                // Clerk's shared deps (react-router hooks, query-core),
                // which the entry imports — that creates a static edge and
                // the SDK is eagerly fetched again. With no group, the
                // dynamic import() yields a plain async chunk.
              ],
            },
          },
        },
      },
    },
  },
  server: {
    port: 3014,
    strictPort: true,
    allowedHosts: ["duet-ubuntu", ".ts.net", ".local"],
  },
};

function buildIdentity(): { version: string; sha: string } {
  const version =
    JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
      .version ?? "";
  const fromEnv = process.env.GITHUB_SHA?.trim();
  if (fromEnv) return { version, sha: fromEnv.slice(0, 7) };
  try {
    const sha = execSync("git rev-parse --short=7 HEAD", {
      cwd: fileURLToPath(new URL(".", import.meta.url)),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return { version, sha };
  } catch {
    return { version, sha: "" };
  }
}

const identity = buildIdentity();

export default defineConfig(({ mode }) => ({
  ...baseConfig,
  define: {
    "import.meta.env.VITE_AIDR_VERSION": JSON.stringify(identity.version),
    "import.meta.env.VITE_AIDR_SHA": JSON.stringify(identity.sha),
    "import.meta.env.CLERK_PROXY_URL": JSON.stringify(
      configuredPublicProxyUrl(mode)
    ),
    // A local deploy keeps the key in the repo-root .env.local, which Vite
    // does not read for VITE_*; without this the bundle shipped no key and
    // Clerk never mounted (2026-10-01). CI passes it as a process env var.
    "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(
      buildEnv(mode).VITE_CLERK_PUBLISHABLE_KEY ?? ""
    ),
  },
}));
