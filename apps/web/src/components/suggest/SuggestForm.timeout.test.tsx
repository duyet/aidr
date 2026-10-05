/**
 * A suggestion still under review after the poll window must link to the
 * contributions list for the language on screen. The verdict lands on that
 * list; the href is the assertion, and the test does not follow it.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/suggest-fn", () => ({
  fetchSuggestionStatus: vi.fn(),
  submitSuggestion: vi.fn(),
}));

import { suggestionTimeoutHref } from "./SuggestForm";

describe("suggestionTimeoutHref", () => {
  it("links a slow review to the contributions list in the current language", () => {
    expect(suggestionTimeoutHref("vi")).toBe("/contribute?lang=vi");
    expect(suggestionTimeoutHref("en")).toBe("/contribute?lang=en");
    expect(suggestionTimeoutHref("vi")).not.toContain("/submit");
    expect(suggestionTimeoutHref("en")).not.toContain("/submit");
  });
});
