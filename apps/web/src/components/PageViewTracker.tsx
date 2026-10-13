import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { landingFromUrl, pageType } from "../lib/analytics/landing";
import { track } from "../lib/analytics/track";

export function PageViewTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const landed = useRef(false);

  useEffect(() => {
    // The language switch re-navigates with the same search, so only the
    // first run may count as a landing.
    if (!landed.current) {
      landed.current = true;
      const landing = landingFromUrl(search, pathname);
      if (landing) track("channel_landing", landing);
    }
    track("page_view", { page_path: pathname, page_type: pageType(pathname) });
  }, [pathname, search]);

  return null;
}
