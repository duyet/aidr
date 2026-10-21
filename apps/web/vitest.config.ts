import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workflows": fileURLToPath(
        new URL(
          "./worker/__tests__/stubs/cloudflare-workflows.ts",
          import.meta.url
        )
      ),
    },
  },
  test: {
    include: ["worker/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
    environment: "node",
    pool: "threads",
  },
});
