/**
 * A broken publisher image must step to the OG card, then to the site mark,
 * and stay there. Remembering only the latest failure sends the two URLs
 * back and forth, so the placeholder is never what remains.
 *
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STORY_THUMB_PLACEHOLDER, StoryThumb } from "./StoryThumb";

afterEach(cleanup);

const PUBLISHER = "https://cdn.example.test/stories/launch.jpg";
const ITEM_ID = "abcdef12deadbeef";
const OG = `/api/og/${ITEM_ID}.png?lang=en`;

function srcOf(container: HTMLElement): string {
  const src = container.querySelector("img")?.getAttribute("src");
  if (!src) throw new Error("missing thumb src");
  return src;
}

describe("StoryThumb image errors", () => {
  it("settles on the placeholder after the publisher image and the OG card both fail", () => {
    const { container } = render(
      <StoryThumb src={PUBLISHER} itemId={ITEM_ID} lang="en" />
    );
    const seen: string[] = [];
    const record = () => {
      const src = srcOf(container);
      seen.push(src);
      return src;
    };
    const fail = () => {
      const img = container.querySelector("img");
      if (!img) throw new Error("missing thumb");
      fireEvent.error(img);
    };

    expect(record()).toBe(PUBLISHER);

    fail();
    expect(record()).toBe(OG);

    fail();
    expect(record()).toBe(STORY_THUMB_PLACEHOLDER);

    // Another error must not walk back to a URL that already failed.
    fail();
    expect(record()).toBe(STORY_THUMB_PLACEHOLDER);
    expect(seen.filter((src) => src === PUBLISHER)).toEqual([PUBLISHER]);
    expect(seen.filter((src) => src === OG)).toEqual([OG]);
    expect(container.innerHTML).not.toContain(PUBLISHER);
  });

  it("shows the OG card when the publisher image is missing", () => {
    const { container } = render(
      <StoryThumb src={null} itemId={ITEM_ID} lang="en" />
    );
    expect(srcOf(container)).toBe(OG);
    expect(container.innerHTML).not.toContain(STORY_THUMB_PLACEHOLDER);
  });
});
