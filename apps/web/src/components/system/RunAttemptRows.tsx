import { anyrouterModelUrl, isValidAnyrouterModel } from "../../lib/anyrouter";
import { formatTokens } from "../../lib/format";
import type { LlmCallRow } from "../../lib/system-queries";
import { formatMs, formatSafeDetail, formatSafeError } from "./run-format";

const COPY = {
  en: {
    calls: "calls",
    ok: "ok",
    failed: "failed",
    via: "via",
    tokens: "tok",
    in: "in",
    out: "out",
    cached: "cached",
    routeTitle: "Requested id, then the model it resolved to",
    empty: "No LLM call detail.",
  },
  vi: {
    calls: "lần gọi",
    ok: "thành công",
    failed: "lỗi",
    via: "qua",
    tokens: "token",
    in: "vào",
    out: "ra",
    cached: "đệm",
    routeTitle: "Mô hình được yêu cầu, rồi mô hình thực sự chạy",
    empty: "Chưa có chi tiết lần gọi LLM.",
  },
} as const;

function ModelHop({ id }: { id: string }) {
  const label = formatSafeDetail(id, 160);
  if (!isValidAnyrouterModel(id)) return <span title={label}>{label}</span>;
  return (
    <a
      href={anyrouterModelUrl(id)}
      target="_blank"
      rel="noopener noreferrer"
      className="underline-offset-2 hover:text-accent hover:underline"
      title={label}
    >
      {label}
    </a>
  );
}

/** `@preset/aidr → x/y → x/y:free`. Rows from before the route column
 *  show the requested model alone. */
function Route({ call, title }: { call: LlmCallRow; title: string }) {
  const route = call.route?.length ? call.route : [call.model];
  return (
    <span
      className="flex min-w-0 flex-wrap items-center gap-x-1 font-mono text-[11px]"
      title={title}
    >
      {route.map((hop, i) => (
        <span key={`${hop}-${i}`} className="flex items-center gap-x-1">
          {i > 0 ? (
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
          ) : null}
          <span
            className={
              i === 0 && route.length > 1
                ? "text-muted-foreground"
                : "text-foreground"
            }
          >
            <ModelHop id={hop} />
          </span>
        </span>
      ))}
    </span>
  );
}

function tokenOrDash(value: number | null): string {
  return value != null ? formatTokens(value) : "—";
}

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
  const okCount = attempts.filter((call) => call.ok).length;
  const failCount = attempts.length - okCount;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {attempts.length} {copy.calls} ·{" "}
        <span className="text-emerald-700 dark:text-emerald-400">
          {okCount} {copy.ok}
        </span>
        {failCount > 0 ? (
          <>
            {" "}
            ·{" "}
            <span className="text-destructive">
              {failCount} {copy.failed}
            </span>
          </>
        ) : null}
      </p>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-md border border-border bg-muted/30">
        {attempts.map((call, i) => (
          <li
            key={`${call.ts}-${call.model}-${i}`}
            className={`grid grid-cols-[auto_1fr_auto] items-start gap-x-2 gap-y-0.5 px-3 py-2 text-xs ${
              call.ok ? "" : "bg-destructive/5"
            }`}
          >
            <span
              aria-label={call.ok ? copy.ok : copy.failed}
              className={`mt-1 size-2 shrink-0 rounded-full ${
                call.ok ? "bg-emerald-500" : "bg-destructive"
              }`}
            />
            <div className="min-w-0 space-y-0.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">
                  {formatSafeDetail(call.task, 80)}
                </span>
                <Route call={call} title={copy.routeTitle} />
                {call.provider ? (
                  <span className="text-[10px] text-muted-foreground">
                    {copy.via} {formatSafeDetail(call.provider, 120)}
                  </span>
                ) : null}
              </div>
              {call.ok ? (
                <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {copy.in} {tokenOrDash(call.promptTokens)} · {copy.out}{" "}
                  {tokenOrDash(call.completionTokens)}
                  {call.cachedTokens != null && call.cachedTokens > 0 ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {" "}
                      · {copy.cached} {formatTokens(call.cachedTokens)}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="break-words text-[11px] text-destructive">
                  {formatSafeError(call.error)}
                  {call.errorCode ? (
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                      {call.errorCode}
                    </span>
                  ) : null}
                  {call.errorStatus ? (
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                      HTTP {call.errorStatus}
                    </span>
                  ) : null}
                </p>
              )}
            </div>
            <div className="text-right font-mono tabular-nums">
              <div>{formatMs(call.durationMs)}</div>
              <div className="text-[10px] text-muted-foreground">
                {call.tokens === 0 ? "0" : formatTokens(call.tokens)}{" "}
                {copy.tokens}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
