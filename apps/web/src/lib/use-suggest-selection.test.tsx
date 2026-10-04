/**
 * Accepting a selection twice with the same words must still be a new
 * request. The signed-out sign-in modal keys off that attempt, or
 * dismissing it would ignore the next click.
 *
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useSuggestSelection } from "./use-suggest-selection";

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const {
    selectionButton,
    pendingSuggestion,
    suggestionAttempt,
    acceptSelection,
  } = useSuggestSelection(ref, true);
  return (
    <div ref={ref}>
      <p data-suggest-field="summary">cùng một câu</p>
      {selectionButton ? (
        <button
          type="button"
          data-selection-button=""
          onClick={acceptSelection}
        >
          Suggest
        </button>
      ) : null}
      <output data-testid="pending">
        {pendingSuggestion?.text ?? ""}:{suggestionAttempt}
      </output>
    </div>
  );
}

afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
});

function selectParagraph() {
  const paragraph = screen.getByText("cùng một câu");
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  const selection = window.getSelection();
  if (!selection) throw new Error("missing selection");
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.mouseUp(paragraph);
}

describe("useSuggestSelection", () => {
  it("counts a repeated selection as a new attempt", () => {
    render(<Harness />);

    selectParagraph();
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    expect(screen.getByTestId("pending").textContent).toBe("cùng một câu:1");

    selectParagraph();
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    expect(screen.getByTestId("pending").textContent).toBe("cùng một câu:2");
  });
});
