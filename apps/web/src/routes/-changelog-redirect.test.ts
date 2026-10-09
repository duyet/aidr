/**
 * /changelog became /release. A client-side navigation to the old path must
 * land on /release with its search (lang) intact, matching the Worker's 301.
 */
import { describe, expect, it } from "vitest";
import { Route } from "./changelog";

describe("/changelog redirect", () => {
  it("redirects to /release and keeps the search params", () => {
    const beforeLoad = Route.options.beforeLoad as unknown as (ctx: {
      search: Record<string, string>;
    }) => void;
    let thrown: unknown;
    try {
      beforeLoad({ search: { lang: "vi" } });
    } catch (e) {
      thrown = e;
    }
    const r = thrown as { options?: { to?: string; search?: unknown } };
    expect(r?.options?.to).toBe("/release");
    expect(r?.options?.search).toEqual({ lang: "vi" });
  });
});
