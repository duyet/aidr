/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangContext } from "../../lib/lang-context";
import { DeliverPage } from "./DeliverPage";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));
vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({ children, to }: { children?: ReactNode; to?: string }) =>
      React.createElement("a", { href: to ?? "#" }, children),
  };
});

afterEach(cleanup);

describe("MCP subscribe tab", () => {
  // The owner wants MCP listed as a way to use AI;DR, right before RSS.
  it("sits right before RSS and opens with ?tab=mcp", () => {
    render(
      <LangContext.Provider value="en">
        <DeliverPage tab="mcp" onTabChange={() => {}} />
      </LangContext.Provider>
    );
    const names = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(names.indexOf("MCP")).toBe(names.indexOf("RSS") - 1);
    expect(
      screen.getByRole("tab", { name: "MCP", selected: true })
    ).toBeTruthy();
    expect(screen.getAllByText(/aidr\.today\/api\/mcp/).length).toBeGreaterThan(
      0
    );
    expect(
      screen
        .getByRole("link", { name: /Tools and full setup/ })
        .getAttribute("href")
    ).toBe("/mcp");
  });
});
