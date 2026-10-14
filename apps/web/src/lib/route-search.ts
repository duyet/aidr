import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { subscribeLinkToRender } from "./analytics/url-privacy";

/** Raw query state for route head policy, including keys route validators drop. */
const QUERY_UNAVAILABLE = "__route_query_unavailable";

export function unavailableRouteSearch(): URLSearchParams {
  // A missing raw request URL must not make a public route indexable.
  return new URLSearchParams([[QUERY_UNAVAILABLE, ""]]);
}

export const getRouteSearch = createIsomorphicFn()
  .client(() => {
    const search = new URLSearchParams(window.location.search);
    // The server saw the emailed subscribe token in the URL; the browser
    // removed it before hydrating. Head policy (noindex for a tokened link)
    // has to match what the server rendered.
    const link = subscribeLinkToRender(window.history.state, false);
    if (link) search.set(link.kind, link.token);
    return search;
  })
  .server(() => {
    try {
      return new URL(getRequestUrl()).searchParams;
    } catch {
      return unavailableRouteSearch();
    }
  });
