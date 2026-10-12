import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmailChannel } from "./EmailChannel";

describe("EmailChannel initial frequency", () => {
  it("previews the daily digest by default", () => {
    expect(renderToStaticMarkup(<EmailChannel lang="en" />)).toContain(
      "freq=daily"
    );
  });

  it("previews the weekly edition when preselected", () => {
    expect(
      renderToStaticMarkup(<EmailChannel lang="en" initialFrequency="weekly" />)
    ).toContain("freq=weekly");
  });
});
