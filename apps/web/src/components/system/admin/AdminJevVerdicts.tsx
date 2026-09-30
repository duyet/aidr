import { useState } from "react";
import type { JevVerdictRow } from "../../../../worker/jev-panel/audit.js";
import { AdminSection } from "./AdminSection";
import { adminBtnClass } from "./lib";

export type JevOverrideDecision = "uphold" | "overturn";

function relevanceLabel(row: JevVerdictRow): string {
  if (row.relevanceBefore === null || row.relevanceAfter === null) return "—";
  return `${row.relevanceBefore.toFixed(2)} → ${row.relevanceAfter.toFixed(2)}`;
}

/** JEV review panel verdicts (#144) with the human override. A note is
 *  required; `overturn` on a scoring verdict restores the pre-panel
 *  relevance server side. */
export function AdminJevVerdicts({
  verdicts,
  busy,
  actionBusyId,
  onRefresh,
  onOverride,
}: {
  verdicts: JevVerdictRow[];
  busy: boolean;
  actionBusyId: string | null;
  onRefresh: () => void;
  onOverride: (id: string, decision: JevOverrideDecision, note: string) => void;
}) {
  const [note, setNote] = useState("");
  const trimmed = note.trim();
  return (
    <AdminSection
      title="Review panel verdicts"
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className={adminBtnClass}
        >
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      {verdicts.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          No panel verdicts. The panel is off unless JEV_PANEL_ENABLED is set.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <label className="mb-2 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Override note</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="why (required)"
              className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5"
            />
          </label>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1 pr-2 font-normal">subject</th>
                <th className="py-1 pr-2 font-normal">purpose</th>
                <th className="py-1 pr-2 font-normal">verdict</th>
                <th className="py-1 pr-2 font-normal">votes</th>
                <th className="py-1 pr-2 font-normal text-right">relevance</th>
                <th className="py-1 pr-2 font-normal">override</th>
              </tr>
            </thead>
            <tbody>
              {verdicts.map((row) => {
                const rowBusy = actionBusyId === row.id;
                return (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="py-1 pr-2 font-mono">
                      {row.subjectId.slice(0, 12)}
                    </td>
                    <td className="py-1 pr-2">{row.purpose}</td>
                    <td className="py-1 pr-2" title={row.outcomeReason}>
                      {row.recommendation} / {row.outcomeKind}
                    </td>
                    <td className="py-1 pr-2">
                      {row.votes
                        .map(
                          (vote) => `${vote.role}:${vote.vote ?? vote.status}`
                        )
                        .join(" ")}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {relevanceLabel(row)}
                    </td>
                    <td className="py-1 pr-2">
                      {row.override ? (
                        <span title={row.override.note}>
                          {row.override.decision} by {row.override.actor}
                        </span>
                      ) : (
                        <div className="flex gap-1">
                          {(["uphold", "overturn"] as const).map((decision) => (
                            <button
                              key={decision}
                              type="button"
                              disabled={rowBusy || !trimmed}
                              onClick={() =>
                                onOverride(row.id, decision, trimmed)
                              }
                              className="rounded border border-border px-1.5 py-0.5 capitalize hover:bg-muted disabled:opacity-50"
                            >
                              {decision}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminSection>
  );
}
