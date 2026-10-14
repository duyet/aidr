import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { devBuildMessage, devClerkSkipFiles } from "./dev-build-guard";

const roots: string[] = [];

function fakeServerDist(startChunk: string): string {
  const root = mkdtempSync(join(tmpdir(), "dev-build-guard-"));
  roots.push(root);
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.js"), "export default {};");
  writeFileSync(join(root, "assets/start-abc.js"), startChunk);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

describe("devClerkSkipFiles", () => {
  it("flags a build where the dev Clerk skip survived", () => {
    const root = fakeServerDist(
      `function clerkSecretConfigured() {
  return typeof process !== "undefined" && Boolean(process.env?.CLERK_SECRET_KEY);
}
var startInstance = createStart(() => {
  if (true && !clerkSecretConfigured()) return {};
});`
    );
    expect(devClerkSkipFiles(root)).toEqual([
      join(root, "assets/start-abc.js"),
    ]);
  });

  it("passes a production build where the branch was folded out", () => {
    const root = fakeServerDist(
      `var startInstance = createStart(() => {
  return { requestMiddleware: [clerkMiddleware(() => ({ proxyUrl }))] };
});
const SECRET_KEY = getEnvVariable("CLERK_SECRET_KEY");`
    );
    expect(devClerkSkipFiles(root)).toEqual([]);
  });
});

describe("devBuildMessage", () => {
  it("says the artifact looks like a dev build and how to rebuild it", () => {
    const message = devBuildMessage(["dist/server/assets/start-abc.js"]);
    expect(message).toContain("looks like a dev build");
    expect(message).toContain("dist/server/assets/start-abc.js");
    expect(message).toContain("Rebuild with NODE_ENV=production");
    expect(message).not.toContain("NODE_ENV=test");
  });
});
