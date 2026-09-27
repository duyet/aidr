import type { RouteIndexabilityInput } from "./route-indexability";
import { getRouteSearch, unavailableRouteSearch } from "./route-search";

/**
 * The route identity a head-tag builder needs for its structured-data gate.
 *
 * It is deliberately the *raw* request query, not the route's validated
 * `match.search`: `routeIndexability()` must see the same keys the robots meta
 * and the Worker's `X-Robots-Tag` saw, including keys a route validator drops
 * (`?utm_source=`, `?settings=`, …). A `match.search` that lost `utm_source`
 * would let `/?lang=vi&utm_source=telegram` publish a graph the response
 * headers call noindex.
 *
 * The status is mapped the same way the root route's `routeRobotsMeta` maps it,
 * so a route that ends up not-found or errored cannot ship an indexable graph
 * either.
 */
export function headRouteInput(match: {
  pathname?: string;
  status?: string;
}): RouteIndexabilityInput {
  let search: URLSearchParams;
  try {
    search = getRouteSearch();
  } catch {
    // A missing raw request URL must not make a public route indexable.
    search = unavailableRouteSearch();
  }
  return {
    pathname: match.pathname ?? "/",
    search,
    status:
      match.status === "notFound"
        ? 404
        : match.status === "error"
          ? 500
          : undefined,
  };
}
