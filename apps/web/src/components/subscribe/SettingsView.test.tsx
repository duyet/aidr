/** @vitest-environment happy-dom */

/**
 * The settings page is recorded by PostHog session replay when it is on, and
 * a link's href lands in the recording. The Unsubscribe control must not put
 * the subscribe token in one. It hands the token over in history state.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeLinkOf } from "../../lib/analytics/url-privacy";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("./SettingsPreview", () => ({ SettingsPreview: () => null }));

import { SettingsView } from "./SettingsView";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            email_masked: "a***@x.io",
            lang: "en",
            digest_size: 5,
          })
        )
    )
  );
});

afterEach(() => {
  cleanup();
  navigate.mockReset();
  vi.unstubAllGlobals();
});

describe("SettingsView unsubscribe", () => {
  it("renders no link or form action that carries the token", async () => {
    const { container } = render(<SettingsView token="SECRET" lang="en" />);
    await screen.findByText("Unsubscribe");
    for (const el of container.querySelectorAll("[href], [src], [action]")) {
      const urls = ["href", "src", "action"].map((n) => el.getAttribute(n));
      expect(urls.join(" ")).not.toContain("SECRET");
    }
  });

  it("shows a pointer cursor, as the link it replaced did", async () => {
    render(<SettingsView token="TOK" lang="en" />);
    const button = await screen.findByRole("button", { name: "Unsubscribe" });
    expect(button.className).toContain("cursor-pointer");
  });

  it("unsubscribes by navigating with the token in history state", async () => {
    render(<SettingsView token="SECRET" lang="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Unsubscribe" }));
    expect(navigate).toHaveBeenCalledTimes(1);
    const arg = navigate.mock.calls[0][0];
    expect(arg.href).toMatch(/^\/subscribe(\?lang=\w+)?$/);
    expect(subscribeLinkOf(arg.state)).toEqual({
      kind: "unsubscribe",
      token: "SECRET",
    });
  });
});
