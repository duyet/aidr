/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminClients, pivotClientDays } from "./AdminClients";

afterEach(cleanup);

const usage = {
  status: "ok" as const,
  windowDays: 7,
  daily: [
    { day: "2026-11-28", client: "ios-app" as const, hits: 5 },
    { day: "2026-11-27", client: "ios-app" as const, hits: 3 },
    { day: "2026-11-28", client: "web" as const, hits: 40 },
  ],
  versions: [
    {
      client: "ios-app" as const,
      version: "0.1.0+12",
      hits: 8,
      lastSeen: "2026-11-28T12:30:01.000Z",
    },
  ],
};

describe("pivotClientDays", () => {
  it("lists days oldest first and the busiest client first", () => {
    const { days, rows } = pivotClientDays(usage.daily);
    expect(days).toEqual(["2026-11-27", "2026-11-28"]);
    expect(rows.map((r) => r.client)).toEqual(["web", "ios-app"]);
    expect(rows[1]?.byDay.get("2026-11-27")).toBe(3);
  });
});

describe("AdminClients", () => {
  it("shows hits per client per day and each app version", () => {
    render(<AdminClients usage={usage} />);
    expect(screen.getByText("ios-app 0.1.0+12")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
    expect(screen.getByText(/last 7 days/)).toBeTruthy();
  });

  it("says why there is no data instead of showing zeros", () => {
    render(
      <AdminClients
        usage={{
          status: "unconfigured",
          reason: "CF_ANALYTICS_API_TOKEN unset",
        }}
      />
    );
    expect(screen.getByText(/CF_ANALYTICS_API_TOKEN unset/)).toBeTruthy();
  });
});
