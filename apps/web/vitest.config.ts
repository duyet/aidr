import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["worker/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
    environment: "node",
    pool: "threads",
    // `?raw` CSS imports come back empty unless vitest is told to load them.
    css: { include: [/critical\.css/] },
  },
});
