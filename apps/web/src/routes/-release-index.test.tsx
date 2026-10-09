/**
 * /release is the changelog now. The index must list every release newest
 * first with a link to its page, keep the Chrome extension notes and the
 * pre-v0.1.0 notes, and render their figures lazily with dimensions.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LangContext } from "../lib/lang-context";
import { RELEASES } from "../lib/releases/index";
import type { Lang } from "../lib/types";
import { Route } from "./release.index";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      children,
      className,
      to,
      params,
    }: {
      children?: ReactNode;
      className?: string;
      to?: string;
      params?: { version?: string };
    }) =>
      createElement(
        "a",
        {
          className,
          href: params?.version ? `/release/${params.version}` : to,
        },
        children
      ),
  };
});

function render(lang: Lang): string {
  const Page = Route.options.component as () => React.ReactElement;
  return renderToStaticMarkup(
    <LangContext.Provider value={lang}>
      <Page />
    </LangContext.Provider>
  );
}

describe("/release index", () => {
  it("lists every release newest first with a link to its page", () => {
    const html = render("en");
    const hrefs = [...html.matchAll(/href="\/release\/v([^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(hrefs).toEqual(RELEASES.map((r) => r.version));
  });

  it("keeps the extension and earlier notes with lazy, sized figures", () => {
    const html = render("vi");
    expect(html).toContain("Tiện ích Chrome");
    expect(html).toContain("Trước v0.1.0");
    expect(html).toContain("Ra mắt: tin AI cập nhật theo giờ");
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img).toContain('loading="lazy"');
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
    }
  });
});
