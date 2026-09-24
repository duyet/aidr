import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

/** Raw query state for route head policy, including keys route validators drop. */
export const getRouteSearch = createIsomorphicFn()
  .client(() => new URLSearchParams(window.location.search))
  .server(() => new URL(getRequestUrl()).searchParams);
