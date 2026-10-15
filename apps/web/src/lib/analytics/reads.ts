import type { ReadChannel, ReadKind } from "../../../worker/reads";
import { landingChannel, readCampaign } from "./landing";

export function readChannelFor(search: string): ReadChannel {
  return landingChannel(readCampaign(search)) ?? "web";
}

/** One count per tab, story, kind and UTC day. Never throws. */
export function recordRead(itemId: string, kind: ReadKind): void {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const key = `aidr-read:${day}:${kind}:${itemId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // storage blocked (private mode): count without the dedupe
    }
    const body = JSON.stringify({
      item_id: itemId,
      kind,
      channel: readChannelFor(window.location.search),
    });
    const sent =
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(
        "/api/read",
        new Blob([body], { type: "text/plain" })
      );
    if (!sent) {
      fetch("/api/read", { method: "POST", body, keepalive: true }).catch(
        () => {}
      );
    }
  } catch {
    // never break UI
  }
}
