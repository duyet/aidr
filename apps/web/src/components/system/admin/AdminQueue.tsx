import { AdminSection } from "./AdminSection";
import {
  adminBtnClass,
  type QueueSubmission,
  type QueueSuggestion,
} from "./lib";

function DecideButtons({
  busy,
  onDecide,
}: {
  busy: boolean;
  onDecide: (action: "approve" | "reject") => void;
}) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => onDecide("approve")}
        className="rounded border border-border px-1.5 py-0.5 hover:bg-muted disabled:opacity-50"
      >
        Approve
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onDecide("reject")}
        className="rounded border border-border px-1.5 py-0.5 hover:bg-muted disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}

export function AdminQueue({
  suggestions,
  submissions,
  busy,
  actionBusyId,
  onRefresh,
  onDecide,
}: {
  suggestions: QueueSuggestion[];
  submissions: QueueSubmission[];
  busy: boolean;
  actionBusyId: string | null;
  onRefresh: () => void;
  onDecide: (
    kind: "suggestions" | "submissions",
    id: string,
    action: "approve" | "reject"
  ) => void;
}) {
  return (
    <AdminSection
      title="Queue"
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
      {suggestions.length === 0 && submissions.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          No pending suggestions or submissions.
        </p>
      ) : (
        <div className="mt-2 space-y-4">
          {suggestions.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Suggestions
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-normal">field</th>
                    <th className="py-1 pr-2 font-normal">suggestion</th>
                    <th className="py-1 pr-2 font-normal">user</th>
                    <th className="py-1 pr-2 font-normal text-right">rating</th>
                    <th className="py-1 pr-2 font-normal">actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((row) => (
                    <tr key={row.id} className="border-b border-border/50">
                      <td className="py-1 pr-2">{row.field}</td>
                      <td className="py-1 pr-2 max-w-xs truncate">
                        {row.suggestion}
                      </td>
                      <td className="py-1 pr-2">{row.user_name ?? "—"}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {row.rating ?? "—"}
                      </td>
                      <td className="py-1 pr-2">
                        <DecideButtons
                          busy={actionBusyId === row.id}
                          onDecide={(action) =>
                            onDecide("suggestions", row.id, action)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {submissions.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Submissions
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-normal">title</th>
                    <th className="py-1 pr-2 font-normal">url</th>
                    <th className="py-1 pr-2 font-normal">user</th>
                    <th className="py-1 pr-2 font-normal text-right">rating</th>
                    <th className="py-1 pr-2 font-normal">actions</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((row) => (
                    <tr key={row.id} className="border-b border-border/50">
                      <td className="py-1 pr-2 max-w-xs truncate">
                        {row.title}
                      </td>
                      <td className="py-1 pr-2 max-w-xs truncate">
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {row.url}
                        </a>
                      </td>
                      <td className="py-1 pr-2">{row.user_name ?? "—"}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {row.rating ?? "—"}
                      </td>
                      <td className="py-1 pr-2">
                        <DecideButtons
                          busy={actionBusyId === row.id}
                          onDecide={(action) =>
                            onDecide("submissions", row.id, action)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </AdminSection>
  );
}
