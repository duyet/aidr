import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const VENDORS: { host: RegExp; name: string }[] = [
  { host: /googletagmanager\.com/, name: "Google Analytics" },
  { host: /posthog\.com/, name: "PostHog" },
  { host: /j\.duyet\.net/, name: "Jitsu" },
  { host: /cdn\.seline\.so/, name: "Seline" },
];

describe("privacy page", () => {
  const page = read("./privacy.tsx");
  const loader = read("../lib/analytics/vendors.tsx");
  const stubs = read("../lib/analytics/stubs.ts");

  it("maps every host the analytics loader reaches to a vendor the page names", () => {
    const hosts = new Set(
      [...`${loader}\n${stubs}`.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map(
        (m) => m[1]
      )
    );
    const unmapped = [...hosts].filter(
      (host) => !VENDORS.some((v) => v.host.test(host))
    );
    expect(unmapped).toEqual([]);
    for (const { name } of VENDORS) expect(page).toContain(name);
  });

  it("says plainly that analytics load without a consent banner", () => {
    expect(page).toContain("no consent banner");
  });

  it("discloses the PostHog features the config leaves on", () => {
    expect(stubs).not.toContain("autocapture: false");
    expect(stubs).not.toContain("capture_exceptions: false");
    expect(stubs).not.toContain("disable_session_recording");
    expect(page).toContain("autocaptures clicks and form changes");
    expect(page).toContain("captures uncaught errors");
    expect(page).toContain("session replays");
  });
});
