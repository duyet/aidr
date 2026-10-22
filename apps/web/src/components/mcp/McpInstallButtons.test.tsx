// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MCP_ENDPOINT } from "../../lib/mcp-install";
import { McpInstallButtons } from "./McpInstallButtons";

describe("McpInstallButtons", () => {
  afterEach(cleanup);

  it("renders one Add link per deeplink client", () => {
    render(<McpInstallButtons />);
    const cursor = screen.getByRole("link", { name: /Add to Cursor/ });
    expect(cursor.getAttribute("href")).toMatch(
      /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?/
    );
    expect(screen.getByRole("link", { name: /Add to VS Code$/ })).toBeTruthy();
  });

  it.each([
    [/Copy Claude URL/, MCP_ENDPOINT],
    [
      /Copy Claude Code command/,
      `claude mcp add --transport http aidr ${MCP_ENDPOINT}`,
    ],
  ])("copy button %s writes the exact string", async (name, expected) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<McpInstallButtons />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name }));
    });
    expect(writeText).toHaveBeenCalledWith(expected);
  });
});
