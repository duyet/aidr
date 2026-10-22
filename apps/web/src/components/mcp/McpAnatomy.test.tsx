// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PUBLIC_READ_TOOLS } from "../../lib/public-read-tools";
import { McpAnatomy } from "./McpAnatomy";

describe("McpAnatomy", () => {
  afterEach(cleanup);

  it("draws one drawer per public MCP read tool, in server order", () => {
    const { container } = render(<McpAnatomy />);
    const drawers = [
      ...container.querySelectorAll("g[data-part][clip-path]"),
    ].map((g) => g.getAttribute("data-part"));
    expect(drawers.sort()).toEqual(
      PUBLIC_READ_TOOLS.map((tool) => tool.name).sort()
    );
    const buttons = screen
      .getAllByRole("button")
      .slice(0, PUBLIC_READ_TOOLS.length);
    expect(buttons.map((b) => b.textContent)).toEqual(
      PUBLIC_READ_TOOLS.map((tool) => tool.name)
    );
  });

  it("opens the chosen drawer and says what that tool returns", () => {
    const { container } = render(<McpAnatomy />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "get_story" }));
    });
    const open = container.querySelectorAll("g[data-open]");
    expect(open).toHaveLength(1);
    expect(open[0].getAttribute("data-part")).toBe("get_story");
    expect(container.querySelector("[data-readout]")?.textContent).toBe(
      "get_story"
    );
    expect(screen.getByText(/aidr-story-markdown\/v1/)).toBeTruthy();
  });
});
