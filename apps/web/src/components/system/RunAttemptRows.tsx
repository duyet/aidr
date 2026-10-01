import { anyrouterModelUrl, isValidAnyrouterModel } from "../../lib/anyrouter";
import { formatTokens } from "../../lib/format";
import type { LlmCallRow } from "../../lib/system-queries";
import {
  type ChainAttempt,
  formatCostUsd,
  formatMs,
  formatSafeDetail,
  formatSafeError,
  groupChainCalls,
} from "./run-format";

const COPY = {
  en: {
    calls: "calls",
    attempts: "attempts",
    fellBack: "fell back",
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
    attempts: "lượt thử",
    fellBack: "chuyển dự phòng",
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

/** One hop of a chain call: the requested id, what it resolved to (the
 *  last route hop), its status, time, and the error code when it failed. */
function Hop({ hop }: { hop: ChainAttempt }) {
  const route = hop.route?.length ? hop.route : [hop.model];
  const resolved = route.length > 1 ? route[route.length - 1] : null;
  const error = hop.ok ? null : formatSafeError(hop.error);
  return (
    <span
      className={`inline-flex min-w-0 flex-wrap items-center gap-x-1 rounded border px-1.5 py-0.5 font-mono text-[11px] ${
        hop.ok
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-destructive/40 bg-destructive/5"
      }`}
      title={[route.join(" → "), hop.provider, error]
        .filter(Boolean)
        .join(" · ")}
    >
      <span
        aria-hidden
        className={hop.ok ? "text-emerald-600" : "text-destructive"}
      >
        {hop.ok ? "✓" : "✕"}
      </span>
      <ModelHop id={hop.model} />
      {resolved ? (
        <span className="text-muted-foreground">
          → <ModelHop id={resolved} />
        </span>
      ) : null}
      {hop.provider ? (
        <span className="font-sans text-[10px] text-muted-foreground">
          via {formatSafeDetail(hop.provider, 60)}
        </span>
      ) : null}
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {formatMs(hop.durationMs)}
      </span>
      {!hop.ok && (hop.errorCode || hop.errorStatus) ? (
        <span className="text-[10px] text-destructive">
          {hop.errorStatus ?? hop.errorCode}
        </span>
      ) : null}
    </span>
  );
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
  const calls = groupChainCalls(attempts as ChainAttempt[]);
  const okCalls = calls.filter((call) => call.ok).length;
  const failedCalls = calls.length - okCalls;
  const failedHops = attempts.filter((a) => !a.ok).length;
  const totalCost = calls.reduce<number | null>(
    (sum, call) => (call.costUsd === null ? sum : (sum ?? 0) + call.costUsd),
    null
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {calls.length} {copy.calls} ·{" "}
        <span className="text-emerald-700 dark:text-emerald-400">
          {okCalls} {copy.ok}
        </span>
        {failedCalls > 0 ? (
          <>
            {" "}
            ·{" "}
            <span className="text-destructive">
              {failedCalls} {copy.failed}
            </span>
          </>
        ) : null}
        {" · "}
        {attempts.length} {copy.attempts}
        {failedHops > 0 ? ` (${failedHops} ${copy.fellBack})` : ""}
        {totalCost !== null ? ` · ${formatCostUsd(totalCost)}` : ""}
      </p>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-md border border-border bg-muted/30">
        {calls.map((call) => (
          <li
            key={call.key}
            className={`grid grid-cols-[auto_1fr_auto] items-start gap-x-2 px-3 py-2 text-xs ${
              call.ok ? "" : "bg-destructive/5"
            }`}
          >
            <span
              aria-label={call.ok ? copy.ok : copy.failed}
              className={`mt-1.5 size-2 shrink-0 rounded-full ${
                call.ok ? "bg-emerald-500" : "bg-destructive"
              }`}
            />
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <span className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">
                {formatSafeDetail(call.task, 80)}
              </span>
              {call.hops.map((hop, i) => (
                <span
                  key={`${hop.ts}-${hop.model}-${i}`}
                  className="flex min-w-0 items-center gap-1"
                >
                  {i > 0 ? (
                    <span aria-hidden className="text-muted-foreground">
                      →
                    </span>
                  ) : null}
                  <Hop hop={hop} />
                </span>
              ))}
              {call.ok ? null : (
                <p className="w-full break-words text-[11px] text-destructive">
                  {formatSafeError(call.hops[call.hops.length - 1]?.error)}
                </p>
              )}
            </div>
            <div className="text-right font-mono tabular-nums">
              <div>{formatMs(call.durationMs)}</div>
              <div className="text-[10px] text-muted-foreground">
                {call.tokens === 0 ? "0" : formatTokens(call.tokens)}{" "}
                {copy.tokens}
                {call.costUsd !== null
                  ? ` · ${formatCostUsd(call.costUsd)}`
                  : ""}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
