import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeeklySubscribeCta, weeklySubscribeHref } from "./WeeklySubscribeCta";

describe("WeeklySubscribeCta", () => {
  it("links to the email tab with weekly preselected", () => {
    const url = new URL(weeklySubscribeHref("en"), "https://aidr.today");
    expect(url.pathname).toBe("/subscribe");
    expect(url.searchParams.get("tab")).toBe("email");
    expect(url.searchParams.get("freq")).toBe("weekly");
  });

  it("renders per-language copy", () => {
    const en = renderToStaticMarkup(<WeeklySubscribeCta lang="en" />);
    expect(en).toContain("Subscribe to the weekly email");
    const vi = renderToStaticMarkup(<WeeklySubscribeCta lang="vi" />);
    expect(vi).toContain("Đăng ký email tuần");
    expect(vi).not.toContain("Subscribe to the weekly email");
  });
});
