/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudienceStats } from "../../lib/audience-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { AudienceTab } from "./AudienceTab";
import { API } from "./endpoints";

vi.mock("../../lib/use-system-stats", () => ({ useSystemData: vi.fn() }));

// `TabsContent` only mounts inside a `Tabs` root; this file is about the
// tab's own markup, so unwrap it exactly as the overview test does.
vi.mock("@aidr/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aidr/ui")>()),
  TabsContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockUseSystemData = vi.mocked(useSystemData);

afterEach(() => {
  cleanup();
  mockUseSystemData.mockReset();
});

function statsWith(
  ga4: Partial<AudienceStats["ga4"]>,
  subs: Partial<AudienceStats["subscribers"]> = {}
): AudienceStats {
  return {
    ga4: {
      status: "unconfigured",
      fetchedAt: null,
      audience: null,
      viewsPerDay: [],
      usersPerDay: [],
      topPages: [],
      sources: [],
      ...ga4,
    },
    subscribers: {
      confirmed: 0,
      unconfirmed: 0,
      bySource: [],
      byLang: [],
      byDigestSize: [],
      newPerDay: [],
      new7d: 0,
      new28d: 0,
      ...subs,
    },
  };
}

const AVAILABLE_AUDIENCE = {
  dau: 7,
  mau: 90,
  stickiness: 7.8,
  views28d: 4200,
  sessions28d: 1500,
  newUsers28d: 12,
  views7d: 60,
  avgDailyViews: 20,
};

function respondWith(state: {
  data: AudienceStats | null;
  error?: boolean;
}): void {
  mockUseSystemData.mockReturnValue(state as never);
}

describe("AudienceTab", () => {
  it("reads one audience endpoint", () => {
    respondWith({ data: null });
    render(<AudienceTab lang="en" />);

    expect(mockUseSystemData).toHaveBeenCalledWith(API.audience);
  });

  it("shows page views, DAU, MAU, and stickiness from the snapshot", () => {
    respondWith({
      data: statsWith(
        {
          status: "available",
          audience: AVAILABLE_AUDIENCE,
          fetchedAt: 1_757_000_000,
        },
        { confirmed: 120, new28d: 9, new7d: 3 }
      ),
    });
    render(<AudienceTab lang="en" />);

    expect(screen.getByText("Page views")).toBeTruthy();
    expect(screen.getByText("4.2k")).toBeTruthy();
    expect(screen.getByText("Active today")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("Monthly users")).toBeTruthy();
    expect(screen.getByText("90")).toBeTruthy();
    expect(screen.getByText("7.8%")).toBeTruthy();
    expect(screen.getByText("Subscribers")).toBeTruthy();
  });

  it("states an unconfigured GA4 instead of claiming a zero audience", () => {
    respondWith({
      data: statsWith({ status: "unconfigured" }, { confirmed: 12 }),
    });
    render(<AudienceTab lang="en" />);

    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("GA4 sync has not run yet").length
    ).toBeGreaterThan(0);
    // The subscriber half is a different source and still answers.
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("states a broken snapshot instead of showing a fake zero", () => {
    respondWith({ data: statsWith({ status: "error" }) });
    render(<AudienceTab lang="en" />);

    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Snapshot could not be read").length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("0 views")).toBeNull();
  });

  it("labels a stale snapshot with when it was synced", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    respondWith({
      data: statsWith({
        status: "stale",
        audience: AVAILABLE_AUDIENCE,
        fetchedAt: nowSec - 5 * 24 * 60 * 60,
      }),
    });
    render(<AudienceTab lang="en" />);

    // The numbers still show, but they are dated rather than presented as today.
    expect(screen.getByText("4.2k")).toBeTruthy();
    expect(screen.getAllByText("Snapshot 5d ago").length).toBeGreaterThan(0);
  });

  it("names subscriber channels, languages, and digest sizes", () => {
    respondWith({
      data: statsWith(
        { status: "available", audience: AVAILABLE_AUDIENCE },
        {
          confirmed: 120,
          bySource: [
            { name: "extension", count: 60 },
            { name: "blog", count: 40 },
            { name: "unknown", count: 20 },
          ],
          byLang: [{ name: "vi", count: 100 }],
          byDigestSize: [{ size: 5, count: 110 }],
        }
      ),
    });
    render(<AudienceTab lang="en" />);

    expect(screen.getByText("Subscribers by signup source")).toBeTruthy();
    expect(screen.getByText("Extension")).toBeTruthy();
    // `home` was never signed up, so its label must not appear.
    expect(screen.queryByText("Homepage")).toBeNull();
    expect(screen.getByText("Unknown")).toBeTruthy();
    expect(screen.getByText("Vietnamese")).toBeTruthy();
    expect(screen.getByText("5 stories")).toBeTruthy();
  });

  it("shows the bare path for the homepage and never a full origin", () => {
    respondWith({
      data: statsWith({
        status: "available",
        audience: AVAILABLE_AUDIENCE,
        topPages: [
          { name: "https://aidr.today/", count: 300 },
          { name: "/news", count: 120 },
        ],
      }),
    });
    render(<AudienceTab lang="en" />);

    expect(screen.getByText("Top pages")).toBeTruthy();
    expect(screen.getByText("/news")).toBeTruthy();
    expect(screen.queryByText("https://aidr.today/")).toBeNull();
  });

  it("claims no numbers while the endpoint is in flight", () => {
    respondWith({ data: null });
    const { container } = render(<AudienceTab lang="en" />);

    expect(container.textContent).not.toMatch(/\b\d+\b/);
  });

  it("states a transport failure instead of a blank tab", () => {
    respondWith({ data: null, error: true });
    render(<AudienceTab lang="en" />);

    expect(screen.getByText("Couldn't load audience data.")).toBeTruthy();
  });
});
