/** @vitest-environment happy-dom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ImageZoom } from "./ImageZoom";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Zoom
      </button>
      {open && (
        <ImageZoom
          src="https://example.com/a.jpg"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

afterEach(cleanup);

async function openZoom() {
  const trigger = screen.getByRole("button", { name: "Zoom" });
  trigger.focus();
  await act(async () => {
    trigger.click();
  });
  return trigger;
}

describe("ImageZoom", () => {
  it("opens a modal image dialog with the verbatim image", async () => {
    render(<Harness />);
    await openZoom();
    const dialog = screen.getByRole("dialog", { name: "Image" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(
      dialog
        .querySelector("img.story-dialog-lightbox-image")
        ?.getAttribute("src")
    ).toBe("https://example.com/a.jpg");
  });

  it("closes on Escape and returns focus to the control that opened it", async () => {
    render(<Harness />);
    const trigger = await openZoom();
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes from its labelled close button", async () => {
    render(<Harness />);
    await openZoom();
    await act(async () => {
      screen.getByRole("button", { name: "Close" }).click();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
