/**
 * @vitest-environment happy-dom
 *
 * The header is rendered from several public routes. These tests pin the
 * client-facing contract for both desktop/logo and mobile News navigation:
 * the destination is the canonical home path with one explicit locale and no
 * TanStack payload/query state.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangContext } from "../../lib/lang-context";
import { Brand } from "./Brand";

vi.mock("@aidr/ui/track", () => ({ track: vi.fn() }));
vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({
      children,
      to,
      search,
      ...props
    }: {
      children?: React.ReactNode;
      to?: string;
      search?: Record<string, unknown>;
      [key: string]: unknown;
    }) => {
      const url = new URL(to ?? "/", "http://localhost");
      for (const [key, value] of Object.entries(search ?? {})) {
        if (typeof value === "string") url.searchParams.set(key, value);
      }
      return React.createElement(
        "a",
        { ...props, href: `${url.pathname}${url.search}${url.hash}` },
        children
      );
    },
  };
});

afterEach(() => cleanup());

describe("Brand home navigation", () => {
  it.each([
    ["en", "en"],
    ["vi", "vi"],
  ] as const)(
    "keeps the %s logo link canonical",
    (contentLang, navigationLang) => {
      render(
        <LangContext.Provider value={navigationLang}>
          <Brand lang={contentLang} />
        </LangContext.Provider>
      );

      const link = screen.getByRole("link", { name: /AI;DR/ });
      expect(link.getAttribute("href")).toBe(`/?lang=${navigationLang}`);
      expect(link.getAttribute("href")).not.toContain("payload");
      expect(link.getAttribute("href")).not.toContain("locale");
    }
  );
});
