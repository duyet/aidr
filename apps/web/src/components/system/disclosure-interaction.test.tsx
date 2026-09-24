/* @vitest-environment happy-dom */
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import type { FeedItem } from "../../lib/types";
import { StoryMetaAside } from "../story/StoryMetaAside";
import { RunRow } from "./RunRow";

const item: FeedItem = {
  id: "story-1",
  url: "https://example.test/story-1",
  title: "A story",
  title_vi: null,
  summary: null,
  summary_vi: null,
  category: null,
  published_at: 1_700_000_000,
  points: 1,
  comments: 0,
  rank_score: 1,
  source_id: "hn",
  tags: [],
  sources: [],
  llm_tokens: 123,
  image_url: null,
};

const attempt: LlmCallRow = {
  ts: 1_700_000_010_000,
  runId: "run-1",
  task: "score",
  model: "anyrouter/auto",
  ok: true,
  tokens: 100,
  durationMs: 20,
  promptChars: 10,
  promptTokens: 80,
  completionTokens: 20,
  cachedTokens: 0,
  error: null,
  errorCode: null,
  errorStatus: null,
};

const run: WorkflowRunRow = {
  id: "run-1",
  started_at: 1_700_000_000,
  finished_at: 1_700_000_100,
  items_fetched: 1,
  items_new: 1,
  error: null,
  stats: { bySource: { hn: 1 } },
  llm: {
    calls: 1,
    failures: 0,
    tokens: 100,
    cachedTokens: 0,
    durationMs: 20,
    models: ["anyrouter/auto"],
    attempts: [attempt],
  },
};

function click(element: Element) {
  act(() => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
  });
}

function pressEscape(element: Element) {
  act(() => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    );
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;
});

describe("nested disclosure Escape behavior", () => {
  it("closes only the story disclosure and restores its trigger", () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const outerEscape = vi.fn();
    document.addEventListener("keydown", outerEscape);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() =>
      root.render(<StoryMetaAside item={item} lang="en" imageUrl={null} />)
    );
    const trigger = host.querySelector(
      "button[aria-controls]"
    ) as HTMLButtonElement;
    click(trigger);
    const panel = host.querySelector("fieldset[aria-label='Story details']");
    expect(panel).not.toBeNull();
    expect(trigger.className).toContain("min-h-8");
    expect(panel?.className).toContain("min-w-0");
    const link = panel?.querySelector("a");
    expect(link).not.toBeNull();
    (link as HTMLElement).focus();
    pressEscape(link as Element);

    expect(
      host.querySelector("fieldset[aria-label='Story details']")
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(outerEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outerEscape);
    act(() => root.unmount());
  });

  it("closes the run disclosure from inside its attempt table", () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    function Harness() {
      const [expanded, setExpanded] = useState(false);
      return (
        <table>
          <tbody>
            <RunRow
              run={run}
              lang="en"
              maxDuration={100}
              expanded={expanded}
              attemptsState={"ready"}
              attempts={[attempt]}
              onToggle={() => setExpanded((value) => !value)}
            />
          </tbody>
        </table>
      );
    }

    const outerEscape = vi.fn();
    document.addEventListener("keydown", outerEscape);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Harness />));

    const trigger = host.querySelector(
      "button[aria-label^='Show run details ·']"
    ) as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    click(trigger);
    const panel = host.querySelector("fieldset[aria-label='Run summary']");
    expect(panel?.className).toContain("min-w-0");
    expect(panel?.querySelector(".overflow-x-auto")).not.toBeNull();
    const modelLink = panel?.querySelector("a");
    expect(modelLink).not.toBeNull();
    (modelLink as HTMLElement).focus();
    pressEscape(modelLink as Element);

    expect(host.querySelector("fieldset[aria-label='Run summary']")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(outerEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outerEscape);
    act(() => root.unmount());
  });
});
