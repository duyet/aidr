import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeaderAuth } from "./HeaderAuth";

async function serverHtml(url: string): Promise<string> {
  const rootRoute = createRootRoute({ component: () => <HeaderAuth /> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/sign-in/$" }),
      createRoute({ getParentRoute: () => rootRoute, path: "$" }),
    ]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();
  return renderToString(<RouterProvider router={router} />);
}

async function serverSignInHref(url: string): Promise<string> {
  const html = await serverHtml(url);
  const href = html.match(/href="(\/sign-in[^"]*)"/)?.[1];
  if (!href) throw new Error(`no sign-in link rendered for ${url}: ${html}`);
  return href.replaceAll("&amp;", "&");
}

function redirectParam(href: string): string | null {
  return new URL(href, "https://aidr.today").searchParams.get("redirect_url");
}

const fakeToken = () => ["fake", "settings", "value"].join("-");

describe("HeaderAuth sign-in link", () => {
  // The mailed settings link puts a token that can change the subscription
  // in the request URL. The server renders before the head boot script
  // strips it, and React does not patch a mismatched href on hydration, so
  // anything rendered here is what a middle-click sends to Clerk.
  it("never renders a /subscribe token into the server HTML", async () => {
    const token = fakeToken();
    const url = `/subscribe?settings=${token}&lang=en`;
    expect(redirectParam(await serverSignInHref(url))).toBe(
      "/subscribe?lang=en"
    );
    expect(await serverHtml(url)).not.toContain(token);
  });

  it.each([
    [
      "a /subscribe token the boot script strips",
      `/subscribe?settings=${fakeToken()}&lang=en`,
      "/subscribe?lang=en#top",
    ],
    ["a fragment", "/abcdef12?lang=en", "/abcdef12?lang=en#sources"],
  ])(
    "renders the same href on server and client for %s",
    async (_, server, client) => {
      // Browsers never send the fragment, so only the client sees it.
      expect(await serverSignInHref(client)).toBe(
        await serverSignInHref(server)
      );
    }
  );
});
