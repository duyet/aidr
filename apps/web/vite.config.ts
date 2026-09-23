import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
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
            // Split the React runtime out of the entry chunk: its hash
            // stays stable across app deploys, so repeat visitors only
            // re-download the small app chunk.
            manualChunks(id: string) {
              if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
                return "react-vendor";
              }
            },
          },
        },
      },
    },
  },
  server: {
    port: 3014,
    strictPort: true,
  },
});
