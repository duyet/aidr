/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JevVerdictRow } from "../../../../worker/jev-panel/audit.js";
import { AdminJevVerdicts } from "./AdminJevVerdicts";

afterEach(cleanup);

function verdict(overrides: Partial<JevVerdictRow> = {}): JevVerdictRow {
  return {
    id: "v1",
    createdAt: 1,
    runId: "run",
    purpose: "score",
    subjectId: "item-abc",
    panelId: "p",
    idempotencyKey: "k",
    status: "completed",
    recommendation: "oppose",
    outcomeKind: "opposed",
    outcomeReason: "panel voted against publication",
    quorumReached: true,
    relevanceBefore: 0.8,
    relevanceAfter: 0,
    category: null,
    debateTriggered: false,
    judgeCalls: 2,
    latencyMs: 10,
    inputTokens: 20,
    outputTokens: 40,
    costUsd: null,
    votes: [],
    override: null,
    ...overrides,
  };
}

function renderPanel(rows: JevVerdictRow[]) {
  const onOverride = vi.fn();
  render(
    <AdminJevVerdicts
      verdicts={rows}
      busy={false}
      actionBusyId={null}
      onRefresh={() => {}}
      onOverride={onOverride}
    />
  );
  return onOverride;
}

describe("AdminJevVerdicts", () => {
  it("lists a verdict with its relevance change", () => {
    renderPanel([verdict()]);
    expect(screen.getByText("oppose / opposed")).toBeTruthy();
    expect(screen.getByText("0.80 → 0.00")).toBeTruthy();
  });

  // An override is an audited human decision, so it needs a reason.
  it("keeps the override buttons disabled until a note is typed", () => {
    const onOverride = renderPanel([verdict()]);
    const overturn = screen.getByRole("button", { name: "overturn" });
    expect((overturn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("why (required)"), {
      target: { value: " wrong call " },
    });
    fireEvent.click(screen.getByRole("button", { name: "overturn" }));
    expect(onOverride).toHaveBeenCalledWith("v1", "overturn", "wrong call");

    fireEvent.click(screen.getByRole("button", { name: "uphold" }));
    expect(onOverride).toHaveBeenLastCalledWith("v1", "uphold", "wrong call");
  });

  it("shows the recorded decision instead of buttons once overridden", () => {
    renderPanel([
      verdict({
        override: {
          decision: "uphold",
          note: "n",
          actor: "admin-token",
          at: 1,
        },
      }),
    ]);
    expect(screen.getByText("uphold by admin-token")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "overturn" })).toBeNull();
  });
});
