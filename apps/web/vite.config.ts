import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig, loadEnv, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { requireMatchingClerkProxyUrls } from "./src/lib/clerk-proxy-config.js";

function readWranglerVar(wrangler: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escapedName}\\s*=\\s*"([^"]*)"\\s*$`, "m").exec(
    wrangler
  )?.[1];
}

function configuredPublicProxyUrl(mode: string): string {
  const appEnvDir = fileURLToPath(new URL(".", import.meta.url));
  const repoEnvDir = fileURLToPath(new URL("../../", import.meta.url));
  // .env.example is documented at the repository root. App-local env files
  // remain supported and intentionally override the root values.
  const env = {
    ...loadEnv(mode, repoEnvDir, ""),
    ...loadEnv(mode, appEnvDir, ""),
  };

  // Wrangler vars are runtime bindings, not automatically Vite client envs.
  const wrangler = readFileSync(
    new URL("./wrangler.toml", import.meta.url),
    "utf8"
  );
  const runtimeUrl =
    env.CLERK_PROXY_URL ?? readWranglerVar(wrangler, "CLERK_PROXY_URL");
  const browserUrl =
    env.VITE_CLERK_PROXY_URL ??
    readWranglerVar(wrangler, "VITE_CLERK_PROXY_URL");

  return requireMatchingClerkProxyUrls(runtimeUrl, browserUrl);
}

const baseConfig: UserConfig = {
  plugins: [
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

export default defineConfig(({ mode }) => ({
  ...baseConfig,
  define: {
    "import.meta.env.VITE_CLERK_PROXY_URL": JSON.stringify(
      configuredPublicProxyUrl(mode)
    ),
  },
}));
