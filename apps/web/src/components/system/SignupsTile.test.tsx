/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountCount } from "../../../worker/account-count.js";
import { useSystemData } from "../../lib/use-system-stats";
import { API } from "./endpoints";
import { SignupsTile } from "./SignupsTile";

vi.mock("../../lib/use-system-stats", () => ({ useSystemData: vi.fn() }));

const mockUseSystemData = vi.mocked(useSystemData);

afterEach(() => {
  cleanup();
  mockUseSystemData.mockReset();
});

function respondWith(state: {
  data: AccountCount | null;
  error?: boolean;
}): void {
  mockUseSystemData.mockReturnValue(state as never);
}

describe("SignupsTile", () => {
  it("reads the accounts endpoint, not the overview batch", () => {
    respondWith({ data: { total: 0, source: "d1", status: "available" } });
    render(<SignupsTile />);

    expect(mockUseSystemData).toHaveBeenCalledWith(API.accounts);
  });

  it("shows the mirrored Clerk total with a real zero when there are none", () => {
    respondWith({ data: { total: 0, source: "d1", status: "available" } });
    render(<SignupsTile />);

    expect(screen.getByText("Signups")).toBeTruthy();
    // A genuinely empty mirror is a 0, not "Unavailable" — but it is never
    // the subscribers count wearing a signups label.
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("Clerk accounts")).toBeTruthy();
    expect(screen.queryByText("Subscribers")).toBeNull();
  });

  it("renders the aggregate from its own endpoint", () => {
    respondWith({ data: { total: 37, source: "d1", status: "available" } });
    render(<SignupsTile />);

    expect(screen.getByText("Signups")).toBeTruthy();
    expect(screen.getByText("37")).toBeTruthy();
    expect(screen.getByText("Clerk accounts")).toBeTruthy();
  });

  it("shows the placeholder instead of a value while the endpoint is in flight", () => {
    respondWith({ data: null });
    render(<SignupsTile />);

    expect(screen.getByText("Signups")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("Unavailable")).toBeNull();
  });

  it.each([
    ["unconfigured", "Webhook not synced yet"],
    ["error", "Signup source could not be read"],
  ] as const)("never invents a total for the %s state", (status, detail) => {
    respondWith({ data: { total: null, source: "d1", status } });
    render(<SignupsTile />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText(detail)).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("states a transport failure instead of showing a fake zero", () => {
    respondWith({ data: null, error: true });
    render(<SignupsTile />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("Couldn't load signups")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("never claims a signup total before the endpoint answers", () => {
    respondWith({ data: null });
    const { container } = render(<SignupsTile />);

    expect(container.textContent).not.toMatch(/\b\d+\b/);
  });
});
