/** @vitest-environment happy-dom */

/**
 * A history entry that unsubscribed one token must not stop a different
 * token from sending its DELETE. Tokens are per subscription (#723), so a
 * marker that matched any token would let a reload of an entry carrying a
 * newer link show "unsubscribed" without ever removing that subscription.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  adoptSubscribeLink,
  markUnsubscribed,
  wasUnsubscribed,
} from "./url-privacy";

type LinkWindow = Window & {
  __aidrSubscribeLink?: { kind: "unsubscribe"; token: string };
};

afterEach(() => {
  history.replaceState(null, "", "/");
});

describe("the unsubscribed marker belongs to one token", () => {
  it("suppresses the DELETE for the marked token only", () => {
    history.replaceState(null, "", "/subscribe");
    (window as LinkWindow).__aidrSubscribeLink = {
      kind: "unsubscribe",
      token: "TOKEN-A",
    };
    adoptSubscribeLink();
    markUnsubscribed("TOKEN-A");

    expect(wasUnsubscribed(history.state, "TOKEN-A")).toBe(true);
    expect(wasUnsubscribed(history.state, "TOKEN-B")).toBe(false);
  });

  it("is absent on an entry that never unsubscribed anything", () => {
    history.replaceState(null, "", "/subscribe");
    expect(wasUnsubscribed(history.state, "TOKEN-A")).toBe(false);
    expect(wasUnsubscribed(null, "TOKEN-A")).toBe(false);
  });
});
