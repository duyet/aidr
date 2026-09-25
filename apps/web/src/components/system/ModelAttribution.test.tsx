/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountCountView } from "./AccountCountCard";
import { AttributionView } from "./ModelAttribution";

afterEach(cleanup);

const models = {
  scoring: ["typesafe/jev", "anyrouter/auto", "deepseek/deepseek-v4.1-flash"],
  translation: ["google/gemini-3.5-flash", "anyrouter/auto"],
  tldr: ["anyrouter/auto"],
  decisions: [],
};

describe("AttributionView", () => {
  it("shows the four tasks, actual lead models, and fallback hop depth", () => {
    render(<AttributionView models={models} />);

    expect(screen.getByText("Score")).toBeTruthy();
    expect(screen.getByText("Translate")).toBeTruthy();
    expect(screen.getByText("TL;DR")).toBeTruthy();
    expect(screen.getByText("Decisions")).toBeTruthy();
    expect(screen.getByText("typesafe/jev")).toBeTruthy();
    expect(screen.getByText("google/gemini-3.5-flash")).toBeTruthy();
    expect(screen.getByText("2 hops")).toBeTruthy();
    expect(screen.getByText("1 hop")).toBeTruthy();
    expect(screen.getByText("direct")).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "Score lead model typesafe/jev, 2 fallback hops",
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open AnyRouter in a new tab" })
    ).toBeTruthy();
  });

  it("makes an unconfigured task explicit instead of showing a fake model", () => {
    render(<AttributionView models={models} />);

    expect(screen.getByText("Not configured")).toBeTruthy();
    expect(screen.getByText("No model source available")).toBeTruthy();
    expect(screen.getByText("unavailable")).toBeTruthy();
  });
});

describe("AccountCountView", () => {
  it("labels the aggregate separately from subscribers", () => {
    render(
      <AccountCountView
        data={{ total: 37, source: "clerk", status: "available" }}
      />
    );

    expect(screen.getByText("AIDR user signups")).toBeTruthy();
    expect(screen.getByText("37")).toBeTruthy();
    expect(screen.getByText("Clerk accounts · aggregate total")).toBeTruthy();
    expect(screen.queryByText("Subscribers")).toBeNull();
  });

  it.each([
    ["unconfigured", "Account source is not configured."],
    ["error", "Account source could not be read."],
  ] as const)("renders the honest %s state", (status, detail) => {
    render(
      <AccountCountView data={{ total: null, source: "clerk", status }} />
    );

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText(detail)).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
