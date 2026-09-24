import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

/** Raw query state for route head policy, including keys route validators drop. */
const QUERY_UNAVAILABLE = "__route_query_unavailable";

export function unavailableRouteSearch(): URLSearchParams {
  // A missing raw request URL must not make a public route indexable.
  return new URLSearchParams([[QUERY_UNAVAILABLE, ""]]);
}

export const getRouteSearch = createIsomorphicFn()
  .client(() => new URLSearchParams(window.location.search))
  .server(() => {
    try {
      return new URL(getRequestUrl()).searchParams;
    } catch {
      return unavailableRouteSearch();
    }
  });
