import { Badge } from "@aidr/ui";
import { anyrouterModelUrl } from "../../lib/anyrouter";
import { formatTokens } from "../../lib/format";
import type { LlmCallRow } from "../../lib/system-queries";
import { formatMs } from "./run-format";

export function RunAttemptRows({ attempts }: { attempts: LlmCallRow[] }) {
  if (attempts.length === 0) {
    return <p className="text-xs text-muted-foreground">No LLM call detail.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-muted/30">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">Task</th>
            <th className="px-2 py-1.5 font-medium">Model</th>
            <th className="px-2 py-1.5 font-medium">OK</th>
            <th className="px-2 py-1.5 text-right font-medium">Tokens</th>
            <th className="px-2 py-1.5 text-right font-medium">Prompt</th>
            <th className="px-2 py-1.5 text-right font-medium">Out</th>
            <th className="px-2 py-1.5 text-right font-medium">Cached</th>
            <th className="px-2 py-1.5 text-right font-medium">Time</th>
            <th className="px-2 py-1.5 font-medium">Error</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((call, i) => (
            <tr
              key={`${call.ts}-${call.model}-${i}`}
              className="border-b border-border/60 last:border-0"
            >
              <td className="px-2 py-1.5">
                <Badge variant="outline" className="text-[10px] font-normal">
                  {call.task}
                </Badge>
              </td>
              <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono text-[11px]">
                <a
                  href={anyrouterModelUrl(call.model)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline-offset-2 hover:text-accent hover:underline"
                  title={call.model}
                >
                  {call.model}
                </a>
              </td>
              <td className="px-2 py-1.5">
                <Badge
                  variant={call.ok ? "secondary" : "destructive"}
                  className={`text-[10px] ${
                    call.ok
                      ? "border-transparent bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                      : ""
                  }`}
                >
                  {call.ok ? "ok" : "fail"}
                </Badge>
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {call.tokens ? formatTokens(call.tokens) : "—"}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                {call.promptTokens != null
                  ? formatTokens(call.promptTokens)
                  : "—"}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                {call.completionTokens != null
                  ? formatTokens(call.completionTokens)
                  : "—"}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {call.cachedTokens != null && call.cachedTokens > 0 ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {formatTokens(call.cachedTokens)}
                  </span>
                ) : call.cachedTokens === 0 ? (
                  "0"
                ) : (
                  "—"
                )}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {formatMs(call.durationMs)}
              </td>
              <td
                className="max-w-[10rem] truncate px-2 py-1.5 text-muted-foreground"
                title={call.error ?? undefined}
              >
                {call.error ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
