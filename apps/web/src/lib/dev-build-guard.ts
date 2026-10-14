import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `src/start.ts` skips Clerk when `import.meta.env.DEV` is true and
 * `CLERK_SECRET_KEY` is unset. Vite fixes DEV at build time from NODE_ENV, so a
 * build made with NODE_ENV other than `production` keeps the `process.env`
 * read behind that skip. A production build folds the whole branch away, and
 * Clerk's own code reads the key through `getEnvVariable`, never this shape.
 */
const DEV_CLERK_SKIP = /process\.env\??\.CLERK_SECRET_KEY/;

function jsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(path);
    return entry.name.endsWith(".js") ? [path] : [];
  });
}

/** Files under `serverRoot` that still carry the dev-only Clerk skip. */
export function devClerkSkipFiles(serverRoot: string): string[] {
  return jsFiles(serverRoot).filter((file) =>
    DEV_CLERK_SKIP.test(readFileSync(file, "utf8"))
  );
}
