import { Badge } from "@aidr/ui";
import { anyrouterModelUrl, isValidAnyrouterModel } from "../../lib/anyrouter";
import { formatTokens } from "../../lib/format";
import type { LlmCallRow } from "../../lib/system-queries";
import { formatMs, formatSafeDetail, formatSafeError } from "./run-format";

const COPY = {
  en: {
    task: "Task",
    model: "Model",
    ok: "OK",
    tokens: "Tokens",
    prompt: "Input",
    out: "Output",
    cached: "Cached",
    time: "Time",
    error: "Error",
    empty: "No LLM call detail.",
  },
  vi: {
    task: "Tác vụ",
    model: "Mô hình",
    ok: "OK",
    tokens: "Token",
    prompt: "Đầu vào",
    out: "Đầu ra",
    cached: "Đệm",
    time: "Thời gian",
    error: "Lỗi",
    empty: "Chưa có chi tiết lần gọi LLM.",
  },
} as const;

export function RunAttemptRows({
  attempts,
  lang = "en",
}: {
  attempts: LlmCallRow[];
  lang?: "en" | "vi";
}) {
  const copy = COPY[lang];
  if (attempts.length === 0) {
    return <p className="text-xs text-muted-foreground">{copy.empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-muted/30">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">{copy.task}</th>
            <th className="px-2 py-1.5 font-medium">{copy.model}</th>
            <th className="px-2 py-1.5 font-medium">{copy.ok}</th>
            <th className="px-2 py-1.5 text-right font-medium">
              {copy.tokens}
            </th>
            <th className="px-2 py-1.5 text-right font-medium">
              {copy.prompt}
            </th>
            <th className="px-2 py-1.5 text-right font-medium">{copy.out}</th>
            <th className="px-2 py-1.5 text-right font-medium">
              {copy.cached}
            </th>
            <th className="px-2 py-1.5 text-right font-medium">{copy.time}</th>
            <th className="px-2 py-1.5 font-medium">{copy.error}</th>
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
                  {formatSafeDetail(call.task, 80)}
                </Badge>
              </td>
              <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono text-[11px]">
                {isValidAnyrouterModel(call.model) ? (
                  <a
                    href={anyrouterModelUrl(call.model)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline-offset-2 hover:text-accent hover:underline"
                    title={formatSafeDetail(call.model, 160)}
                  >
                    {formatSafeDetail(call.model, 160)}
                  </a>
                ) : (
                  <span title={formatSafeDetail(call.model, 160)}>
                    {formatSafeDetail(call.model, 160)}
                  </span>
                )}
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
                  {call.ok ? copy.ok : lang === "vi" ? "Lỗi" : "Fail"}
                </Badge>
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {formatSafeDetail(
                  call.tokens === 0 ? "0" : formatTokens(call.tokens)
                )}
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
                title={formatSafeError(call.error)}
              >
                <span>{formatSafeError(call.error)}</span>
                {call.errorCode ? (
                  <span className="ml-1 font-mono text-[10px]">
                    {call.errorCode}
                  </span>
                ) : null}
                {call.errorStatus ? (
                  <span className="ml-1 font-mono text-[10px]">
                    HTTP {call.errorStatus}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
