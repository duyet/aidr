import { track } from "@aidr/ui/track";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import {
  campaignTrackParams,
  isEmailCampaign,
  isExtensionCampaign,
  resolveCampaign,
} from "../lib/campaign";

export function PageViewTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const first = useRef(true);
  const landedExt = useRef(false);
  const landedEmail = useRef(false);

  useEffect(() => {
    const campaign = resolveCampaign({ search, pathname });
    const campaignParams = campaignTrackParams(campaign);

    if (!landedExt.current && isExtensionCampaign(campaign)) {
      landedExt.current = true;
      track("extension_landing", {
        ...campaignParams,
        page_path: pathname,
      });
    }

    if (!landedEmail.current && isEmailCampaign(campaign)) {
      landedEmail.current = true;
      track("email_click", {
        ...campaignParams,
        page_path: pathname,
      });
    }

    if (first.current) {
      // GA config already sends the initial page_view; enrich SPA navs only.
      first.current = false;
      // Still fire a dedicated first-touch attribution event when landing
      // with campaign params (covers hard loads where send_page_view raced).
      if (campaign && Object.keys(campaignParams).length > 0) {
        track("campaign_touch", {
          ...campaignParams,
          page_path: pathname,
        });
      }
      return;
    }

    track("page_view", {
      page_path: pathname,
      ...campaignParams,
    });
  }, [pathname, search]);

  return null;
}
