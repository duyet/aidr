/** @vitest-environment happy-dom */
import { ErrorBoundary } from "@aidr/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function RedirectFailure({ shouldFail }: { shouldFail: boolean }) {
  if (shouldFail) throw new Error("Too many redirects");
  return <p>Navigation recovered</p>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("redirect error boundary", () => {
  it("contains a redirect-loop failure and allows a retry", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let shouldFail = true;
    const view = render(
      <ErrorBoundary>
        <RedirectFailure shouldFail={shouldFail} />
      </ErrorBoundary>
    );

    expect(
      screen.getByRole("heading", { name: "Something went wrong" })
    ).toBeTruthy();
    expect(screen.getByText("Too many redirects")).toBeTruthy();

    shouldFail = false;
    view.rerender(
      <ErrorBoundary>
        <RedirectFailure shouldFail={shouldFail} />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("Navigation recovered")).toBeTruthy();
  });
});
