import { AdminSection } from "./AdminSection";
import type { LlmCall } from "./lib";

export function AdminLlmCalls({ calls }: { calls: LlmCall[] }) {
  return (
    <AdminSection title="LLM calls">
      {calls.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No calls loaded.</p>
      ) : (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1 pr-2 font-normal">ts</th>
                <th className="py-1 pr-2 font-normal">task</th>
                <th className="py-1 pr-2 font-normal">model</th>
                <th className="py-1 pr-2 font-normal">ok</th>
                <th className="py-1 pr-2 font-normal text-right tabular-nums">
                  tokens
                </th>
                <th className="py-1 pr-2 font-normal text-right tabular-nums">
                  cached
                </th>
                <th className="py-1 pr-2 font-normal text-right tabular-nums">
                  duration
                </th>
                <th className="py-1 pr-2 font-normal">error/snippet</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call, i) => (
                <tr
                  key={`${call.ts}-${i}`}
                  className="border-b border-border/50 align-top"
                >
                  <td className="py-1 pr-2 whitespace-nowrap tabular-nums text-muted-foreground">
                    {call.ts}
                  </td>
                  <td className="py-1 pr-2">{call.task}</td>
                  <td className="py-1 pr-2 font-mono">{call.model}</td>
                  <td className="py-1 pr-2">
                    <span
                      className={
                        call.ok
                          ? "rounded bg-green-500/15 px-1.5 py-0.5 text-green-600 dark:text-green-400"
                          : "rounded bg-red-500/15 px-1.5 py-0.5 text-red-600 dark:text-red-400"
                      }
                    >
                      {call.ok ? "ok" : "fail"}
                    </span>
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {call.tokens ?? "—"}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {call.cached_tokens != null ? call.cached_tokens : "—"}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {call.duration_ms != null ? `${call.duration_ms}ms` : "—"}
                  </td>
                  <td className="py-1 pr-2">
                    {call.error || call.response_snippet ? (
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">
                          {call.error ? "error" : "snippet"}
                        </summary>
                        <pre className="mt-1 max-w-xs overflow-auto whitespace-pre-wrap text-muted-foreground">
                          {call.error ?? call.response_snippet}
                        </pre>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminSection>
  );
}
