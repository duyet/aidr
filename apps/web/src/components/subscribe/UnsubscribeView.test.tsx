/** @vitest-environment happy-dom */

/**
 * An unsubscribe link removes the subscription its token names. The DELETE
 * goes out once per arriving link (#723). Reloading that history entry, or pressing Back to it after
 * subscribing again in the same tab, shows the result and must not delete
 * the new subscription. A server render, which is all a link scanner
 * fetches, sends nothing.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  subscribeLinkOf,
  subscribeLinkState,
} from "../../lib/analytics/url-privacy";
import { UnsubscribeView } from "./UnsubscribeView";

let View = UnsubscribeView;

const DONE = "You have been unsubscribed.";

const fetchMock = vi.fn(
  async (_url: string, _init?: RequestInit) => new Response("{}")
);

function deletes() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
}

/** Renders the view the subscribe route shows for the current entry. */
function renderEntry() {
  const link = subscribeLinkOf(history.state);
  if (link?.kind !== "unsubscribe") throw new Error("entry has no link");
  return render(
    <StrictMode>
      <View token={link.token} lang="en" />
    </StrictMode>
  );
}

/** A reload keeps the history entry and starts every module fresh. */
async function reload() {
  cleanup();
  vi.resetModules();
  View = (await import("./UnsubscribeView")).UnsubscribeView;
}

function back(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener("popstate", () => resolve(), { once: true });
    history.back();
  });
}

beforeEach(() => {
  View = UnsubscribeView;
  vi.stubGlobal("fetch", fetchMock);
  history.replaceState(
    subscribeLinkState({ kind: "unsubscribe", token: "TOK" }),
    "",
    "/subscribe"
  );
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response("{}"));
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("UnsubscribeView", () => {
  it("unsubscribes once when the link arrives", async () => {
    renderEntry();
    await screen.findByText(DONE);
    expect(deletes()).toEqual([
      ["/api/subscribe?token=TOK", { method: "DELETE" }],
    ]);
  });

  it("sends nothing from a server render", () => {
    renderToString(<UnsubscribeView token="TOK" lang="en" />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows unsubscribed on reload without a second DELETE", async () => {
    renderEntry();
    await screen.findByText(DONE);
    await reload();

    renderEntry();
    await screen.findByText(DONE);
    expect(deletes()).toHaveLength(1);
  });

  it("does not DELETE again on Back after subscribing again", async () => {
    renderEntry();
    await screen.findByText(DONE);
    cleanup();

    // The footer's "Get AI;DR" pushes a fresh /subscribe entry, where the
    // reader signs up again. Back returns to the entry that held the link.
    history.pushState({}, "", "/subscribe");
    await back();

    renderEntry();
    await screen.findByText(DONE);
    expect(deletes()).toHaveLength(1);
  });

  it("tries again on reload when the DELETE failed", async () => {
    fetchMock.mockImplementation(
      async () => new Response("{}", { status: 500 })
    );
    renderEntry();
    await screen.findByText("Something went wrong, please try again.");
    await reload();

    fetchMock.mockImplementation(async () => new Response("{}"));
    renderEntry();
    await screen.findByText(DONE);
    expect(deletes()).toHaveLength(2);
  });
});
